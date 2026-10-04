import { writeFileSync } from "node:fs";
import {
    addAssistantMessage,
    addUserMessage,
    chat,
    type Message,
} from "./lib.js";

// Built with repeat() so we don't have to escape backticks in template literals
const FENCE = "`".repeat(3);

const FORMATS = ["python", "json", "regex"] as const;
type Format = (typeof FORMATS)[number];

// "format" tells the code grader which syntax validator to use later
type Task = { task: string; format: Format };

async function generateDataset(count = 6): Promise<Task[]> {
    const prompt = `
Generate an evaluation dataset for a prompt evaluation. The dataset will be used to evaluate prompts that generate Python, JSON, or Regex specifically for AWS-related tasks. Generate an array of JSON objects, each representing a task that requires Python, JSON, or a Regex to complete.

Example output:
${FENCE}json
[
  {
    "task": "Description of task",
    "format": "python"
  }
]
${FENCE}

* Focus on tasks that can be solved by writing a single Python function, a single JSON object, or a single regex
* Focus on tasks that do not require writing much code
* "format" must be exactly one of: "python", "json", "regex"
* Include a mix of all three formats

Please generate ${count} objects.
`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    // Prefill + stop sequence = raw JSON only (same trick as the Structured data lesson)
    addAssistantMessage(messages, `${FENCE}json`);
    const text = await chat(messages, { stopSequences: [FENCE] });

    const data: unknown = JSON.parse(text.trim());

    // Sanity check: every record needs a string "task" and a known "format"
    if (
        !Array.isArray(data) ||
        !data.every(
            (item) =>
                typeof item?.task === "string" &&
                (FORMATS as readonly string[]).includes(item?.format),
        )
    ) {
        throw new Error("Malformed dataset returned by the model");
    }
    return data as Task[];
}

const dataset = await generateDataset(6);
console.log(JSON.stringify(dataset, null, 2));

// Count per format, to confirm the dataset isn't lopsided
const counts = Object.fromEntries(
    FORMATS.map((f) => [f, dataset.filter((t) => t.format === f).length]),
);
console.log("\nFormat counts:", counts);

// Save so the eval scripts can load it
writeFileSync("dataset.json", JSON.stringify(dataset, null, 2));
console.log(`Saved ${dataset.length} records to dataset.json`);
