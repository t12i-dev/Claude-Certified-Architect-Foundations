import { fileURLToPath } from "node:url";
import { connectStdio } from "./mcp-client.js";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const client = await connectStdio("npx", ["tsx", serverPath]);

type Block = { type: string; text?: string };

async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const blocks = (result.content as Block[] | undefined) ?? [];
    const text = blocks.map((b) => b.text ?? "").join("");
    const isError = Boolean(result.isError);
    console.log(`${name}(${JSON.stringify(args)}) -> ${isError ? "ERROR: " : ""}${text}`);
    return { isError, text };
}

let failures = 0;
function expect(label: string, condition: boolean) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

try {
    // What Claude will see: names, descriptions and JSON schemas generated from zod
    const { tools } = await client.listTools();
    console.log(JSON.stringify(tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema })), null, 2));
    expect("server lists exactly 2 tools", tools.length === 2);

    const read = await call("read_doc_contents", { doc_id: "plan.md" });
    expect("read returns the document text", read.text === "The plan outlines the steps for the project's implementation.");

    const missing = await call("read_doc_contents", { doc_id: "nope.txt" });
    expect("unknown doc is reported with isError", missing.isError);

    const edit = await call("edit_document", { doc_id: "plan.md", old_str: "steps", new_str: "phases" });
    expect("edit succeeds", !edit.isError);

    const after = await call("read_doc_contents", { doc_id: "plan.md" });
    expect("edit is visible on the next read", after.text.includes("phases"));

    const noMatch = await call("edit_document", { doc_id: "plan.md", old_str: "zzz", new_str: "x" });
    expect("text not found is an error (no silent no-op)", noMatch.isError);

    await call("edit_document", { doc_id: "plan.md", old_str: "phases", new_str: "$& and $1" });
    const dollar = await call("read_doc_contents", { doc_id: "plan.md" });
    expect("'$' patterns are inserted literally", dollar.text.includes("$& and $1"));

    // A call with a missing argument must never reach the handler
    let rejected = false;
    try {
        rejected = Boolean((await client.callTool({ name: "read_doc_contents", arguments: {} })).isError);
    } catch {
        rejected = true; // some SDK versions reject the promise instead of returning isError
    }
    expect("missing argument is rejected by schema validation", rejected);
} finally {
    await client.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
