import type Anthropic from "@anthropic-ai/sdk";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    textFromMessage,
    type Message,
} from "../lib.js";
import { MCPClient, toClaudeTool, toToolResultContent } from "./mcp-client.js";

const SYSTEM =
    "You are a document assistant. Use the available tools to read or edit documents " +
    "when the user asks about them, and never guess a document's contents.";
const MAX_TURNS = 10; // safety net only: the loop normally ends on stop_reason

// ---- Connect to the MCP server and fetch its tools once at startup ----
const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const mcp = await new MCPClient("npx", ["tsx", serverPath]).connect();
const tools = (await mcp.listTools()).map(toClaudeTool);
console.log(`Connected to MCP server. Tools: ${tools.map((t) => t.name).join(", ")}`);

// ---- Shutdown: always close the client so the server process does not linger ----
async function shutdown(code = 0): Promise<never> {
    await mcp.close().catch(() => { });
    process.exit(code);
}
const rl = createInterface({ input, output });
rl.on("close", () => void shutdown()); // "exit" command or Ctrl+D
process.on("SIGINT", () => void shutdown(130));

// ---- One tool call: MCP result -> tool_result ----
async function runTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);
    try {
        const result = await mcp.callTool(block.name, block.input as Record<string, unknown>);
        console.log(`  [tool] -> ${result.isError ? "error result" : "ok"}`);
        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: toToolResultContent(result),
            is_error: result.isError === true,
        };
    } catch (err) {
        // Transport or protocol failure: tell Claude instead of crashing the loop
        const message = (err as Error).message;
        console.log(`  [tool] -> failed: ${message}`);
        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool call failed: ${message}`,
            is_error: true,
        };
    }
}

// ---- The agentic loop: driven by stop_reason ----
async function answer(messages: Message[]): Promise<{ text: string; toolsUsed: string[] }> {
    const toolsUsed: string[] = [];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await chatRaw(messages, { system: SYSTEM, tools, maxTokens: 1000 });
        addAssistantMessage(messages, response.content); // keep ALL blocks (text + tool_use)

        if (response.stop_reason !== "tool_use") {
            return { text: textFromMessage(response), toolsUsed };
        }

        // One tool_result per tool_use, run sequentially (some tools write data)
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            toolsUsed.push(block.name);
            results.push(await runTool(block));
        }
        addUserMessage(messages, results);
    }
    throw new Error(`No final answer after ${MAX_TURNS} turns`);
}

// ---- CLI ----
const messages: Message[] = [];
console.log('Type a question, or "exit" to quit.');

while (true) {
    const line = (await rl.question("\n> ")).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit") break;

    const checkpoint = messages.length;
    addUserMessage(messages, line);
    try {
        const { text, toolsUsed } = await answer(messages);
        console.log(`\n${text}`);
        console.log(
            toolsUsed.length > 0
                ? `[source: MCP tools: ${toolsUsed.join(", ")}]`
                : "[source: the model alone, no tools involved]",
        );
    } catch (err) {
        messages.length = checkpoint; // drop the whole failed turn so the history stays valid
        console.error(`Request failed: ${(err as Error).message}`);
    }
}

rl.close(); // triggers shutdown()
