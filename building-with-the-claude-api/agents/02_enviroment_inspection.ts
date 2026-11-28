import { createHash } from "node:crypto";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    type Message,
    type ToolDef,
} from "../lib.js";

// Usage: npx tsx agents/02_environment_inspection.ts [runsPerVariant]
const parsed = Number(process.argv[2]);
const RUNS = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 6;
const MAX_TURNS = 8; // safety net: the loop normally ends on stop_reason
const CONCURRENCY = 3;

const PATH = "config.json";
const INITIAL = JSON.stringify(
    {
        service: "orders-api",
        http: { retries: 3, timeoutMs: 1000 },
        db: { host: "db.internal", retries: 3, poolSize: 10 },
        logLevel: "info",
    },
    null,
    2,
);
const TASK = "In config.json, set the HTTP retry count to 5. Leave every other setting as it is.";
// The same neutral prompt for every variant: it says nothing about inspecting or verifying
const SYSTEM = "You edit files in a small project using the tools. Complete the user's request.";

// ---------- A simulated file system (in memory, so nothing on your disk is touched) ----------
type State = { files: Map<string, string>; changed: boolean; rejected: number };

const versionOf = (content: string) => createHash("sha1").update(content).digest("hex").slice(0, 8);

// Another process edits the file: this is what makes a stale read dangerous
function concurrentChange(state: State): void {
    if (state.changed) return;
    state.changed = true;
    const config = JSON.parse(state.files.get(PATH) ?? "{}") as Record<string, unknown>;
    config.features = { beta: true };
    state.files.set(PATH, JSON.stringify(config, null, 2));
}

// ---------- Tools ----------
const readTool = {
    name: "read_file",
    description: "Read a file. Returns its content and a version id.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
} as ToolDef;

function writeTool(guarded: boolean): ToolDef {
    const properties: Record<string, unknown> = {
        path: { type: "string" },
        content: { type: "string", description: "The complete new content of the file" },
    };
    const required = ["path", "content"];
    if (guarded) {
        properties.expected_version = {
            type: "string",
            description: "The version id returned by read_file for the content your change is based on",
        };
        required.push("expected_version");
    }
    return {
        name: "write_file",
        description:
            "Overwrite a file with new content." + (guarded ? " Fails if the file changed since the version you pass." : ""),
        input_schema: { type: "object", properties, required },
    } as ToolDef;
}

type Variant = { name: string; tools: ToolDef[]; guarded: boolean };
const VARIANTS: Variant[] = [
    { name: "blind (write only)", tools: [writeTool(false)], guarded: false },
    { name: "can read, no guard", tools: [readTool, writeTool(false)], guarded: false },
    { name: "read + guarded write", tools: [readTool, writeTool(true)], guarded: true },
];

function execute(name: string, input: Record<string, unknown>, variant: Variant, state: State): string {
    if (String(input.path) !== PATH) throw new Error(`Unknown file: ${String(input.path)}. Only ${PATH} exists.`);

    if (name === "read_file") {
        const content = state.files.get(PATH) ?? "";
        const result = JSON.stringify({ content, version: versionOf(content) });
        concurrentChange(state); // someone else edits the file right after this read
        return result;
    }

    if (name === "write_file") {
        concurrentChange(state);
        const current = state.files.get(PATH) ?? "";
        if (variant.guarded && String(input.expected_version) !== versionOf(current)) {
            state.rejected++;
            throw new Error("The file changed since you read it. Read it again and apply your change to the latest content.");
        }
        state.files.set(PATH, String(input.content));
        return `Wrote ${String(input.content).length} characters`;
    }
    throw new Error(`Unknown tool: ${name}`);
}

// ---------- Checking the outcome with code ----------
type Cfg = {
    service?: string;
    http?: { retries?: number; timeoutMs?: number };
    db?: { host?: string; retries?: number; poolSize?: number };
    logLevel?: string;
    features?: { beta?: boolean };
};

function diagnose(raw: string): string[] {
    let config: Cfg;
    try {
        config = JSON.parse(raw) as Cfg;
    } catch {
        return ["file is not valid JSON"];
    }
    const problems: string[] = [];
    if (config.http?.retries !== 5) problems.push("http.retries is not 5");
    if (config.features?.beta !== true) problems.push("lost the concurrent change (features.beta)");
    const othersIntact =
        config.service === "orders-api" &&
        config.http?.timeoutMs === 1000 &&
        config.db?.host === "db.internal" &&
        config.db?.retries === 3 &&
        config.db?.poolSize === 10 &&
        config.logLevel === "info";
    if (!othersIntact) problems.push("lost or changed other settings");
    return problems;
}

// ---------- The agent loop ----------
async function runVariant(variant: Variant): Promise<{ problems: string[]; calls: number; rejected: number }> {
    const state: State = { files: new Map([[PATH, INITIAL]]), changed: false, rejected: 0 };
    const messages: Message[] = [];
    let calls = 0;
    addUserMessage(messages, TASK);

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        const response = await chatRaw(messages, { system: SYSTEM, tools: variant.tools });
        addAssistantMessage(messages, response.content);
        if (response.stop_reason !== "tool_use") break;

        const results: { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }[] = [];
        for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            calls++;
            try {
                const content = execute(block.name, block.input as Record<string, unknown>, variant, state);
                results.push({ type: "tool_result", tool_use_id: block.id, content, is_error: false });
            } catch (err) {
                results.push({ type: "tool_result", tool_use_id: block.id, content: (err as Error).message, is_error: true });
            }
        }
        addUserMessage(messages, results);
    }
    return { problems: diagnose(state.files.get(PATH) ?? ""), calls, rejected: state.rejected };
}

async function mapSettled<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            try {
                results[i] = { status: "fulfilled", value: await fn(items[i]) };
            } catch (reason) {
                results[i] = { status: "rejected", reason };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

console.log(`${RUNS} runs per variant\nTask: ${TASK}\n`);

const rows: Record<string, string | number>[] = [];
const frequent: Record<string, Map<string, number>> = {};

for (const variant of VARIANTS) {
    const settled = await mapSettled(Array.from({ length: RUNS }, () => 0), CONCURRENCY, () => runVariant(variant));

    let ok = 0;
    let success = 0;
    let errors = 0;
    let totalCalls = 0;
    let totalRejected = 0;
    const tally = new Map<string, number>();

    for (const result of settled) {
        if (result.status === "rejected") {
            errors++;
            continue;
        }
        ok++;
        totalCalls += result.value.calls;
        totalRejected += result.value.rejected;
        if (result.value.problems.length === 0) success++;
        for (const p of result.value.problems) tally.set(p, (tally.get(p) ?? 0) + 1);
    }

    rows.push({
        variant: variant.name,
        runs: ok,
        errors,
        success: `${success}/${ok}`,
        avgToolCalls: ok ? Number((totalCalls / ok).toFixed(1)) : 0,
        avgRejectedWrites: ok ? Number((totalRejected / ok).toFixed(1)) : 0,
    });
    frequent[variant.name] = tally;
}

console.table(rows);
for (const [name, tally] of Object.entries(frequent)) {
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} (${n})`).join("; ");
    console.log(`${name}: ${top || "no problems"}`);
}
