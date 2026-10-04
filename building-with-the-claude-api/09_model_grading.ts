import { readFileSync } from "node:fs";
import {
    addAssistantMessage,
    addUserMessage,
    chat,
    type Message,
} from "./lib.js";

// Built with repeat() so we don't have to escape backticks in template literals
const FENCE = "`".repeat(3);

type TestCase = { task: string };

type ModelGrade = {
    strengths: string[];
    weaknesses: string[];
    reasoning: string;
    score: number;
};

type EvalResult = {
    output: string;
    testCase: TestCase;
    score: number;
    reasoning: string;
};

// Same prompt v1 as the previous lesson
async function runPrompt(testCase: TestCase): Promise<string> {
    const prompt = `
Please solve the following task:

${testCase.task}
`;
    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    return chat(messages);
}

// Asks a second model call to review the first one's output
async function gradeByModel(
    testCase: TestCase,
    output: string,
): Promise<ModelGrade> {
    const evalPrompt = `
You are an expert code reviewer. Evaluate this AI-generated solution.

Task: ${testCase.task}
Solution: ${output}

Provide your evaluation as a structured JSON object with:
- "strengths": An array of 1-3 key strengths
- "weaknesses": An array of 1-3 key areas for improvement
- "reasoning": A concise explanation of your assessment
- "score": A number between 1-10
`;

    const messages: Message[] = [];
    addUserMessage(messages, evalPrompt);
    // Prefill + stop sequence = raw JSON only
    addAssistantMessage(messages, `${FENCE}json`);

    // temperature 0: less run-to-run noise in scores (not in the lesson)
    const evalText = await chat(messages, {
        stopSequences: [FENCE],
        temperature: 0,
    });

    const grade = JSON.parse(evalText.trim()) as ModelGrade;

    if (
        typeof grade.score !== "number" ||
        grade.score < 1 ||
        grade.score > 10
    ) {
        throw new Error(`Invalid score from grader: ${grade.score}`);
    }
    return grade;
}

async function runTestCase(testCase: TestCase): Promise<EvalResult> {
    const output = await runPrompt(testCase);

    // Real grader replaces the hardcoded score = 10
    const grade = await gradeByModel(testCase, output);

    return {
        output,
        testCase,
        score: grade.score,
        reasoning: grade.reasoning,
    };
}

async function runEval(dataset: TestCase[]): Promise<EvalResult[]> {
    const results: EvalResult[] = [];

    for (const [i, testCase] of dataset.entries()) {
        console.log(`Running test case ${i + 1}/${dataset.length}...`);
        results.push(await runTestCase(testCase));
    }

    const averageScore =
        results.reduce((sum, r) => sum + r.score, 0) / results.length;
    console.log(`\nAverage score: ${averageScore.toFixed(2)}`);

    return results;
}

const dataset: TestCase[] = JSON.parse(readFileSync("dataset.json", "utf-8"));
const results = await runEval(dataset);

// Compact report: read the low scores first, they show where the prompt is weak
for (const r of results) {
    console.log(`\n[${r.score}/10] ${r.testCase.task}`);
    console.log(`  reasoning: ${r.reasoning}`);
}