import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config"; // loads .env into process.env
import { writeFileSync } from "node:fs";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Dataset generation is simple, high-volume work, so a fast/cheap model is enough
const model = "claude-haiku-4-5-20251001";

// Built with repeat() so we don't have to escape backticks inside template literals
const FENCE = "`".repeat(3);

type Message = Anthropic.MessageParam;

type ChatOptions = {
    system?: string;
    temperature?: number;
    stopSequences?: string[];
};

function addUserMessage(messages: Message[], text: string) {
    messages.push({ role: "user", content: text });
}

function addAssistantMessage(messages: Message[], text: string) {
    messages.push({ role: "assistant", content: text });
}

async function chat(
    messages: Message[],
    { system, temperature = 1.0, stopSequences }: ChatOptions = {},
): Promise<string> {
    const response = await client.messages.create({
        model,
        max_tokens: 1000,
        messages,
        temperature,
        system,
        stop_sequences: stopSequences,
    });

    // response.content is an array of blocks, so TS forces us to narrow the type
    const block = response.content[0];
    if (block.type !== "text") {
        throw new Error(`Expected a text block, got: ${block.type}`);
    }
    return block.text;
}

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