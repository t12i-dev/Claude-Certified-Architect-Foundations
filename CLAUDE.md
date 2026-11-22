# cca-foundations

Study project for the Claude Certified Architect exam. TypeScript (ESM), run with tsx.
Working folder: `building-with-the-claude-api/`.

## Commands (run from building-with-the-claude-api/)
- Run a script: `npx tsx <path>`
- Type-check: `npx tsc --noEmit`
- Chat with the MCP project: `npx tsx mcp-project/main.ts`
- Checks (no test framework): `npx tsx mcp-project/check-*.ts`; each prints PASS/FAIL and sets the exit code

## Conventions
- Imports use the `.js` extension (moduleResolution: Bundler), e.g. `import { chatRaw } from "../lib.js"`
- Shared helper is `lib.ts` (model, chatRaw, message helpers). Do not create a second copy.
- Secrets live in `.env`: never print or commit it.
- Code comments in English.

## MCP project (mcp-project/)
- `mcp-server.ts`: tools (model-controlled), resources (app-controlled), prompts (user-controlled)
- `mcp-client.ts` bridges MCP and the Messages API; pure logic lives in `mentions.ts` and `commands.ts`
- Tool failures use `isError`; resource failures throw
