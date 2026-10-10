import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addUserMessage, chat, type Message } from "../lib.js";
import { runEvaluation, type PromptInputs } from "./evaluator.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Same dataset as v1: a fair comparison needs identical test cases
const DATASET_FILE = here("meal_dataset.json");
if (!existsSync(DATASET_FILE)) {
    throw new Error(
        "meal_dataset.json not found. Run 11_meal_plan_baseline.ts first to create it.",
    );
}

// Prompt v2: clear and direct.
// Only the first line changed: an instruction with an action verb, not a question.
async function runPrompt(inputs: PromptInputs): Promise<string> {
    const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

- Height: ${inputs.height}
- Weight: ${inputs.weight}
- Goal: ${inputs.goal}
- Dietary restrictions: ${inputs.restrictions}
`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    return chat(messages);
}

await runEvaluation({
    runPrompt,
    datasetFile: DATASET_FILE,
    // Must stay identical to 11_meal_plan_baseline.ts, or the scores aren't comparable
    extraCriteria: `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`,
    resultsFile: here("results_v2.json"),
});

// npx tsx prompt-engineering/12_meal_plan_clear_direct.ts
// npx tsx prompt-engineering/report.ts results_v2.json report_v2.html
// open prompt-engineering/report_v2.html

// # Compare v1 and v2 side by side
// grep -H '"average"\|"passRate"' prompt-engineering/results_v*.json
