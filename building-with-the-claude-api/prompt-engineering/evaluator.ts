import { readFileSync, writeFileSync } from "node:fs";
import {
    addAssistantMessage,
    addUserMessage,
    chat,
    type Message,
} from "../lib.js";

// Built with repeat() so we don't have to escape backticks in template literals
const FENCE = "`".repeat(3);

// A test case passes when its score is at least this value
export const PASS_THRESHOLD = 7;

export type PromptInputs = Record<string, string>;

export type TestCase = {
    description: string; // one-line summary of the case
    promptInputs: PromptInputs; // the values merged into the prompt
    solutionCriteria: string[]; // what a good output must satisfy for THIS case
};

export type CaseResult = {
    testCase: TestCase;
    output: string;
    score: number;
    reasoning: string;
    weaknesses: string[];
};

// Prefill + stop sequence = raw JSON only (same trick as the Structured data lesson).
// Retries only when the JSON is malformed (validation + retry pattern).
async function askForJson(
    prompt: string,
    temperature = 1.0,
    attempts = 3,
): Promise<unknown> {
    let lastError: unknown;

    for (let i = 0; i < attempts; i++) {
        const messages: Message[] = [];
        addUserMessage(messages, prompt);
        addAssistantMessage(messages, `${FENCE}json`);
        const text = await chat(messages, { stopSequences: [FENCE], temperature });

        try {
            return JSON.parse(text.trim());
        } catch (err) {
            if (!(err instanceof SyntaxError)) throw err;
            lastError = err; // malformed JSON: ask again
        }
    }
    throw lastError;
}

// ---------- Dataset generation ----------
export async function generateDataset(opts: {
    taskDescription: string;
    promptInputsSpec: Record<string, string>; // key -> description of the input
    outputFile: string;
    numCases?: number;
}): Promise<TestCase[]> {
    const { taskDescription, promptInputsSpec, outputFile, numCases = 3 } = opts;
    const keys = Object.keys(promptInputsSpec);

    const specLines = keys
        .map((k) => `  - "${k}": ${promptInputsSpec[k]}`)
        .join("\n");

    const example = [
        {
            description: "One-line summary of the test case",
            promptInputs: Object.fromEntries(keys.map((k) => [k, "..."])),
            solutionCriteria: ["Specific, checkable criterion", "..."],
        },
    ];

    const prompt = `
Generate an evaluation dataset for a prompt evaluation. The dataset will be used to evaluate a prompt for this task: ${taskDescription}

Each test case is a JSON object with:
- "description": a one-line summary of the test case
- "promptInputs": an object with exactly these keys:
${specLines}
- "solutionCriteria": an array of 4-6 concise, checkable criteria that a good output for THIS specific case must meet

Example output:
${FENCE}json
${JSON.stringify(example, null, 2)}
${FENCE}

* Make the test cases realistic and varied
* Criteria must be specific to each case, not generic
Please generate ${numCases} objects.
`;

    const data = await askForJson(prompt);

    if (
        !Array.isArray(data) ||
        !data.every(
            (c) =>
                typeof c?.description === "string" &&
                keys.every((k) => c?.promptInputs?.[k] != null) &&
                Array.isArray(c?.solutionCriteria) &&
                c.solutionCriteria.length > 0,
        )
    ) {
        throw new Error("Malformed dataset returned by the model");
    }

    // Normalize: the model may return numbers (e.g. 180) where we want strings
    const cases: TestCase[] = data.map((c) => ({
        description: c.description,
        promptInputs: Object.fromEntries(
            keys.map((k) => [k, String(c.promptInputs[k])]),
        ),
        solutionCriteria: c.solutionCriteria.map(String),
    }));

    writeFileSync(outputFile, JSON.stringify(cases, null, 2));
    return cases;
}

// ---------- Model grader ----------
type Grade = { weaknesses: string[]; reasoning: string; score: number };

async function gradeByModel(
    testCase: TestCase,
    output: string,
    extraCriteria: string,
): Promise<Grade> {
    const criteria = testCase.solutionCriteria.map((c) => `- ${c}`).join("\n");

    const prompt = `
You are an expert evaluator of AI-generated output. Evaluate the output below.

The prompt was given these inputs:
${JSON.stringify(testCase.promptInputs, null, 2)}

Solution criteria for this test case:
${criteria}

Additional criteria that apply to every test case:
${extraCriteria.trim() || "(none)"}

Output to evaluate:
${output}

Provide your evaluation as a structured JSON object with:
- "strengths": An array of 1-3 key strengths
- "weaknesses": An array of 1-3 key areas for improvement
- "reasoning": A concise explanation of your assessment
- "score": A number between 1-10
`;

    // temperature 0: less run-to-run noise in scores
    const grade = (await askForJson(prompt, 0)) as Grade;

    if (typeof grade.score !== "number" || grade.score < 1 || grade.score > 10) {
        throw new Error(`Invalid score from grader: ${grade.score}`);
    }
    return grade;
}

// ---------- Run with a concurrency cap (a tiny worker pool) ----------
async function mapWithLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;

    async function worker() {
        // JS is single-threaded, so next++ is safe without locks
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return results;
}

export async function runEvaluation(opts: {
    runPrompt: (inputs: PromptInputs) => Promise<string>;
    datasetFile: string;
    extraCriteria?: string; // criteria applied to every case, on top of per-case ones
    maxConcurrentTasks?: number; // start low (3) to avoid 429 rate-limit errors
    resultsFile: string;
}) {
    const {
        runPrompt,
        datasetFile,
        extraCriteria = "",
        maxConcurrentTasks = 3,
        resultsFile,
    } = opts;

    const dataset: TestCase[] = JSON.parse(readFileSync(datasetFile, "utf-8"));

    const results = await mapWithLimit<TestCase, CaseResult>(
        dataset,
        maxConcurrentTasks,
        async (testCase, i) => {
            const output = await runPrompt(testCase.promptInputs);
            const grade = await gradeByModel(testCase, output, extraCriteria);
            console.log(`Case ${i + 1}/${dataset.length}: ${grade.score}/10`);
            return {
                testCase,
                output,
                score: grade.score,
                reasoning: grade.reasoning,
                weaknesses: grade.weaknesses,
            };
        },
    );

    const average = results.reduce((s, r) => s + r.score, 0) / results.length;
    const passRate =
        results.filter((r) => r.score >= PASS_THRESHOLD).length / results.length;

    writeFileSync(
        resultsFile,
        JSON.stringify({ average, passRate, results }, null, 2),
    );
    console.log(
        `\nAverage score: ${average.toFixed(2)} | Pass rate (>=${PASS_THRESHOLD}): ${(passRate * 100).toFixed(1)}% (details in ${resultsFile})`,
    );

    return { average, passRate, results };
}
