---
paths:
  - "building-with-the-claude-api/mcp-project/mcp-server.ts"
---

# MCP server rules
- This server uses the stdio transport: stdout carries the protocol. Never use `console.log`; log with `console.error`.
- Tool failures return `{ isError: true, content: [...] }` with an actionable message; do not throw from tool handlers.
- Validate document ids with `Object.hasOwn(docs, id)` before indexing `docs`.
