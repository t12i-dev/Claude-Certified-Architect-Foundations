import { addUserMessage, type Message } from "../lib.js";
import { runConversation } from "./conversation.js";

// Usage: npx tsx tool-use/07_implementing_multiple_turns.ts "your question"
const question =
    process.argv[2] ??
    "What is the exact time, formatted as HH:MM:SS, and what day of the week is it?";

const messages: Message[] = [];
addUserMessage(messages, question);

const { finalText } = await runConversation(messages);

console.log(`\nFinal answer: ${finalText}`);

console.log("\nHistory:");
for (const m of messages) {
    const kinds =
        typeof m.content === "string"
            ? "text"
            : m.content.map((b) => b.type).join(" + ");
    console.log(`  ${m.role}: ${kinds}`);
}
