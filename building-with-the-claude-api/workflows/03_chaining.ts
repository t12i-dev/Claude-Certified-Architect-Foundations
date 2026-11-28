import { chat } from "../lib.js";

// Usage: npx tsx workflows/03_chaining.ts [samplesPerStrategy]
const parsed = Number(process.argv[2]);
const SAMPLES = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 8;
const CONCURRENCY = 4;
const SUBJECT = "Python list comprehensions";

const RULES = `Rules:
- Professional, technical tone; no clichés or casual filler
- Never mention AI or that the text was written by an AI
- No emojis and no exclamation marks
- No first person (I, we, my, our, let's)
- No rhetorical questions
- Exactly one fenced code block
- At most 150 words of prose (code excluded)
- The last line must be one sentence starting with "In summary,"`;

const DRAFT_PROMPT =
    `Write a short technical article about ${SUBJECT} for backend engineers.\n\n${RULES}\n\nReturn only the article.`;

const REVISE_CHECKLIST = `Revise the article provided below. Follow these steps to rewrite it:
1. Remove any text that mentions AI or identifies the author as an AI
2. Remove all emojis and exclamation marks
3. Remove first-person wording (I, we, my, our, let's)
4. Turn rhetorical questions into statements
5. Make sure there is exactly one fenced code block
6. Keep the prose under 150 words (code excluded)
7. Make the last line one sentence starting with "In summary,"
Return only the revised article.`;

const ask = (content: string) => chat([{ role: "user", content }]);

// ---------- Code checks: deterministic, free, usable as a gate ----------
function violations(article: string): string[] {
    const prose = article.replace(/```[\s\S]*?```/g, " "); // ignore code (for example "!=" in Python)
    const found: string[] = [];

    if (/\p{Extended_Pictographic}/u.test(article)) found.push("contains an emoji");
    if (/\b(AI|artificial intelligence|language model)\b/.test(prose)) found.push("mentions AI");
    if (prose.includes("!")) found.push("contains an exclamation mark");
    if (/\b(I|I'm|I've|we|we're|my|our|let's)\b/i.test(prose)) found.push("uses first person");
    if (prose.includes("?")) found.push("contains a question");
    if ((article.match(/```/g) ?? []).length !== 2) found.push("does not have exactly one code block");
    if (prose.split(/\s+/).filter(Boolean).length > 150) found.push("prose is longer than 150 words");

    const lastLine = article.trim().split("\n").pop() ?? "";
    if (!lastLine.trim().startsWith("In summary,")) {
        found.push('last line does not start with "In summary,"');
    }
    return found;
}

// ---------- The three strategies ----------
type Outcome = { article: string; calls: number };

const STRATEGIES: Record<string, () => Promise<Outcome>> = {
    "single prompt": async () => ({ article: await ask(DRAFT_PROMPT), calls: 1 }),

    "chain (generic revision)": async () => {
        const draft = await ask(DRAFT_PROMPT);
        const article = await ask(`${REVISE_CHECKLIST}\n\n<article>\n${draft}\n</article>`);
        return { article, calls: 2 };
    },

    "chain + code gate": async () => {
        const draft = await ask(DRAFT_PROMPT);
        const issues = violations(draft);
        if (issues.length === 0) return { article: draft, calls: 1 }; // the gate: no LLM call needed

        const article = await ask(
            "Revise the article below. Fix ONLY these problems and keep everything else as it is:\n" +
            `${issues.map((i) => `- ${i}`).join("\n")}\n\n<article>\n${draft}\n</article>\n\nReturn only the revised article.`,
        );
        return { article, calls: 2 };
    },
};

// ---------- Run samples with a concurrency cap; a failed sample must not sink the run ----------
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

console.log(`${SAMPLES} samples per strategy, concurrency ${CONCURRENCY}\n`);

const rows: Record<string, string | number>[] = [];
const frequent: Record<string, Map<string, number>> = {};

for (const [name, run] of Object.entries(STRATEGIES)) {
    const settled = await mapSettled(Array.from({ length: SAMPLES }, () => 0), CONCURRENCY, () => run());

    let ok = 0;
    let compliant = 0;
    let totalViolations = 0;
    let totalCalls = 0;
    let errors = 0;
    const tally = new Map<string, number>();

    for (const result of settled) {
        if (result.status === "rejected") {
            errors++;
            continue;
        }
        ok++;
        totalCalls += result.value.calls;
        const found = violations(result.value.article);
        totalViolations += found.length;
        if (found.length === 0) compliant++;
        for (const rule of found) tally.set(rule, (tally.get(rule) ?? 0) + 1);
    }

    rows.push({
        strategy: name,
        samples: ok,
        errors,
        fullyCompliant: `${compliant}/${ok}`,
        avgViolations: ok ? Number((totalViolations / ok).toFixed(2)) : 0,
        avgApiCalls: ok ? Number((totalCalls / ok).toFixed(2)) : 0,
    });
    frequent[name] = tally;
}

console.table(rows);
for (const [name, tally] of Object.entries(frequent)) {
    const top = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([rule, n]) => `${rule} (${n})`)
        .join("; ");
    console.log(`${name}: ${top || "no violations"}`);
}
console.log("\nSmall samples are noisy: raise the argument (for example 20) before drawing conclusions.");
