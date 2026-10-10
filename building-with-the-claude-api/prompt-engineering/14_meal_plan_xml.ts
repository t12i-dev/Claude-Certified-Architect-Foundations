import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addUserMessage, chat, type Message } from "../lib.js";
import { runEvaluation, type PromptInputs } from "./evaluator.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Same dataset as every previous version: a fair comparison needs identical test cases
const DATASET_FILE = here("meal_dataset.json");
if (!existsSync(DATASET_FILE)) {
    throw new Error(
        "meal_dataset.json not found. Run 11_meal_plan_baseline.ts first to create it.",
    );
}

// Usage:
//   npx tsx prompt-engineering/14_meal_plan_xml.ts            (the lesson: tags around the inputs)
//   npx tsx prompt-engineering/14_meal_plan_xml.ts extract    (optional: also tag the OUTPUT)
const extractMode = process.argv[2] === "extract";

// Same guidelines as v3 (13_meal_plan_specific.ts)
const GUIDELINES = `
Guidelines:
1. Include accurate daily calorie amount
2. Show protein, fat, and carb amounts
3. Specify when to eat each meal
4. Use only foods that fit restrictions
5. List all portion sizes in grams
6. Keep budget-friendly if mentioned
`;

// Optional experiment (not in the lesson): tags on the output side,
// so the app can show only the plan and keep the reasoning hidden.
const OUTPUT_FORMAT = `
First, think through the athlete's needs inside <analysis> tags.
Then write the final plan inside <meal_plan> tags.
`;

function extractTag(text: string, tag: string): string | null {
    const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return match ? match[1].trim() : null;
}

// Prompt v4: v3 + XML tags around the athlete data.
// The tags are the only change versus v3 (in default mode).
async function runPrompt(inputs: PromptInputs): Promise<string> {
    const prompt = `
Generate a one-day meal plan for an athlete that meets their dietary restrictions.

<athlete_information>
- Height: ${inputs.height}
- Weight: ${inputs.weight}
- Goal: ${inputs.goal}
- Dietary restrictions: ${inputs.restrictions}
</athlete_information>
${GUIDELINES}${extractMode ? OUTPUT_FORMAT : ""}`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    const raw = await chat(messages);

    if (!extractMode) return raw;

    // Keep only the final plan, like an app would before showing it to the user
    const plan = extractTag(raw, "meal_plan");
    if (!plan) {
        console.warn("No <meal_plan> block found; falling back to the raw output");
        return raw;
    }
    return plan;
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
    resultsFile: here(extractMode ? "results_v4_extract.json" : "results_v4.json"),
});

// # The lesson: XML tags around the inputs
// npx tsx prompt-engineering/14_meal_plan_xml.ts
// npx tsx prompt-engineering/report.ts results_v4.json report_v4.html
// open prompt-engineering/report_v4.html

// # Optional: also tag the output and extract only <meal_plan>
// npx tsx prompt-engineering/14_meal_plan_xml.ts extract
// npx tsx prompt-engineering/report.ts results_v4_extract.json report_v4_extract.html

// # Compare every version
// grep -H '"average"\|"passRate"' prompt-engineering/results_v*.json
