import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    textFromMessage,
    type Message,
} from "../lib.js";

const SYSTEM = "You are a helpful assistant. Answer concisely.";

const rl = createInterface({ input, output });
rl.on("close", () => process.exit(0)); // Ctrl+D

const messages: Message[] = [];
console.log('Baseline chat (no tools yet). Type "exit" to quit.');

while (true) {
    const line = (await rl.question("\n> ")).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit") break;

    addUserMessage(messages, line);
    try {
        const response = await chatRaw(messages, { system: SYSTEM });
        addAssistantMessage(messages, response.content); // keep ALL blocks

        // Tell the reader where the answer came from: the model alone, or a tool
        const toolNames = response.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
        console.log(`\n${textFromMessage(response)}`);
        console.log(
            toolNames.length > 0
                ? `[source: tools requested: ${toolNames.join(", ")}]`
                : "[source: the model alone, no tools involved]",
        );
    } catch (err) {
        messages.pop(); // drop the unanswered user message so the history stays consistent
        console.error(`Request failed: ${(err as Error).message}`);
    }
}

rl.close();
