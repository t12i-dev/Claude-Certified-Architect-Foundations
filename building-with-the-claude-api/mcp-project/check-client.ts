import { fileURLToPath } from "node:url";
import { MCPClient, toClaudeTool, toToolResultContent } from "./mcp-client.js";

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
} finally {
    await mcp.close();
}
