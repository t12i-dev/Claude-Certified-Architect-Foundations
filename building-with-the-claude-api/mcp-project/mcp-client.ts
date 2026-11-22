import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult, GetPromptResult, Prompt, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef } from "../lib.js";

// Wraps the SDK client so the rest of the app never touches connection details
// and the child process is always cleaned up via close()
export class MCPClient {
    private readonly client = new Client({ name: "cli-chat", version: "1.0.0" });
    private readonly transport: StdioClientTransport;
    private connected = false;

    constructor(command: string, args: string[] = []) {
        this.transport = new StdioClientTransport({ command, args });
    }

    async connect(): Promise<this> {
        await this.client.connect(this.transport);
        this.connected = true;
        return this;
    }

    async listTools(): Promise<Tool[]> {
        this.assertConnected();
        const tools: Tool[] = [];
        let cursor: string | undefined;
        do {
            // Servers may return tools in pages
            const page = await this.client.listTools({ cursor });
            tools.push(...page.tools);
            cursor = page.nextCursor;
        } while (cursor);
        return tools;
    }

    async callTool(name: string, input: Record<string, unknown>): Promise<CallToolResult> {
        this.assertConnected();
        return (await this.client.callTool({ name, arguments: input })) as CallToolResult;
    }

    // Reads one resource and parses it by MIME type: JSON -> object, anything else -> string.
    // A failure (unknown URI, server error) rejects: resources have no isError.
    async readResource(uri: string): Promise<unknown> {
        this.assertConnected();
        const { contents } = await this.client.readResource({ uri });
        const item = contents[0] as { text?: string; mimeType?: string } | undefined;
        if (!item) throw new Error(`Resource ${uri} returned no contents`);
        if (typeof item.text !== "string") {
            throw new Error(`Resource ${uri} is binary (${item.mimeType ?? "unknown type"}): not supported here`);
        }
        return item.mimeType === "application/json" ? JSON.parse(item.text) : item.text;
    }

    async listPrompts(): Promise<Prompt[]> {
        this.assertConnected();
        const prompts: Prompt[] = [];
        let cursor: string | undefined;
        do {
            const page = await this.client.listPrompts({ cursor });
            prompts.push(...page.prompts);
            cursor = page.nextCursor;
        } while (cursor);
        return prompts;
    }

    // Prompt arguments are always strings in MCP. A failure (unknown prompt, server error) rejects.
    async getPrompt(name: string, args: Record<string, string>): Promise<GetPromptResult["messages"]> {
        this.assertConnected();
        const { messages } = await this.client.getPrompt({ name, arguments: args });
        return messages;
    }

    async close(): Promise<void> {
        if (!this.connected) return;
        this.connected = false;
        await this.client.close();
    }

    private assertConnected(): void {
        if (!this.connected) throw new Error("MCPClient is not connected: call connect() first");
    }
}

// MCP tool -> Claude tool. Both use JSON Schema: only the field name differs.
export function toClaudeTool(tool: Tool): ToolDef {
    const { $schema: _ignored, ...schema } = tool.inputSchema as Record<string, unknown>;
    return {
        name: tool.name,
        description: tool.description ?? "",
        input_schema: { type: "object", ...schema } as Anthropic.Tool.InputSchema,
    };
}

// MCP tool result content -> tool_result content (text and images; anything else as JSON text)
export function toToolResultContent(
    result: CallToolResult,
): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> {
    const blocks = (result.content ?? []).map(
        (block): Anthropic.TextBlockParam | Anthropic.ImageBlockParam => {
            if (block.type === "text") return { type: "text", text: block.text };
            if (block.type === "image") {
                return {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: block.mimeType as Anthropic.Base64ImageSource["media_type"],
                        data: block.data,
                    },
                };
            }
            return { type: "text", text: JSON.stringify(block) };
        },
    );
    // An empty tool_result is awkward for the model: say so explicitly
    return blocks.length > 0 ? blocks : [{ type: "text", text: "(the tool returned no output)" }];
}

// Thin helper kept for the check-*.ts scripts: returns the raw SDK client
export async function connectStdio(command: string, args: string[]): Promise<Client> {
    const client = new Client({ name: "cli-chat", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command, args }));
    return client;
}

// MCP prompt messages -> Claude messages. Text stays text, an embedded text resource is wrapped
// in a tagged block that keeps its uri, images pass through; anything else becomes JSON text.
export function toClaudeMessages(
    messages: GetPromptResult["messages"],
): Anthropic.MessageParam[] {
    return messages.map((m) => {
        const c = m.content;
        let block: Anthropic.TextBlockParam | Anthropic.ImageBlockParam;
        if (c.type === "text") {
            block = { type: "text", text: c.text };
        } else if (c.type === "image") {
            block = {
                type: "image",
                source: {
                    type: "base64",
                    media_type: c.mimeType as Anthropic.Base64ImageSource["media_type"],
                    data: c.data,
                },
            };
        } else if (c.type === "resource" && "text" in c.resource) {
            block = { type: "text", text: `<resource uri="${c.resource.uri}">\n${c.resource.text}\n</resource>` };
        } else {
            block = { type: "text", text: JSON.stringify(c) };
        }
        return { role: m.role, content: [block] };
    });
}
