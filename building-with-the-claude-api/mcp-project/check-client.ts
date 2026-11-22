import { fileURLToPath } from "node:url";
import { MCPClient, toClaudeMessages, toClaudeTool, toToolResultContent } from "./mcp-client.js";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
const mcp = await new MCPClient("npx", ["tsx", serverPath]).connect();

try {
    const tools = await mcp.listTools();
    console.log("MCP tools:", tools.map((t) => t.name));
    console.log("As Claude receives them:\n", JSON.stringify(tools.map(toClaudeTool), null, 2));

    const result = await mcp.callTool("read_doc_contents", { doc_id: "report.pdf" });
    console.log("tool_result content:", JSON.stringify(toToolResultContent(result)));

    // Resources: the client parses by MIME type (JSON -> object, text -> string)
    console.log("list resource (parsed JSON):", await mcp.readResource("docs://documents"));
    console.log("doc resource (plain text):", await mcp.readResource("docs://documents/report.pdf"));

    // Prompts: list them, then fetch one and convert it to Claude's message format
    const prompts = await mcp.listPrompts();
    console.log("prompts:", prompts.map((p) => p.name));
    const messages = toClaudeMessages(await mcp.getPrompt("format", { doc_id: "plan.md" }));
    console.log("format prompt as Claude messages:\n", JSON.stringify(messages, null, 2));
} finally {
    await mcp.close();
}
