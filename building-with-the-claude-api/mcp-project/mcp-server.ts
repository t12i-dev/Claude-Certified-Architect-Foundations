import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

// IMPORTANT: with the stdio transport, stdout carries the protocol messages themselves.
// Never console.log in a stdio server (it would corrupt them): use console.error for logs.
console.error(`DocumentMCP starting with ${Object.keys(docs).length} documents`);

await server.connect(new StdioServerTransport());
