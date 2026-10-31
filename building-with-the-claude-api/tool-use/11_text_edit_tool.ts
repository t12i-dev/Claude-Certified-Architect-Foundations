import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addUserMessage, model, type Message } from "../lib.js";
import { runConversation } from "./conversation.js";
import {
    TEXT_EDITOR_NAMES,
    createTextEditor,
    getTextEditorTool,
} from "./text-editor.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Fresh sandbox on every run, so results are reproducible.
// Do NOT keep anything important in tool-use/workspace: it is wiped each time.
const WORKSPACE = here("workspace");
rmSync(WORKSPACE, { recursive: true, force: true });
mkdirSync(WORKSPACE, { recursive: true });
writeFileSync(
    path.join(WORKSPACE, "main.js"),
    "// Math helpers\nexport function calculatePi() {\n  // TODO\n}\n",
);

// The model's file operations are executed by OUR code, confined to WORKSPACE
const editor = createTextEditor(WORKSPACE);

const router = (name: string, input: unknown): unknown => {
    if (TEXT_EDITOR_NAMES.includes(name)) return editor(input);
    throw new Error(`Unknown tool: ${name}`);
};

// Usage: npx tsx tool-use/11_text_edit_tool.ts "your request"
const question =
    process.argv[2] ??
    "Open main.js and implement calculatePi() so it returns pi rounded to 5 decimal places. " +
    "Then create test.js that imports it and checks the result with node:assert.";

const messages: Message[] = [];
addUserMessage(messages, question);

const { finalText } = await runConversation(messages, {
    tools: [getTextEditorTool(model)],
    router,
    system:
        'You are working inside a small project workspace. All file paths are relative to the workspace root, for example "main.js".',
});

console.log(`\nFinal answer: ${finalText}`);

console.log("\n=== Workspace after the conversation ===");
for (const name of readdirSync(WORKSPACE)) {
    console.log(`\n--- ${name} ---`);
    console.log(readFileSync(path.join(WORKSPACE, name), "utf-8"));
}
console.log("Review the files first, then run them yourself: node tool-use/workspace/test.js");
