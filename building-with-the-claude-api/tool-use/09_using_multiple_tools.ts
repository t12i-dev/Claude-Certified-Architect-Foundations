import { addUserMessage, type Message } from "../lib.js";
import { runConversation } from "./conversation.js";
import { getReminders } from "./reminder-tools.js";

// Usage: npx tsx tool-use/09_using_multiple_tools.ts "your request"
const question =
    process.argv[2] ??
    "Set a reminder for my doctors appointment. Its 177 days after Jan 1st, 2050.";

const messages: Message[] = [];
addUserMessage(messages, question);

const { finalText } = await runConversation(messages);

console.log(`\nFinal answer: ${finalText}`);
console.log("\nReminders stored:", JSON.stringify(getReminders(), null, 2));

console.log("\nHistory:");
for (const m of messages) {
    const kinds =
        typeof m.content === "string"
            ? "text"
            : m.content.map((b) => b.type).join(" + ");
    console.log(`  ${m.role}: ${kinds}`);
}
