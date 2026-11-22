import { fileURLToPath } from "node:url";
import { connectStdio } from "./mcp-client.js";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const client = await connectStdio("npx", ["tsx", serverPath]);

let failures = 0;
function expect(label: string, condition: boolean) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

try {
    console.log("capabilities:", Object.keys(client.getServerCapabilities() ?? {}));

    const { prompts } = await client.listPrompts();
    console.log(JSON.stringify(prompts, null, 2));
    const format = prompts.find((p) => p.name === "format");
    expect("prompt 'format' is listed", Boolean(format));
    expect(
        "it declares a required doc_id argument",
        format?.arguments?.some((a) => a.name === "doc_id" && a.required === true) === true,
    );

    const result = await client.getPrompt({ name: "format", arguments: { doc_id: "outlook.pdf" } });
    const message = result.messages[0];
    const content = message?.content as { type?: string; text?: string } | undefined;
    console.log("\n--- generated prompt ---\n" + (content?.text ?? "") + "\n------------------------\n");

    expect("returns exactly one user message", result.messages.length === 1 && message?.role === "user");
    expect("the document id is interpolated", content?.text?.includes("outlook.pdf") === true);
    expect(
        "the prompt names the server's own tools",
        Boolean(content?.text?.includes("read_doc_contents") && content?.text?.includes("edit_document")),
    );

    let unknownRejected = false;
    try {
        await client.getPrompt({ name: "format", arguments: { doc_id: "nope.txt" } });
    } catch {
        unknownRejected = true;
    }
    expect("unknown document is rejected before a prompt is built", unknownRejected);

    let missingRejected = false;
    try {
        await client.getPrompt({ name: "format", arguments: {} });
    } catch {
        missingRejected = true;
    }
    expect("missing argument is rejected by validation", missingRejected);
} finally {
    await client.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
