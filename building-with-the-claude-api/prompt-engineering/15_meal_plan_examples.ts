import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addUserMessage, chat, type Message } from "../lib.js";
import {
    runEvaluation,
    type CaseResult,
    type PromptInputs,
    type TestCase,
} from "./evaluator.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const DATASET_FILE = here("meal_dataset.json");
const PREVIOUS_RESULTS = here("results_v4.json"); // best version so far (v4: XML tags)

for (const file of [DATASET_FILE, PREVIOUS_RESULTS]) {
    if (!existsSync(file)) {
        throw new Error(`${file} not found. Run 11 to 14 first (default mode).`);
    }
}

// Usage: npx tsx prompt-engineering/15_meal_plan_examples.ts [numExamples]
//   1 = one-shot (default), 2+ = multi-shot (needs a bigger dataset to be meaningful)
const numExamples = Number(process.argv[2] ?? 1);
if (!Number.isInteger(numExamples) || numExamples < 1) {
    throw new Error("numExamples must be a positive integer");
}

const dataset: TestCase[] = JSON.parse(readFileSync(DATASET_FILE, "utf-8"));
const previous = JSON.parse(readFileSync(PREVIOUS_RESULTS, "utf-8")) as {
    results: CaseResult[];
};

const keyOf = (c: TestCase) => JSON.stringify(c.promptInputs);

// 1. Mine the best outputs from the previous eval to use as examples
const best = [...previous.results]
    .sort((a, b) => b.score - a.score)
    .slice(0, numExamples);

for (const b of best) {
    if (b.score < 8) {
        console.warn(
            `Heads-up: this example only scored ${b.score}/10, so it may not be a truly ideal output.`,
        );
    }
}

// 2. Hold the example cases OUT of the test set. Otherwise the model sees the
// answer to a case it is then graded on, and the score is inflated (leakage).
const exampleKeys = new Set(best.map((b) => keyOf(b.testCase)));
const holdout = dataset.filter((c) => !exampleKeys.has(keyOf(c)));
if (holdout.length === 0) {
    throw new Error("No cases left to evaluate on. Use fewer examples or a bigger dataset.");
}
const HOLDOUT_FILE = here("meal_dataset_holdout.json");
writeFileSync(HOLDOUT_FILE, JSON.stringify(holdout, null, 2));

function formatInputs(inputs: PromptInputs): string {
    return `<athlete_information>
- Height: ${inputs.height}
- Weight: ${inputs.weight}
- Goal: ${inputs.goal}
- Dietary restrictions: ${inputs.restrictions}
</athlete_information>`;
}

// Same guidelines as v3/v4
const GUIDELINES = `
Guidelines:
1. Include accurate daily calorie amount
2. Show protein, fat, and carb amounts
3. Specify when to eat each meal
4. Use only foods that fit restrictions
5. List all portion sizes in grams
6. Keep budget-friendly if mentioned
`;

// Each example: input, ideal output, and WHY it is ideal.
// In real work, write a specific reason per example instead of a generic one.
const EXAMPLES = best
    .map(
        (b) => `
<example>
<sample_input>
${formatInputs(b.testCase.promptInputs)}
</sample_input>
<ideal_output>
${b.output}
</ideal_output>
This example is well-structured, gives detailed food choices and quantities, and fits the athlete's goal and restrictions.
</example>`,
    )
    .join("\n");

// Prompt v5: v4 + examples. The examples block is the only change.
async function runPrompt(inputs: PromptInputs): Promise<string> {
    const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

Here ${numExamples === 1 ? "is an example" : "are examples"} of an athlete's information with an ideal meal plan:

<examples>
${EXAMPLES}
</examples>

Now generate the meal plan for this athlete:

${formatInputs(inputs)}
${GUIDELINES}`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    return chat(messages);
}

const { average } = await runEvaluation({
    runPrompt,
    datasetFile: HOLDOUT_FILE,
    // Must stay identical to the previous versions, or the scores aren't comparable
    extraCriteria: `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`,
    resultsFile: here("results_v5.json"),
});

// 3. Fair comparison: v4 scored on the SAME held-out cases only
const v4Holdout = previous.results.filter((r) => !exampleKeys.has(keyOf(r.testCase)));
const v4Average = v4Holdout.reduce((s, r) => s + r.score, 0) / v4Holdout.length;

console.log(
    `\nSame ${holdout.length} held-out case(s): v4 = ${v4Average.toFixed(2)}, ` +
    `v5 (${numExamples} example${numExamples > 1 ? "s" : ""}) = ${average.toFixed(2)}`,
);

// # 1) In 11_meal_plan_baseline.ts, change numCases: 3 -> 8
// # 2) Remove the old dataset and results
// rm prompt-engineering/meal_dataset.json prompt-engineering/meal_dataset_holdout.json prompt-engineering/results_v*.json

// # 3) Rerun v1 to v4 on the new dataset
// for f in 11_meal_plan_baseline 12_meal_plan_clear_direct 13_meal_plan_specific 14_meal_plan_xml; do
//   npx tsx prompt-engineering/$f.ts
// done

// # 4) One-shot, then multi-shot
// npx tsx prompt-engineering/15_meal_plan_examples.ts
// npx tsx prompt-engineering/15_meal_plan_examples.ts 2
