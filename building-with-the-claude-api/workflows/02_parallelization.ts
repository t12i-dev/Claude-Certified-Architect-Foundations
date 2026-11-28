import { chat } from "../lib.js";

// Usage: npx tsx workflows/02_parallelization.ts [concurrency]
// concurrency 4 = all branches at once (default), 1 = one after another
const parsed = Number(process.argv[2]);
const CONCURRENCY = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4;

const REQUIREMENTS = `Feature: session store for a web application.
- Peak 50,000 requests per second, about 80% reads
- Items under 2 KB, always accessed by session id
- Sessions expire after 30 minutes of inactivity
- Single-digit millisecond latency
- Losing a session is acceptable but should be rare
- Budget-sensitive`;

type Candidate = { name: string; criteria: string };

// Each branch gets criteria written for ONE service
const CANDIDATES: Candidate[] = [
    {
        name: "DynamoDB",
        criteria: `- Key-value access by partition key, native TTL for expiry
- Throughput limits per partition, hot keys, on-demand versus provisioned cost at 50k RPS
- Item size limits, consistency options, latency without a cache layer`,
    },
    {
        name: "Aurora PostgreSQL",
        criteria: `- Connection limits and pooling at high request rates
- Write throughput scaling, replica lag for reads
- Cost of keeping hot ephemeral data in a relational engine, expiry via scheduled cleanup`,
    },
    {
        name: "ElastiCache (Redis/Valkey)",
        criteria: `- In-memory latency, native key expiry
- Durability trade-offs: persistence, replication, failover behavior
- Memory cost for the working set, cluster scaling and resharding effort`,
    },
    {
        name: "S3",
        criteria: `- Object storage request latency and per-request cost at very high request rates
- Suitability for tiny, short-lived, frequently updated objects
- Lifecycle-based expiry granularity`,
    },
];

const EVALUATOR_SYSTEM = `You are an AWS solutions architect evaluating ONE candidate service against a requirement.
Judge only this candidate using the given criteria; do not compare it with other services.
Reply with JSON only, no other text: {"fit": <number from 1 to 10>, "strengths": string[], "risks": string[]}`;

const AGGREGATOR_SYSTEM = "You are a principal AWS architect making a final recommendation. Be concise and concrete.";

type Evaluation = { name: string; fit: number; strengths: string[]; risks: string[]; ms: number };

// ---------- One branch ----------
function parseEvaluation(name: string, raw: string, ms: number): Evaluation {
    const data = JSON.parse(raw.replace(/```(?:json)?/g, "").trim()) as Record<string, unknown>;
    const fit = Number(data.fit);
    if (!Number.isFinite(fit) || fit < 1 || fit > 10) throw new Error("fit must be a number from 1 to 10");
    const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
    return { name, fit, strengths: list(data.strengths), risks: list(data.risks), ms };
}

async function evaluate(candidate: Candidate): Promise<Evaluation> {
    const start = Date.now();
    const raw = await chat(
        [
            {
                role: "user",
                content:
                    `<requirements>\n${REQUIREMENTS}\n</requirements>\n\n` +
                    `<candidate>${candidate.name}</candidate>\n<criteria>\n${candidate.criteria}\n</criteria>`,
            },
        ],
        { system: EVALUATOR_SYSTEM, temperature: 0 },
    );
    return parseEvaluation(candidate.name, raw, Date.now() - start);
}

// ---------- Run branches with a concurrency cap; one failure must not sink the rest ----------
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

// ---------- Fan-out ----------
const started = Date.now();
const settled = await mapSettled(CANDIDATES, CONCURRENCY, evaluate);
const wallMs = Date.now() - started;

const evaluations: Evaluation[] = [];
const failures: { name: string; reason: string }[] = [];
settled.forEach((result, i) => {
    if (result.status === "fulfilled") evaluations.push(result.value);
    else failures.push({ name: CANDIDATES[i].name, reason: (result.reason as Error).message });
});

console.table(
    evaluations.map((e) => ({
        candidate: e.name,
        fit: e.fit,
        seconds: Number((e.ms / 1000).toFixed(1)),
        strengths: e.strengths.length,
        risks: e.risks.length,
    })),
);
const sumMs = evaluations.reduce((total, e) => total + e.ms, 0);
console.log(
    `Concurrency ${CONCURRENCY}: wall-clock ${(wallMs / 1000).toFixed(1)}s ` +
    `versus ${(sumMs / 1000).toFixed(1)}s if the branches ran one after another`,
);
for (const f of failures) console.log(`FAILED ${f.name}: ${f.reason}`);

// Not enough evidence to compare: stop instead of recommending from one branch
if (evaluations.length < 2) {
    console.error("Fewer than 2 successful evaluations: aborting");
    process.exit(1);
}

// ---------- Fan-in ----------
const bullets = (items: string[]) => items.map((s) => `- ${s}`).join("\n");
const evidence = evaluations
    .map(
        (e) =>
            `<evaluation candidate="${e.name}" fit="${e.fit}">\nStrengths:\n${bullets(e.strengths)}\nRisks:\n${bullets(e.risks)}\n</evaluation>`,
    )
    .join("\n\n");
const missing =
    failures.length > 0
        ? `\nThese candidates could not be evaluated and must not be recommended: ${failures.map((f) => f.name).join(", ")}.`
        : "";

const recommendation = await chat(
    [
        {
            role: "user",
            content:
                `<requirements>\n${REQUIREMENTS}\n</requirements>\n\n${evidence}${missing}\n\n` +
                "Compare the evaluations and recommend ONE candidate. State the deciding trade-off in one sentence, " +
                "then list up to 3 things to validate before committing. " +
                "The fit scores were given independently per candidate, so treat them as soft and reason from the strengths and risks. " +
                "Base your answer only on the evaluations above.",
        },
    ],
    { system: AGGREGATOR_SYSTEM, temperature: 0 },
);

const top = [...evaluations].sort((a, b) => b.fit - a.fit)[0];
console.log(`\nHighest score alone: ${top.name} (${top.fit}/10)`);
console.log(`\n=== Recommendation ===\n${recommendation}`);
console.log(`\nAPI calls: ${evaluations.length + failures.length} branches + 1 aggregator`);
