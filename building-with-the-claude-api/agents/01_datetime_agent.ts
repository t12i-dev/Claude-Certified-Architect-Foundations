import {
    addAssistantMessage,
    addUserMessage,
    chatRaw,
    textFromMessage,
    type Message,
    type ToolDef,
} from "../lib.js";

// Usage: npx tsx agents/01_datetime_agent.ts [runsPerTask]
// Several runs per task show how much the tool chain varies between runs
const parsed = Number(process.argv[2]);
const RUNS = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
const MAX_TURNS = 8; // safety net: the loop normally ends on stop_reason
const CONCURRENCY = 3;

const SYSTEM =
    "You are a scheduling assistant. Use the tools for any date or time computation; never compute dates yourself. " +
    "If required information is missing, ask the user instead of guessing. All times are UTC.";

// ---------- Three small, combinable tools ----------
const TOOLS: ToolDef[] = [
    {
        name: "get_current_datetime",
        description: "Returns the current date and time (UTC) as an ISO string, plus the weekday.",
        input_schema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "add_duration_to_datetime",
        description:
            "Adds a duration to an ISO datetime (UTC) and returns the new datetime with its weekday. " +
            "Use a negative amount to subtract. Months and years keep the day of month when possible.",
        input_schema: {
            type: "object",
            properties: {
                datetime: { type: "string", description: "ISO 8601 datetime, for example 2026-11-28T10:00:00.000Z" },
                amount: { type: "number", description: "How many units to add (can be negative)" },
                unit: { type: "string", enum: ["minutes", "hours", "days", "weeks", "months", "years"] },
            },
            required: ["datetime", "amount", "unit"],
        },
    },
    {
        name: "set_reminder",
        description: "Creates a reminder at an ISO datetime (UTC) with a message. Returns the reminder id.",
        input_schema: {
            type: "object",
            properties: {
                datetime: { type: "string", description: "ISO 8601 datetime (UTC) when the reminder fires" },
                message: { type: "string", description: "What to remind the user about" },
            },
            required: ["datetime", "message"],
        },
    },
] as ToolDef[];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const describe = (d: Date) => JSON.stringify({ iso: d.toISOString(), weekday: WEEKDAYS[d.getUTCDay()] });

function addDuration(iso: string, amount: number, unit: string): Date {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid datetime: ${iso}`);
    const ms: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 };
    if (unit in ms) return new Date(d.getTime() + amount * ms[unit]);
    if (unit === "months" || unit === "years") {
        const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + (unit === "years" ? amount * 12 : amount);
        const year = Math.floor(total / 12);
        const month = total - year * 12;
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        return new Date(
            Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
        );
    }
    throw new Error(`Unknown unit: ${unit}`);
}

type State = { reminders: { datetime: string; message: string }[] }; // per run: runs do not share state

function execute(name: string, input: Record<string, unknown>, state: State): string {
    switch (name) {
        case "get_current_datetime":
            return describe(new Date());
        case "add_duration_to_datetime":
            return describe(addDuration(String(input.datetime), Number(input.amount), String(input.unit)));
        case "set_reminder": {
            const datetime = String(input.datetime);
            if (Number.isNaN(new Date(datetime).getTime())) throw new Error(`Invalid datetime: ${datetime}`);
            state.reminders.push({ datetime, message: String(input.message) });
            return JSON.stringify({ id: state.reminders.length, status: "created" });
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ---------- The agent loop: driven by stop_reason ----------
type RunResult = { chain: string[]; answer: string; turns: number; reminders: number };

async function runAgent(task: string): Promise<RunResult> {
    const state: State = { reminders: [] };
    const messages: Message[] = [];
    const chain: string[] = [];
    addUserMessage(messages, task);

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        const response = await chatRaw(messages, { system: SYSTEM, tools: TOOLS, temperature: 0 });
        addAssistantMessage(messages, response.content); // keep ALL blocks

        if (response.stop_reason !== "tool_use") {
            // Final answer, or a clarifying question: both are valid ways to end
            return { chain, answer: textFromMessage(response), turns: turn, reminders: state.reminders.length };
        }

        const results: {
            type: "tool_result";
            tool_use_id: string;
            content: string;
            is_error: boolean;
        }[] = [];
        for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            chain.push(block.name);
            try {
                results.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: execute(block.name, block.input as Record<string, unknown>, state),
                    is_error: false,
                });
            } catch (err) {
                results.push({ type: "tool_result", tool_use_id: block.id, content: (err as Error).message, is_error: true });
            }
        }
        addUserMessage(messages, results);
    }
    throw new Error(`No final answer after ${MAX_TURNS} turns`);
}

// ---------- Run the lesson's kinds of task ----------
const TASKS = [
    "What's the time?",
    "What day of the week is it in 11 days?",
    "Set a reminder for the gym next Wednesday at 18:00.",
    "I was born on 1990-03-14. On what date do I turn 12000 days old?",
    "Remind me in 90 minutes to check the deploy.",
    "When does my 90-day warranty expire?",
];

async function mapSettled<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            try {
                results[i] = { status: "fulfilled", value: await fn(items[i]) };
            } catch (reason) {
                results[i] = { status: "rejected", reason };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

const jobs = TASKS.flatMap((task, taskIndex) => Array.from({ length: RUNS }, () => ({ task, taskIndex })));
const settled = await mapSettled(jobs, CONCURRENCY, (job) => runAgent(job.task));

console.log(`${TASKS.length} tasks x ${RUNS} run(s)\n`);
TASKS.forEach((task, taskIndex) => {
    const runs: RunResult[] = [];
    let errors = 0;
    settled.forEach((result, i) => {
        if (jobs[i].taskIndex !== taskIndex) return;
        if (result.status === "fulfilled") runs.push(result.value);
        else errors++;
    });

    console.log(`=== ${task}`);
    if (runs.length === 0) {
        console.log(`all runs failed (${errors})\n`);
        return;
    }
    const chains = new Map<string, number>();
    for (const r of runs) {
        const key = r.chain.length > 0 ? r.chain.join(" > ") : "(no tool call)";
        chains.set(key, (chains.get(key) ?? 0) + 1);
    }
    const avgTools = runs.reduce((t, r) => t + r.chain.length, 0) / runs.length;
    console.log(`distinct tool chains: ${chains.size} | avg tool calls: ${avgTools.toFixed(1)} | errors: ${errors}`);
    for (const [chain, count] of chains) console.log(`  ${count}x ${chain}`);
    console.log(`first answer: ${runs[0].answer.split("\n")[0]}\n`);
});
