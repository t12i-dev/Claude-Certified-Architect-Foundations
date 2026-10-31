import type Anthropic from "@anthropic-ai/sdk";

// ---------- Shared date parsing ----------

export const DURATION_UNITS = [
    "seconds", "minutes", "hours", "days", "weeks", "months", "years",
] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];

// "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" (space or T separator, seconds optional)
const DATETIME_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const MS_PER_UNIT = {
    seconds: 1000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
} as const;

// Dates are treated as wall-clock values and calculated in UTC,
// so daylight saving time can never shift a result.
function parseDatetime(text: string, label: string): { date: Date; hasTime: boolean } {
    const match = DATETIME_RE.exec(text.trim());
    if (!match) {
        throw new Error(
            `Invalid ${label} "${text}". Use "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS".`,
        );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hasTime = match[4] !== undefined;
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const second = Number(match[6] ?? 0);

    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    // Date silently rolls impossible values over (2050-02-30 -> 2050-03-02): reject them
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day ||
        date.getUTCHours() !== hour ||
        date.getUTCMinutes() !== minute ||
        date.getUTCSeconds() !== second
    ) {
        throw new Error(`"${text}" is not a real calendar date/time`);
    }
    return { date, hasTime };
}

function formatDatetime(date: Date, dateOnly: boolean): string {
    const day = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    if (dateOnly) return day;
    return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

// ---------- Tool 2: add_duration_to_datetime ----------

export function addDurationToDatetime(
    datetime: string,
    duration: number,
    unit: string = "days",
): string {
    const { date, hasTime } = parseDatetime(datetime, "datetime");

    if (!Number.isFinite(duration)) {
        throw new Error("duration must be a finite number");
    }
    if (!(DURATION_UNITS as readonly string[]).includes(unit)) {
        throw new Error(
            `Unsupported unit "${unit}". Supported: ${DURATION_UNITS.join(", ")}`,
        );
    }
    const u = unit as DurationUnit;

    let result: Date;
    if (u === "months" || u === "years") {
        if (!Number.isInteger(duration)) {
            throw new Error("duration must be a whole number for months and years");
        }
        const months = u === "years" ? duration * 12 : duration;
        const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
        const year = Math.floor(total / 12);
        const month = total - year * 12;
        // Clamp to the last day of the target month (Jan 31 + 1 month = Feb 28/29)
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        result = new Date(date);
        result.setUTCFullYear(year, month, Math.min(date.getUTCDate(), lastDay));
    } else {
        result = new Date(date.getTime() + duration * MS_PER_UNIT[u]);
    }

    // Date-only input stays date-only, unless the unit is a time-of-day unit
    const dateOnly =
        !hasTime && ["days", "weeks", "months", "years"].includes(u);
    return formatDatetime(result, dateOnly);
}

export const addDurationToDatetimeSchema: Anthropic.Tool = {
    name: "add_duration_to_datetime",
    description:
        "Adds or subtracts an amount of time to a date or datetime and returns the exact result. " +
        "Use it for every date calculation (e.g. '177 days after Jan 1st 2050', 'in 3 months', 'two weeks from a known date') " +
        "instead of calculating dates yourself, because mental date arithmetic is error-prone. " +
        "Returns a string: 'YYYY-MM-DD' for a date-only input (when the unit is days, weeks, months or years), otherwise 'YYYY-MM-DD HH:MM:SS'. " +
        "Month and year arithmetic clamps to the last valid day of the month (Jan 31 + 1 month = Feb 28 or 29). " +
        "No time zone conversion is done, and it cannot find weekdays such as 'next Thursday'.",
    input_schema: {
        type: "object",
        properties: {
            datetime: {
                type: "string",
                description:
                    "The starting date or datetime: 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' (24-hour clock). Must be a real calendar date. Example: '2050-01-01'.",
            },
            duration: {
                type: "number",
                description:
                    "How much to add. Use a negative number to subtract. Must be a whole number for months and years. Example: 177.",
            },
            unit: {
                type: "string",
                enum: [...DURATION_UNITS],
                description: "The unit of duration. Defaults to 'days'.",
                default: "days",
            },
        },
        required: ["datetime", "duration"],
    },
};

// ---------- Tool 3: set_reminder ----------

export type Reminder = { id: number; content: string; timestamp: string };

// In-memory store: enough for the exercise (a real system would persist this)
const reminders: Reminder[] = [];

export function setReminder(
    content: string,
    timestamp: string,
): Reminder & { already_existed: boolean } {
    if (!content || !content.trim()) {
        throw new Error("content cannot be empty");
    }
    parseDatetime(timestamp, "timestamp"); // checks the format and that the date is real

    // Idempotent: the same reminder requested twice (e.g. a retried call) is not duplicated
    const existing = reminders.find(
        (r) => r.content === content && r.timestamp === timestamp,
    );
    if (existing) return { ...existing, already_existed: true };

    const reminder: Reminder = { id: reminders.length + 1, content, timestamp };
    reminders.push(reminder);
    return { ...reminder, already_existed: false };
}

export const getReminders = (): Reminder[] => [...reminders];

export const setReminderSchema: Anthropic.Tool = {
    name: "set_reminder",
    description:
        "Creates a reminder that fires at a specific date and time. " +
        "Use it only after you know the exact target date: if the user gave a relative date, calculate it first with add_duration_to_datetime. " +
        "Do not call it twice for the same reminder: identical content and timestamp return the existing reminder instead of creating a duplicate. " +
        "Returns a JSON object with the reminder id, content, timestamp and already_existed. " +
        "The timestamp has no time zone and is interpreted in the user's local time.",
    input_schema: {
        type: "object",
        properties: {
            content: {
                type: "string",
                description:
                    "What to remind the user about, as a short phrase. Example: \"Doctor's appointment\".",
            },
            timestamp: {
                type: "string",
                description:
                    "When the reminder fires: 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' (24-hour clock). If the user gave no time of day, use the date only.",
            },
        },
        required: ["content", "timestamp"],
    },
};
