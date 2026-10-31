import type Anthropic from "@anthropic-ai/sdk";
import { client, model } from "../lib.js";

const saveArticleSchema: Anthropic.Tool = {
    name: "save_article",
    description:
        "Saves an article with its abstract and metadata. " +
        "Use it whenever the user asks to save or store an article. " +
        "The abstract is the full abstract text; meta holds the word count of the abstract and a short review. " +
        "Returns a confirmation message.",
    input_schema: {
        type: "object",
        properties: {
            abstract: {
                type: "string",
                description: "The full abstract of the article, as plain text.",
            },
            meta: {
                type: "object",
                description: "Metadata about the article.",
                properties: {
                    word_count: {
                        type: "integer",
                        description: "Number of words in the abstract.",
                    },
                    review: {
                        type: "string",
                        description: "A one or two sentence review of the article.",
                    },
                },
                required: ["word_count", "review"],
            },
        },
        required: ["abstract", "meta"],
    },
};

// A long abstract makes the buffering delay visible
const PROMPT =
    "Write a realistic research abstract of about 250 words on quantum networking, " +
    "then save it with the save_article tool. In meta, give its word count and a short review.";

type Mode = "default" | "fine-grained";
type Summary = {
    mode: Mode;
    firstChunkMs: number;
    totalMs: number;
    chunks: number;
    validJson: boolean;
};

function tryParse(
    text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function streamToolCall(mode: Mode): Promise<Summary> {
    console.log(`\n=== ${mode} ===`);

    // Fine-grained streaming is a per-tool flag.
    // The cast is only needed if your SDK version predates the field
    // (fix with: npm i @anthropic-ai/sdk@latest)
    const tool =
        mode === "fine-grained"
            ? ({ ...saveArticleSchema, eager_input_streaming: true } as Anthropic.Tool)
            : saveArticleSchema;

    const start = Date.now();

    // Raw stream: we accumulate the JSON ourselves, so nothing parses it behind our back
    const stream = await client.messages.create({
        model,
        max_tokens: 2000,
        stream: true,
        tools: [tool],
        tool_choice: { type: "tool", name: "save_article" }, // force the tool, for a stable demo
        messages: [{ role: "user", content: PROMPT }],
    });

    let json = "";
    let chunks = 0;
    let firstChunkMs = 0;
    let stopReason: string | null = null;

    for await (const event of stream) {
        switch (event.type) {
            case "content_block_start":
                if (event.content_block.type === "tool_use") json = ""; // new call: reset buffer
                break;

            case "content_block_delta":
                if (event.delta.type === "input_json_delta") {
                    chunks++;
                    json += event.delta.partial_json;
                    const elapsed = Date.now() - start;
                    if (chunks === 1) firstChunkMs = elapsed;
                    if (chunks <= 6) {
                        console.log(
                            `  +${elapsed}ms chunk #${chunks}: ${JSON.stringify(event.delta.partial_json.slice(0, 60))}`,
                        );
                    }
                }
                break;

            case "message_delta":
                stopReason = event.delta.stop_reason;
                break;
        }
    }

    const totalMs = Date.now() - start;

    // Only now is the argument complete. Check it BEFORE running any tool.
    const parsed = tryParse(json);
    if (!parsed.ok) {
        console.log(
            `  Invalid or incomplete JSON (${parsed.error}). Do NOT run the tool: ` +
            "return is_error to Claude or retry the request.",
        );
    } else {
        const input = parsed.value as { abstract?: unknown; meta?: { word_count?: unknown } };
        console.log(
            `  Valid JSON. abstract: ${String(input.abstract).length} chars, ` +
            `word_count: ${String(input.meta?.word_count)}`,
        );
    }
    if (stopReason === "max_tokens") {
        console.warn("  warning: output was cut off (max_tokens), the JSON is likely truncated");
    }

    return { mode, firstChunkMs, totalMs, chunks, validJson: parsed.ok };
}

const summaries: Summary[] = [];
summaries.push(await streamToolCall("default"));
summaries.push(await streamToolCall("fine-grained"));

console.log("\nSummary");
console.table(summaries);
