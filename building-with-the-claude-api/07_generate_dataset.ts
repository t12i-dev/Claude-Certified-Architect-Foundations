import { writeFileSync } from "node:fs";
import {
    addAssistantMessage,
    addUserMessage,
    chat,
    type Message,
} from "./lib.ts";

// Built with repeat() so we don't have to escape backticks inside template literals
const FENCE = "`".repeat(3);

type Task = { task: string };

async function generateDataset(count = 3): Promise<Task[]> {
    const prompt = `
Generate an evaluation dataset for a prompt evaluation. The dataset will be used to evaluate prompts that generate Python, JSON, or Regex specifically for AWS-related tasks. Generate an array of JSON objects, each representing a task that requires Python, JSON, or a Regex to complete.

Example output:
${FENCE}json
[
  {
    "task": "Description of task"
  }
]
${FENCE}

* Focus on tasks that can be solved by writing a single Python function, a single JSON object, or a single regex
* Focus on tasks that do not require writing much code

Please generate ${count} objects.
`;

    const messages: Message[] = [];
    addUserMessage(messages, prompt);
    // Prefill + stop sequence = raw JSON only (same trick as the Structured data lesson)
    addAssistantMessage(messages, `${FENCE}json`);
    const text = await chat(messages, { stopSequences: [FENCE] });

    const data: unknown = JSON.parse(text.trim());

    // Basic sanity check: every record must have a string "task" field
    if (
        !Array.isArray(data) ||
        !data.every((item) => typeof item?.task === "string")
    ) {
        throw new Error("Malformed dataset returned by the model");
    }
    return data as Task[];
}

const dataset = await generateDataset(3);
console.log(JSON.stringify(dataset, null, 2));

// Save so the next lessons (running the eval) can load it
writeFileSync("dataset.json", JSON.stringify(dataset, null, 2));
console.log(`\nSaved ${dataset.length} records to dataset.json`);