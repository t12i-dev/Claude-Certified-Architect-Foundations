import { fileURLToPath } from "node:url";
import { connectStdio } from "./mcp-client.js";

const serverPath = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));

// "npx tsx" runs the TypeScript server file directly
const client = await connectStdio("npx", ["tsx", serverPath]);

try {
    console.log("Connected to MCP server:", client.getServerVersion());

    // Capability negotiation: a server only offers what it has registered
    const capabilities = client.getServerCapabilities();
    console.log("Capabilities offered:", Object.keys(capabilities ?? {}));

    const tools = capabilities?.tools ? (await client.listTools()).tools : [];
    console.log(`Tools: ${tools.length}`, tools.map((t) => t.name));
} finally {
    await client.close();
}
