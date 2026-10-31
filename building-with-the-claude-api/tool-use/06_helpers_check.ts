import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    textFromMessage,
    type Message,
} from "../lib.js";

// A fake response with text + tool_use + text blocks (no API call needed)
const fake = {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "fake",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "toolu_fake", name: "get_current_datetime", input: {} },
        { type: "text", text: "One moment." },
    ],
} as unknown as Anthropic.Message;

// 1. textFromMessage joins every text block and ignores tool_use
assert.equal(textFromMessage(fake), "Let me check.\nOne moment.");

// 2. A message with no text block cannot be turned into text
const toolOnly = { ...fake, content: [fake.content[1]] } as Anthropic.Message;
assert.throws(() => textFromMessage(toolOnly));

// 3. Helpers keep ALL blocks, in order
const messages: Message[] = [];
addUserMessage(messages, "hello");
addAssistantMessage(messages, fake.content);
addUserMessage(messages, [
    { type: "tool_result", tool_use_id: "toolu_fake", content: "17:42:08", is_error: false },
]);

assert.equal(messages.length, 3);
assert.equal(typeof messages[0].content, "string");
assert.equal((messages[1].content as unknown[]).length, 3);
assert.equal((messages[2].content as { type: string }[])[0].type, "tool_result");

// 4. chatRaw exists (it is the one that returns the full response)
assert.equal(typeof chatRaw, "function");

console.log("All helper checks passed.");
