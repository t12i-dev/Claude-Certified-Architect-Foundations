import { readFileSync } from "node:fs";
import { addUserMessage, chat, type Message } from "./lib.js";

type TestCase = { task: string };

type EvalResult = {
    output: string;
    testCase: TestCase;
    score: number;
};

// Merges the prompt template (v1) with one test case and returns Claude's output
async function runPrompt(testCase: TestCase): Promise<string> {
    const prompt = `
Please solve the following task:

${testCase.task}
`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    return chat(messages);
}

// Runs one test case, then grades it
async function runTestCase(testCase: TestCase): Promise<EvalResult> {
    const output = await runPrompt(testCase);

    // TODO: replace with a real grader (next lessons).
    // Hardcoded for now, so every score is 10 and the average tells us nothing yet.
    const score = 10;

    return { output, testCase, score };
}

// Runs every test case in the dataset, one after another
async function runEval(dataset: TestCase[]): Promise<EvalResult[]> {
    const results: EvalResult[] = [];

    for (const [i, testCase] of dataset.entries()) {
        console.log(`Running test case ${i + 1}/${dataset.length}...`);
        results.push(await runTestCase(testCase));
    }

    return results;
}

// Load the dataset produced by 07_generate_dataset.ts (run from the project root)
const dataset: TestCase[] = JSON.parse(readFileSync("dataset.json", "utf-8"));

const results = await runEval(dataset);
console.log(JSON.stringify(results, null, 2));
