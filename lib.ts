import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config"; // loads .env into process.env

export const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Fast/cheap model is enough for these exercises
export const model = "claude-haiku-4-5-20251001";

export type Message = Anthropic.MessageParam;

export type ChatOptions = {
    system?: string;
    temperature?: number;
    stopSequences?: string[];
};

export function addUserMessage(messages: Message[], text: string) {
    messages.push({ role: "user", content: text });
}

export function addAssistantMessage(messages: Message[], text: string) {
    messages.push({ role: "assistant", content: text });
}

export async function chat(
    messages: Message[],
    { system, temperature = 1.0, stopSequences }: ChatOptions = {},
): Promise<string> {
    // undefined fields are dropped by JSON.stringify, so optional params are safe
    const response = await client.messages.create({
        model,
        max_tokens: 1000,
        messages,
        temperature,
        system,
        stop_sequences: stopSequences,
    });

    // content is an array of blocks, so narrow the type before reading .text
    const block = response.content[0];
    if (block.type !== "text") {
        throw new Error(`Expected a text block, got: ${block.type}`);
    }
    return block.text;
}
