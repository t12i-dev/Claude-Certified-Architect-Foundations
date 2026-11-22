import { fileURLToPath } from "node:url";
import { connectStdio } from "./mcp-client.js";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const client = await connectStdio("npx", ["tsx", serverPath]);

type Item = { uri: string; mimeType?: string; text?: string };

async function read(uri: string): Promise<Item> {
    const { contents } = await client.readResource({ uri });
    return contents[0] as Item;
}

let failures = 0;
function expect(label: string, condition: boolean) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

try {
    console.log("capabilities:", Object.keys(client.getServerCapabilities() ?? {}));

    const { resources } = await client.listResources();
    console.log("resources:", resources.map((r) => r.uri));
    expect("direct resource docs://documents is listed", resources.some((r) => r.uri === "docs://documents"));

    const { resourceTemplates } = await client.listResourceTemplates();
    console.log("templates:", resourceTemplates.map((t) => t.uriTemplate));
    expect(
        "template docs://documents/{doc_id} is listed",
        resourceTemplates.some((t) => t.uriTemplate === "docs://documents/{doc_id}"),
    );

    const list = await read("docs://documents");
    const ids = JSON.parse(list.text ?? "[]") as string[];
    expect("list resource is JSON with 6 ids", list.mimeType === "application/json" && ids.length === 6);

    const doc = await read("docs://documents/report.pdf");
    expect(
        "template resource returns the document text as text/plain",
        doc.text === "The report details the state of a 20m condenser tower." && doc.mimeType === "text/plain",
    );

    let rejected = false;
    try {
        await read("docs://documents/nope.txt");
    } catch {
        rejected = true; // resources fail as protocol errors: the promise rejects
    }
    expect("unknown doc fails as a protocol error (no isError for resources)", rejected);
} finally {
    await client.close();
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
