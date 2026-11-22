import { parseCommand, usage, type PromptInfo } from "./commands.js";
import { toClaudeMessages } from "./mcp-client.js";

const prompts: PromptInfo[] = [{ name: "format", arguments: [{ name: "doc_id", required: true }] }];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let failures = 0;
function expect(label: string, condition: boolean) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

expect("usage shows required arguments", usage(prompts[0]) === "/format <doc_id>");
expect(
    "parses a command with its argument",
    same(parseCommand("/format plan.md", prompts), { ok: true, name: "format", args: { doc_id: "plan.md" } }),
);
expect(
    "tolerates extra spaces",
    same(parseCommand("/format    plan.md", prompts), { ok: true, name: "format", args: { doc_id: "plan.md" } }),
);

const missing = parseCommand("/format", prompts);
expect("missing argument is reported", !missing.ok && missing.error.includes("doc_id"));
const unknown = parseCommand("/nope x", prompts);
expect("unknown command lists the available ones", !unknown.ok && unknown.error.includes("/format <doc_id>"));
const tooMany = parseCommand("/format a b", prompts);
expect("too many arguments is reported", !tooMany.ok && tooMany.error.includes("Too many"));

expect(
    "text message -> Claude message with a block list",
    same(toClaudeMessages([{ role: "user", content: { type: "text", text: "hi" } }] as never), [
        { role: "user", content: [{ type: "text", text: "hi" }] },
    ]),
);
expect(
    "embedded text resource keeps its content and uri",
    same(
        toClaudeMessages([
            { role: "user", content: { type: "resource", resource: { uri: "docs://documents/plan.md", text: "T" } } },
        ] as never),
        [{ role: "user", content: [{ type: "text", text: '<resource uri="docs://documents/plan.md">\nT\n</resource>' }] }],
    ),
);

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
