import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

// The tools (read a document, edit a document) are added in the next lesson.

// IMPORTANT: with the stdio transport, stdout carries the protocol messages themselves.
// Never console.log in a stdio server (it would corrupt them): use console.error for logs.
console.error(`DocumentMCP starting with ${Object.keys(docs).length} documents`);

await server.connect(new StdioServerTransport());
