import { chat } from "../lib.js";

// Usage: npx tsx workflows/01_evaluator_optimizer.ts [maxWords]
// A tight limit (for example 18) makes the revision loop, or the escalation, easy to see
const parsed = Number(process.argv[2]);
const MAX_WORDS = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
const MAX_ITERATIONS = 4;

const CHANGES = [
    "Added retry with exponential backoff to the S3 uploader",
    "Fixed a bug where webhook signatures failed on payloads with unicode",
    "Dropped support for Node 16",
];
// Keywords the code check looks for: one per change
const REQUIRED_KEYWORDS = ["S3", "webhook", "Node 16"];

const PRODUCER_SYSTEM =
    "You write release notes for engineers: plain, factual, no marketing language. One paragraph.";
const GRADER_SYSTEM = `You are a strict reviewer of release notes.
Check ONLY these two things against the list of changes:
1. No invented facts: everything stated must be supported by the changes.
2. No marketing language (words like "exciting", "powerful", "seamless", "enhanced").
Reply with JSON only, no other text: {"accepted": boolean, "issues": string[]}
Each issue must be specific and say what to change.`;

const changesBlock = `<changes>\n${CHANGES.map((c) => `- ${c}`).join("\n")}\n</changes>`;

// ---------- Producer ----------
async function produce(previous?: { draft: string; issues: string[] }): Promise<string> {
    const task = `${changesBlock}\nWrite the release note in at most ${MAX_WORDS} words.`;
    const content = previous
        ? `${task}\n\n<previous_draft>\n${previous.draft}\n</previous_draft>\n` +
        `<feedback>\n${previous.issues.map((i) => `- ${i}`).join("\n")}\n</feedback>\n` +
        "Rewrite the release note and fix every point of feedback."
        : task;
    return (await chat([{ role: "user", content }], { system: PRODUCER_SYSTEM })).trim();
}

// ---------- Grader, part 1: code checks (cheap, deterministic, run first) ----------
function hardChecks(draft: string): string[] {
    const issues: string[] = [];
    const words = draft.split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) issues.push(`Too long: ${words} words, the limit is ${MAX_WORDS}`);
    for (const keyword of REQUIRED_KEYWORDS) {
        if (!draft.toLowerCase().includes(keyword.toLowerCase())) {
            issues.push(`Missing the change about "${keyword}"`);
        }
    }
    return issues;
}

// ---------- Grader, part 2: model review (separate call, temperature 0) ----------
async function modelReview(draft: string): Promise<string[]> {
    const raw = await chat(
        [{ role: "user", content: `${changesBlock}\n\n<release_note>\n${draft}\n</release_note>` }],
        { system: GRADER_SYSTEM, temperature: 0 },
    );
    try {
        const result = JSON.parse(raw.replace(/```(?:json)?/g, "").trim()) as {
            accepted?: boolean;
            issues?: unknown;
        };
        if (result.accepted === true) return [];
        const issues = Array.isArray(result.issues) ? result.issues.map(String) : [];
        return issues.length > 0 ? issues : ["Rejected by the reviewer without a reason"];
    } catch {
        // Never accept on a grader failure: treat unreadable output as a rejection
        return ["The reviewer returned invalid JSON"];
    }
}

// ---------- The loop: bounded, with an escalation path ----------
console.log(`Word limit: ${MAX_WORDS} | max iterations: ${MAX_ITERATIONS}\n`);

let previous: { draft: string; issues: string[] } | undefined;
let accepted = false;
let apiCalls = 0;

for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const draft = await produce(previous);
    apiCalls++;

    const issues = hardChecks(draft);
    if (issues.length === 0) {
        issues.push(...(await modelReview(draft))); // only pay for the model grader if code checks pass
        apiCalls++;
    }

    console.log(`--- iteration ${i} ---`);
    console.log(draft);
    console.log(issues.length === 0 ? "-> ACCEPTED" : `-> rejected:\n${issues.map((m) => `   - ${m}`).join("\n")}`);
    console.log();

    if (issues.length === 0) {
        accepted = true;
        break;
    }
    previous = { draft, issues };
}

console.log(`API calls: ${apiCalls}`);
if (!accepted) {
    console.log(`ESCALATE: not accepted after ${MAX_ITERATIONS} iterations, needs a human.`);
    process.exitCode = 1;
}
