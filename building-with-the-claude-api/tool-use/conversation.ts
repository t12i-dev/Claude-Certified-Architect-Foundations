import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    type Message,
    type ToolDef,
} from "../lib.js";
import { getCurrentDatetime, getCurrentDatetimeSchema } from "./tools.js";
import {
    addDurationToDatetime,
    addDurationToDatetimeSchema,
    setReminder,
    setReminderSchema,
} from "./reminder-tools.js";

// Maps a tool name + the model's input to a result. Throwing = "this call failed".
export type ToolRouter = (name: string, input: unknown) => unknown;

// The reminder project's tools. A new tool = function + schema, an entry here, a case below.
export const defaultTools: ToolDef[] = [
    getCurrentDatetimeSchema,
    addDurationToDatetimeSchema,
    setReminderSchema,
];

// The model's input is untrusted: read it as a plain object, then check each field
const asObject = (input: unknown): Record<string, unknown> =>
    typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {};

// Default router for the reminder project
export const runTool: ToolRouter = (name, input) => {
    const args = asObject(input);

    switch (name) {
        case "get_current_datetime": {
            const { date_format } = args;
            if (date_format !== undefined && typeof date_format !== "string") {
                throw new Error("date_format must be a string");
            }
            // The schema property is date_format; our function takes dateFormat
            return getCurrentDatetime(date_format);
        }

        case "add_duration_to_datetime": {
            const { datetime, duration, unit } = args;
            if (typeof datetime !== "string") throw new Error("datetime must be a string");
            if (typeof duration !== "number") throw new Error("duration must be a number");
            if (unit !== undefined && typeof unit !== "string") {
                throw new Error("unit must be a string");
            }
            return addDurationToDatetime(datetime, duration, unit);
        }

        case "set_reminder": {
            const { content, timestamp } = args;
            if (typeof content !== "string") throw new Error("content must be a string");
            if (typeof timestamp !== "string") throw new Error("timestamp must be a string");
            return setReminder(content, timestamp);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
};

// tool_result content must be a string: keep strings as they are, JSON-encode the rest
const serialize = (output: unknown): string =>
    typeof output === "string" ? output : JSON.stringify(output);

// Answer EVERY tool_use block with exactly one tool_result (matched by id).
// Failures still produce a result, flagged with is_error, so Claude can react.
export function runTools(
    message: Anthropic.Message,
    router: ToolRouter = runTool,
): Anthropic.ToolResultBlockParam[] {
    const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    return toolUses.map((toolUse): Anthropic.ToolResultBlockParam => {
        console.log(`  tool_use: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
        try {
            const content = serialize(router(toolUse.name, toolUse.input));
            const preview = content.length > 300 ? `${content.slice(0, 300)}...` : content;
            console.log(`  tool_result: ${preview}`);
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

type ConversationOptions = {
    tools?: ToolDef[]; // which tools Claude can see
    router?: ToolRouter; // how tool calls are executed
    system?: string;
    maxTurns?: number; // safety net only, NOT the stopping condition
};

// Keeps calling Claude until it stops asking for tools.
export async function runConversation(
    messages: Message[],
    {
        tools = defaultTools,
        router = runTool,
        system,
        maxTurns = 10,
    }: ConversationOptions = {},
): Promise<{ messages: Message[]; finalText: string }> {
    for (let turn = 1; turn <= maxTurns; turn++) {
        console.log(`\n[turn ${turn}] calling Claude...`);
        const response = await chatRaw(messages, { tools, system });
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

        const results = runTools(response, router);
        if (results.length === 0) {
            throw new Error("stop_reason is tool_use but no tool_use block was found");
        }
        addUserMessage(messages, results); // ALL results in ONE user message
    }

    throw new Error(`No final answer after ${maxTurns} turns`);
}
