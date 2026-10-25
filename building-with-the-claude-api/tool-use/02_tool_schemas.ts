import { client, model } from "../lib.js";
import { getCurrentDatetimeSchema } from "./tools.js";

// One request with the tool attached. We do NOT run the tool or loop yet:
// that comes in the next lessons (handling message blocks, sending tool results).
const response = await client.messages.create({
    model,
    max_tokens: 1000,
    tools: [getCurrentDatetimeSchema],
    messages: [
        {
            role: "user",
            content: "What is the current time? Give me just the hour and minute.",
        },
    ],
});

console.log("stop_reason:", response.stop_reason);
console.log(JSON.stringify(response.content, null, 2));
// console.log(JSON.stringify(response, null, 2));
