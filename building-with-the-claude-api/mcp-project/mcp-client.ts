import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Starts an MCP server as a child process and talks to it over stdin/stdout
export async function connectStdio(command: string, args: string[]): Promise<Client> {
    const client = new Client({ name: "cli-chat", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command, args }));
    return client;
}
