import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addUserMessage, chat, type Message } from "../lib.js";
import {
    generateDataset,
    runEvaluation,
    type PromptInputs,
} from "./evaluator.js";

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const DATASET_FILE = here("meal_dataset.json");

// Generate once, then reuse for every prompt version so comparisons stay fair
if (!existsSync(DATASET_FILE)) {
    await generateDataset({
        taskDescription:
            "Write a compact, concise 1 day meal plan for a single athlete",
        promptInputsSpec: {
            height: "Athlete's height in cm",
            weight: "Athlete's weight in kg",
            goal: "Goal of the athlete",
            restrictions: "Dietary restrictions of the athlete",
        },
        outputFile: DATASET_FILE,
        numCases: 3, // keep it small while iterating
    });
}

// Prompt v1: deliberately naive baseline
async function runPrompt(inputs: PromptInputs): Promise<string> {
    const prompt = `
What should this person eat?

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
    extraCriteria: `
The output should include:
- Daily caloric total
- Macronutrient breakdown
- Meals with exact foods, portions, and timing
`,
    resultsFile: here("results_v1.json"), // one results file per prompt version
});
