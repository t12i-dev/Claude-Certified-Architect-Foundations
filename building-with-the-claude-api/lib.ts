import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load .env from the project root no matter which folder the script runs from
config({ path: fileURLToPath(new URL("./.env", import.meta.url)) });

export const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Fast/cheap model is enough for these exercises
export const model = "claude-haiku-4-5-20251001";

export type Message = Anthropic.MessageParam;

// A message's content is either a plain string or a list of blocks
// (text, tool_use, tool_result, ...)
type Content = Anthropic.MessageParam["content"];

export type ChatOptions = {
    system?: string;
    temperature?: number;
    stopSequences?: string[];
    tools?: Anthropic.Tool[];
};

export function addUserMessage(messages: Message[], content: Content) {
    messages.push({ role: "user", content });
}

// Pass response.content (ALL blocks) here when tools are in play, not just the text
export function addAssistantMessage(messages: Message[], content: Content) {
    messages.push({ role: "assistant", content });
}

// Returns the full response: stop_reason, usage and every content block
export async function chatRaw(
    messages: Message[],
    { system, temperature = 1.0, stopSequences, tools }: ChatOptions = {},
): Promise<Anthropic.Message> {
    // undefined fields are dropped by JSON.stringify, so optional params are safe
    return client.messages.create({
        model,
        max_tokens: 2000, // meal plans are long; 1000 would truncate them
        messages,
        temperature,
        system,
        stop_sequences: stopSequences,
        tools,
    });
}

// Joins all text blocks of a response
export function textFromMessage(message: Anthropic.Message): string {
    const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

    if (!text) {
        throw new Error(
            `No text block in response (stop_reason: ${message.stop_reason})`,
        );
    }
    return text;
}

// Convenience wrapper: same behavior as before, returns just the text
export async function chat(
    messages: Message[],
    options: ChatOptions = {},
): Promise<string> {
    return textFromMessage(await chatRaw(messages, options));
}
