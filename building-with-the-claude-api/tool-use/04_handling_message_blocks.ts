import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    type Message,
} from "../lib.js";
import { getCurrentDatetime, getCurrentDatetimeSchema } from "./tools.js";

// 1. Send the question together with the tool schema
const messages: Message[] = [];
addUserMessage(messages, "What is the exact time, formatted as HH:MM:SS?");

const response = await chatRaw(messages, { tools: [getCurrentDatetimeSchema] });

console.log("stop_reason:", response.stop_reason);

// 2. content is a LIST of blocks: branch on block.type
for (const block of response.content) {
    if (block.type === "text") {
        console.log(`[text] ${block.text}`);
    } else if (block.type === "tool_use") {
        console.log(
            `[tool_use] id=${block.id} name=${block.name} input=${JSON.stringify(block.input)}`,
        );
    } else {
        console.log(`[${block.type}]`);
    }
}

// 3. Keep the WHOLE content (text + tool_use) in the history, not only the text.
//    The next request must contain the tool_use block so a tool_result can reference its id.
addAssistantMessage(messages, response.content);

console.log("\nHistory so far:");
for (const m of messages) {
    const kinds =
        typeof m.content === "string"
            ? "text"
            : m.content.map((b) => b.type).join(" + ");
    console.log(`  ${m.role}: ${kinds}`);
}

// Preview of the next lesson: run the requested tool(s) ourselves.
// Sending the result back to Claude is NOT done here yet.
const toolUses = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
);

if (toolUses.length === 0) {
    console.log("\nClaude answered without calling a tool this time.");
}

for (const toolUse of toolUses) {
    if (toolUse.name !== "get_current_datetime") {
        console.log(`\nUnknown tool requested: ${toolUse.name}`);
        continue;
    }

    // block.input is typed as unknown: it comes from the model, so check it first
    const { date_format } = toolUse.input as { date_format?: unknown };
    if (date_format !== undefined && typeof date_format !== "string") {
        console.log("\nInvalid input: date_format must be a string");
        continue;
    }

    try {
        // The schema property is date_format (snake_case); our function takes dateFormat
        console.log(`\nTool result (not sent yet): ${getCurrentDatetime(date_format)}`);
    } catch (err) {
        console.log(`\nTool error: ${(err as Error).message}`);
    }
}
