import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    type Message,
} from "../lib.js";
import { getCurrentDatetime, getCurrentDatetimeSchema } from "./tools.js";

// Every tool the model may use. A new tool = a new schema here + a new case in runTool.
export const tools: Anthropic.Tool[] = [getCurrentDatetimeSchema];

// Router: tool name -> implementation. The conversation loop never changes
// when tools are added. Throwing means "this call failed": runTools reports
// it to Claude as an error result.
export function runTool(name: string, input: unknown): unknown {
    switch (name) {
        case "get_current_datetime": {
            // input comes from the model: treat it as untrusted
            const { date_format } = (input ?? {}) as { date_format?: unknown };
            if (date_format !== undefined && typeof date_format !== "string") {
                throw new Error("date_format must be a string");
            }
            // The schema property is date_format; our function takes dateFormat
            return getCurrentDatetime(date_format);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// tool_result content must be a string: keep strings as they are, JSON-encode the rest
const serialize = (output: unknown): string =>
    typeof output === "string" ? output : JSON.stringify(output);

// Answer EVERY tool_use block with exactly one tool_result (matched by id).
// Failures still produce a result, flagged with is_error, so Claude can react.
export function runTools(
    message: Anthropic.Message,
): Anthropic.ToolResultBlockParam[] {
    const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    return toolUses.map((toolUse): Anthropic.ToolResultBlockParam => {
        console.log(`  tool_use: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
        try {
            const content = serialize(runTool(toolUse.name, toolUse.input));
            console.log(`  tool_result: ${content}`);
            return { type: "tool_result", tool_use_id: toolUse.id, content, is_error: false };
        } catch (err) {
            const content = `Error: ${(err as Error).message}`;
            console.log(`  tool_result (error): ${content}`);
            return { type: "tool_result", tool_use_id: toolUse.id, content, is_error: true };
        }
    });
}

// Non-throwing text extraction: a tool_use-only response has no text block
const textOf = (message: Anthropic.Message): string =>
    message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

// Keeps calling Claude until it stops asking for tools.
// maxTurns is only a safety net, NOT the stopping condition (stop_reason is).
export async function runConversation(
    messages: Message[],
    { maxTurns = 10 }: { maxTurns?: number } = {},
): Promise<{ messages: Message[]; finalText: string }> {
    for (let turn = 1; turn <= maxTurns; turn++) {
        console.log(`\n[turn ${turn}] calling Claude...`);
        const response = await chatRaw(messages, { tools });
        addAssistantMessage(messages, response.content); // keep ALL blocks

        const text = textOf(response);
        if (text) console.log(`  text: ${text}`);

        // The loop is driven by stop_reason, never by parsing the text
        if (response.stop_reason !== "tool_use") {
            if (response.stop_reason === "max_tokens") {
                console.warn("  warning: response was cut off (max_tokens)");
            }
            return { messages, finalText: text };
        }

        const results = runTools(response);
        if (results.length === 0) {
            throw new Error("stop_reason is tool_use but no tool_use block was found");
        }
        addUserMessage(messages, results); // ALL results in ONE user message
    }

    throw new Error(`No final answer after ${maxTurns} turns`);
}
