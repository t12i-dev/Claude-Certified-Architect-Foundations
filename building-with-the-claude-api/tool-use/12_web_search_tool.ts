import type Anthropic from "@anthropic-ai/sdk";
import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    type Message,
    type ToolDef,
} from "../lib.js";

// Usage: npx tsx tool-use/12_web_search_tool.ts "your question" [domain1 domain2 ...]
const question =
    process.argv[2] ??
    "What is the latest stable version of Node.js, and when was it released?";
const allowedDomains = process.argv.slice(3);

// A server tool: a small stub is enough, Anthropic runs the searches.
// The version string can change over time: check the web search tool docs.
const webSearchTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3, // caps searches (and therefore cost) per request
    ...(allowedDomains.length > 0 && { allowed_domains: allowedDomains }),
} as ToolDef;

// Print what Claude searched for and what came back
function logSearchActivity(response: Anthropic.Message) {
    for (const block of response.content) {
        if (block.type === "server_tool_use") {
            console.log(`[search] ${JSON.stringify(block.input)}`);
        } else if (block.type === "web_search_tool_result") {
            if (Array.isArray(block.content)) {
                for (const r of block.content) console.log(`  result: ${r.title} (${r.url})`);
            } else {
                console.log(`  search error: ${block.content.error_code}`);
            }
        }
    }
}

// A turn may be paused by the API (stop_reason "pause_turn"):
// hand the paused content back unchanged and Claude continues.
async function ask(messages: Message[]): Promise<Anthropic.Message[]> {
    const responses: Anthropic.Message[] = [];

    for (let attempt = 0; attempt < 5; attempt++) {
        const response = await chatRaw(messages, { tools: [webSearchTool] });
        responses.push(response);
        logSearchActivity(response);

        if (response.stop_reason !== "pause_turn") return responses;

        console.log("  (pause_turn: handing the paused turn back so Claude can continue)");
        addAssistantMessage(messages, response.content); // keep ALL blocks, unchanged
    }
    throw new Error("Still paused after 5 continuations");
}

// The answer is split into many text blocks, each with its own citations:
// join the text and turn citations into numbered markers like [1]
function renderAnswer(responses: Anthropic.Message[]) {
    const sources = new Map<string, { n: number; title: string }>();
    let answer = "";

    for (const response of responses) {
        for (const block of response.content) {
            if (block.type !== "text") continue;
            answer += block.text;

            const marks = new Set<number>();
            for (const c of block.citations ?? []) {
                if (c.type !== "web_search_result_location") continue;
                if (!sources.has(c.url)) sources.set(c.url, { n: sources.size + 1, title: c.title ?? c.url });
                marks.add(sources.get(c.url)!.n);
            }
            answer += [...marks].map((n) => `[${n}]`).join("");
        }
    }

    console.log(`\nAnswer:\n${answer.trim()}`);
    console.log("\nSources:");
    for (const [url, { n, title }] of sources) console.log(`  [${n}] ${title} <${url}>`);
    if (sources.size === 0) console.log("  (no citations: Claude may have answered without searching)");
}

const messages: Message[] = [];
addUserMessage(messages, question);

console.log(`Question: ${question}`);
if (allowedDomains.length) console.log(`Allowed domains: ${allowedDomains.join(", ")}`);
console.log();

const responses = await ask(messages);
renderAnswer(responses);

// Usage: each search is billed on top of tokens
const searches = responses.reduce(
    (sum, r) => sum + (r.usage.server_tool_use?.web_search_requests ?? 0),
    0,
);
const inputTokens = responses.reduce((sum, r) => sum + r.usage.input_tokens, 0);
const outputTokens = responses.reduce((sum, r) => sum + r.usage.output_tokens, 0);
console.log(
    `\nUsage: ${searches} search(es) | ${inputTokens} input tokens | ${outputTokens} output tokens`,
);
