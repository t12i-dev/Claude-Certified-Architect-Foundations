import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    textFromMessage,
    type Message,
} from "../lib.js";
import { getCurrentDatetime, getCurrentDatetimeSchema } from "./tools.js";

const tools = [getCurrentDatetimeSchema];

// Dispatch: tool name -> result string.
// Throwing is fine: the caller turns it into an is_error result for Claude to read.
function runTool(name: string, input: unknown): string {
    switch (name) {
        case "get_current_datetime": {
            // input comes from the model: treat it as untrusted and check it
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

// One tool_result per tool_use, matched by id
function runToolUses(
    toolUses: Anthropic.ToolUseBlock[],
): Anthropic.ToolResultBlockParam[] {
    return toolUses.map((toolUse): Anthropic.ToolResultBlockParam => {
        try {
            return {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: runTool(toolUse.name, toolUse.input), // must be a string
                is_error: false,
            };
        } catch (err) {
            return {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: (err as Error).message, // Claude can read this and adapt
                is_error: true,
            };
        }
    });
}

function printHistory(messages: Message[]) {
    console.log("\nHistory:");
    for (const m of messages) {
        const kinds =
            typeof m.content === "string"
                ? "text"
                : m.content.map((b) => b.type).join(" + ");
        console.log(`  ${m.role}: ${kinds}`);
    }
}

const messages: Message[] = [];
addUserMessage(messages, "What is the exact time, formatted as HH:MM:SS?");

// Request 1: Claude decides whether it needs the tool
const first = await chatRaw(messages, { tools });
addAssistantMessage(messages, first.content); // keep ALL blocks

const toolUses = first.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
);

if (first.stop_reason !== "tool_use" || toolUses.length === 0) {
    console.log("No tool call needed. Answer:", textFromMessage(first));
} else {
    // Run the tool(s) and send ALL results back in ONE user message
    const results = runToolUses(toolUses);
    console.log("Tool results:", JSON.stringify(results, null, 2));
    addUserMessage(messages, results);

    // Request 2: full history + tool_result. The schema must be sent again.
    const second = await chatRaw(messages, { tools });
    console.log("\nstop_reason:", second.stop_reason);

    if (second.stop_reason === "tool_use") {
        // E.g. Claude retries after an error: handling this needs a loop (next lessons)
        console.log("Claude asked for another tool call. That needs a loop.");
    } else {
        console.log("Final answer:", textFromMessage(second));
        addAssistantMessage(messages, second.content);
    }
}

printHistory(messages);
