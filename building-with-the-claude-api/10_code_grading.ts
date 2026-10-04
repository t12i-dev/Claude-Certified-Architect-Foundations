import { readFileSync } from "node:fs";
import { addAssistantMessage, addUserMessage, chat, type Message } from "./lib.js";
import { gradeByModel, gradeSyntax, type TestCase } from "./graders.js";

const FENCE = "`".repeat(3);

type PromptFn = (testCase: TestCase) => Promise<string>;

type EvalResult = {
    output: string;
    testCase: TestCase;
    score: number; // combined
    modelScore: number;
    syntaxScore: number;
    reasoning: string;
};

// v1: baseline, no format instructions
const promptV1: PromptFn = async (testCase) => {
    const messages: Message[] = [];
    addUserMessage(
        messages,
        `
Please solve the following task:

${testCase.task}
`,
    );
    return chat(messages);
};

// v2: explicit format rules + prefill/stop sequence to get raw code only
const promptV2: PromptFn = async (testCase) => {
    const messages: Message[] = [];
    addUserMessage(
        messages,
        `
Please solve the following task:

${testCase.task}

* Respond only with Python, JSON, or a plain Regex
* Do not add any comments or commentary or explanation
`,
    );
    addAssistantMessage(messages, `${FENCE}code`);
    return chat(messages, { stopSequences: [FENCE] });
};

async function runTestCase(
    testCase: TestCase,
    runPrompt: PromptFn,
): Promise<EvalResult> {
    const output = await runPrompt(testCase);

    const modelGrade = await gradeByModel(testCase, output);
    const syntaxScore = gradeSyntax(output, testCase);

    // Equal weight for content quality and technical correctness
    const score = (modelGrade.score + syntaxScore) / 2;

    return {
        output,
        testCase,
        score,
        modelScore: modelGrade.score,
        syntaxScore,
        reasoning: modelGrade.reasoning,
    };
}

const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;

async function runEval(
    label: string,
    dataset: TestCase[],
    runPrompt: PromptFn,
): Promise<EvalResult[]> {
    console.log(`\n=== ${label} ===`);
    const results: EvalResult[] = [];

    for (const [i, testCase] of dataset.entries()) {
        const r = await runTestCase(testCase, runPrompt);
        results.push(r);
        console.log(
            `#${i + 1} [${testCase.format}] model=${r.modelScore} syntax=${r.syntaxScore} -> ${r.score}`,
        );
    }

    console.log(
        `Average: combined=${avg(results.map((r) => r.score)).toFixed(2)} ` +
        `model=${avg(results.map((r) => r.modelScore)).toFixed(2)} ` +
        `syntax=${avg(results.map((r) => r.syntaxScore)).toFixed(2)}`,
    );
    return results;
}

const dataset: TestCase[] = JSON.parse(readFileSync("dataset.json", "utf-8"));

if (!dataset.every((t) => ["python", "json", "regex"].includes(t.format))) {
    throw new Error(
        'dataset.json has no valid "format" field. Update and rerun 07_generate_dataset.ts first.',
    );
}

// Same dataset for both versions, so the comparison is fair
const v1 = await runEval("Prompt v1 (baseline)", dataset, promptV1);
const v2 = await runEval("Prompt v2 (format rules + prefill)", dataset, promptV2);

// Look at outputs that failed the syntax check: they show why
for (const r of [...v1, ...v2].filter((r) => r.syntaxScore === 0).slice(0, 3)) {
    console.log(`\n--- syntax fail [${r.testCase.format}] ---\n${r.output}`);
}
