import { spawnSync } from "node:child_process";
import { addAssistantMessage, addUserMessage, chat, type Message } from "./lib.js";

// Built with repeat() so we don't have to escape backticks in template literals
const FENCE = "`".repeat(3);

export type Format = "python" | "json" | "regex";
export type TestCase = { task: string; format: Format };

export type ModelGrade = {
    strengths: string[];
    weaknesses: string[];
    reasoning: string;
    score: number;
};

// ---------- Model grader (same as the previous lesson) ----------
export async function gradeByModel(
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
    addAssistantMessage(messages, `${FENCE}json`);

    // temperature 0: less run-to-run noise in scores
    const evalText = await chat(messages, {
        stopSequences: [FENCE],
        temperature: 0,
    });

    const grade = JSON.parse(evalText.trim()) as ModelGrade;
    if (typeof grade.score !== "number" || grade.score < 1 || grade.score > 10) {
        throw new Error(`Invalid score from grader: ${grade.score}`);
    }
    return grade;
}

// ---------- Code graders: does the output PARSE as the expected format? ----------
// Whole output is parsed, so extra prose or markdown fences make parsing fail.

function validateJson(text: string): number {
    try {
        JSON.parse(text.trim());
        return 10;
    } catch {
        return 0;
    }
}

function validateRegex(text: string): number {
    // Note: validates the JS regex dialect, not Python's `re`
    try {
        new RegExp(text.trim());
        return 10;
    } catch {
        return 0;
    }
}

function validatePython(text: string): number {
    // ast.parse only PARSES the code, it never executes it
    const result = spawnSync(
        "python3",
        ["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
        { input: text.trim(), encoding: "utf-8" },
    );
    // python3 missing is an environment problem, not the model's fault: don't score it
    if (result.error) throw result.error;
    return result.status === 0 ? 10 : 0;
}

export function gradeSyntax(output: string, testCase: TestCase): number {
    switch (testCase.format) {
        case "json":
            return validateJson(output);
        case "python":
            return validatePython(output);
        case "regex":
            return validateRegex(output);
    }
}
