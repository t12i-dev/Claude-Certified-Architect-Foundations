import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addUserMessage, chat, type Message } from "../lib.js";
import { runEvaluation, type PromptInputs } from "./evaluator.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Same dataset as v1 and v2: a fair comparison needs identical test cases
const DATASET_FILE = here("meal_dataset.json");
if (!existsSync(DATASET_FILE)) {
    throw new Error(
        "meal_dataset.json not found. Run 11_meal_plan_baseline.ts first to create it.",
    );
}

// Usage:
//   npx tsx prompt-engineering/13_meal_plan_specific.ts          (guidelines only)
//   npx tsx prompt-engineering/13_meal_plan_specific.ts steps    (guidelines + process steps)
const withSteps = process.argv[2] === "steps";

// Output quality guidelines: describe what a good output looks like
const GUIDELINES = `
Guidelines:
1. Include accurate daily calorie amount
2. Show protein, fat, and carb amounts
3. Specify when to eat each meal
4. Use only foods that fit restrictions
5. List all portion sizes in grams
6. Keep budget-friendly if mentioned
`;

// Process steps (optional experiment, not in the lesson): how to get there.
// Note: the model will usually write this reasoning into its answer.
const PROCESS_STEPS = `
Before writing the plan, work through these steps:
1. Estimate the athlete's daily calorie needs from height, weight, and goal
2. Split those calories into protein, fat, and carbs that support the goal
3. Choose foods that fit the dietary restrictions
4. Schedule the meals across the day and set portion sizes in grams
`;

// Prompt v3: v2 (clear and direct) + output guidelines.
// The input list stays where it was, so the guidelines are the only change.
async function runPrompt(inputs: PromptInputs): Promise<string> {
    const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

- Height: ${inputs.height}
- Weight: ${inputs.weight}
- Goal: ${inputs.goal}
- Dietary restrictions: ${inputs.restrictions}
${GUIDELINES}${withSteps ? PROCESS_STEPS : ""}`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    return chat(messages);
}

await runEvaluation({
    runPrompt,
    datasetFile: DATASET_FILE,
    // Must stay identical to the previous versions, or the scores aren't comparable
    extraCriteria: `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`,
    resultsFile: here(withSteps ? "results_v3_steps.json" : "results_v3.json"),
});

// # The lesson: guidelines only
// npx tsx prompt-engineering/13_meal_plan_specific.ts
// npx tsx prompt-engineering/report.ts results_v3.json report_v3.html
// open prompt-engineering/report_v3.html

// # Optional: guidelines + process steps
// npx tsx prompt-engineering/13_meal_plan_specific.ts steps
// npx tsx prompt-engineering/report.ts results_v3_steps.json report_v3_steps.html

// # Compare every version
// grep -H '"average"\|"passRate"' prompt-engineering/results_v*.json
