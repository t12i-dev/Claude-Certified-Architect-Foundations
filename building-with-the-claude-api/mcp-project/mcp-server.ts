import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// In-memory "database": nothing is persisted, it resets whenever the server restarts
export const docs: Record<string, string> = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "financials.docx": "These financials outline the project's budget and expenditures.",
    "outlook.pdf": "This document presents the projected future performance of the system.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
    "spec.txt": "These specifications define the technical requirements for the equipment.",
};

const server = new McpServer({ name: "DocumentMCP", version: "1.0.0" });

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });

// Tool failures travel INSIDE the result (isError: true), not as protocol errors:
// Claude can read the message and recover (for example retry with a valid id)
const fail = (text: string): CallToolResult => ({
    isError: true,
    content: [{ type: "text", text }],
});

const notFound = (docId: string) =>
    fail(`Doc with id ${docId} not found. Available ids: ${Object.keys(docs).join(", ")}`);

// ---------- Tools: actions the MODEL decides to take ----------

server.registerTool(
    "read_doc_contents",
    {
        description: "Read the contents of a document and return it as a string.",
        inputSchema: {
            doc_id: z.string().describe("Id of the document to read"),
        },
    },
    async ({ doc_id }) => {
        // Object.hasOwn avoids false hits on inherited keys such as "constructor"
        if (!Object.hasOwn(docs, doc_id)) return notFound(doc_id);
        return ok(docs[doc_id]);
    },
);

server.registerTool(
    "edit_document",
    {
        description:
            "Edit a document by replacing a string in the document's content with a new string. " +
            "Replaces every occurrence and reports how many were replaced.",
        inputSchema: {
            doc_id: z.string().describe("Id of the document that will be edited"),
            old_str: z
                .string()
                .min(1)
                .describe("The text to replace. Must match exactly, including whitespace."),
            new_str: z.string().describe("The new text to insert in place of the old text."),
        },
    },
    async ({ doc_id, old_str, new_str }) => {
        if (!Object.hasOwn(docs, doc_id)) return notFound(doc_id);

        // split/join replaces ALL occurrences and treats new_str literally
        // (String.replace would replace only the first match and interpret "$&" and "$1")
        const parts = docs[doc_id].split(old_str);
        const count = parts.length - 1;
        if (count === 0) {
            return fail(`Text not found in ${doc_id}: nothing was changed. old_str must match exactly.`);
        }

        docs[doc_id] = parts.join(new_str);
        return ok(`Replaced ${count} occurrence(s) in ${doc_id}`);
    },
);

// ---------- Resources: data the APPLICATION fetches (like GET handlers) ----------

// Direct resource: a fixed URI with no parameters (feeds the @mention autocomplete)
server.registerResource(
    "list_docs",
    "docs://documents",
    {
        title: "Document list",
        description: "Ids of all available documents",
        mimeType: "application/json",
    },
    async (uri) => ({
        contents: [
            { uri: uri.href, mimeType: "application/json", text: JSON.stringify(Object.keys(docs)) },
        ],
    }),
);

// Templated resource: {doc_id} is parsed from the URI and arrives in `variables`.
// `list: undefined` = the template does not enumerate its children (list_docs does that).
server.registerResource(
    "fetch_doc",
    new ResourceTemplate("docs://documents/{doc_id}", { list: undefined }),
    {
        title: "Document contents",
        description: "The contents of a single document",
        mimeType: "text/plain",
    },
    async (uri, variables) => {
        const docId = Array.isArray(variables.doc_id) ? variables.doc_id[0] : variables.doc_id;
        // Resources have no isError: a failure here is a protocol error for the client app
        if (!Object.hasOwn(docs, docId)) throw new Error(`Doc with id ${docId} not found`);
        return { contents: [{ uri: uri.href, mimeType: "text/plain", text: docs[docId] }] };
    },
);

// ---------- Prompts: ready-made instructions the USER triggers (like a /format command) ----------

server.registerPrompt(
    "format",
    {
        title: "Format document",
        description: "Rewrites the contents of the document in Markdown format.",
        // Prompt arguments are always strings in MCP
        argsSchema: { doc_id: z.string().describe("Id of the document to format") },
    },
    ({ doc_id }) => {
        // Fail fast: no point building a prompt that is guaranteed to fail later
        // (and the argument never reaches the prompt text unless it is a real document id)
        if (!Object.hasOwn(docs, doc_id)) {
            throw new Error(`Doc with id ${doc_id} not found. Available ids: ${Object.keys(docs).join(", ")}`);
        }

        // The prompt is written around THIS server's tools: edit_document is find-and-replace,
        // so the model must read the document first and replace its complete original text.
        const prompt = `Your goal is to reformat a document so that it is written with Markdown syntax.

The id of the document you need to reformat is:
<document_id>
${doc_id}
</document_id>

Follow these steps:
1. Read the document with the 'read_doc_contents' tool.
2. Rewrite it in Markdown: add headers, bullet points, tables, etc. wherever they help.
   Preserve ALL of the original information and meaning: do not add facts and do not remove content.
3. Save the result with the 'edit_document' tool. Set old_str to the document's complete
   original text (it must match exactly) and new_str to the Markdown version.
4. When the tool reports success, reply with one short sentence confirming the document was
   reformatted. Do not paste the whole document again.`;

        return { messages: [{ role: "user", content: { type: "text", text: prompt } }] };
    },
);

// IMPORTANT: with the stdio transport, stdout carries the protocol messages themselves.
// Never console.log in a stdio server (it would corrupt them): use console.error for logs.
console.error(`DocumentMCP starting with ${Object.keys(docs).length} documents`);

await server.connect(new StdioServerTransport());
