import type Anthropic from "@anthropic-ai/sdk";

// ---------- Tool function: plain code that YOUR program runs ----------
// Claude never executes it; it only requests a call.

const pad = (n: number) => String(n).padStart(2, "0");

// A small subset of strftime directives (JS has no built-in strftime)
const DIRECTIVES: Record<string, (d: Date) => string> = {
    "%Y": (d) => String(d.getFullYear()),
    "%y": (d) => pad(d.getFullYear() % 100),
    "%m": (d) => pad(d.getMonth() + 1),
    "%d": (d) => pad(d.getDate()),
    "%H": (d) => pad(d.getHours()),
    "%M": (d) => pad(d.getMinutes()),
    "%S": (d) => pad(d.getSeconds()),
    "%A": (d) => d.toLocaleDateString("en-US", { weekday: "long" }),
    "%B": (d) => d.toLocaleDateString("en-US", { month: "long" }),
    "%%": () => "%",
};

export function getCurrentDatetime(
    dateFormat: string = "%Y-%m-%d %H:%M:%S",
): string {
    // Validate input and fail with a clear message Claude can learn from.
    // (The default only applies to undefined, so "" still reaches this check.)
    if (!dateFormat) {
        throw new Error("dateFormat cannot be empty");
    }

    // Uses the local time zone of the machine running this code
    const now = new Date();

    // "%.?" also matches a lone trailing "%", which is then rejected as unsupported
    return dateFormat.replace(/%.?/g, (directive) => {
        const format = DIRECTIVES[directive];
        if (!format) {
            throw new Error(
                `Unsupported format directive "${directive}". Supported: ${Object.keys(DIRECTIVES).join(" ")}`,
            );
        }
        return format(now);
    });
}

// ---------- Tool schema: the documentation Claude reads ----------
// Naming pattern: <function>Schema. Anthropic.Tool is the TS counterpart of Python's ToolParam.
// By default the API does NOT enforce this schema, so the function must still validate.

// ---------- Instead of writing JSON schemas from scratch, you can use Claude itself to generate them ---------- 
// 1. Copy your tool function code
// 2. Go to Claude and ask it to write a JSON schema for tool calling
// 3. Include the Anthropic documentation on tool use as context
// 4. Let Claude generate a properly formatted schema following best practices
// The prompt should be something like:
// "Write a valid JSON schema spec for the purposes of tool calling for this function. Follow the best practices listed in the attached documentation."

export const getCurrentDatetimeSchema: Anthropic.Tool = {
    name: "get_current_datetime",
    description:
        "Returns the current date and/or time as a formatted string, using a strftime-style format. " +
        "Use this whenever you need to know the current date or time (e.g. 'what day is it', 'how long until Friday', timestamping output), since you have no clock of your own. " +
        "The time is in the local time zone of the machine running the tool, which may differ from the user's time zone; there is no time zone parameter, so do not assume the result reflects the user's location. " +
        "Returns a single plain string such as '2026-10-23 17:03:00'. " +
        "Only the directives listed under date_format are supported; any other directive (e.g. %Z, %j, %p) causes an error that lists the supported ones.",
    input_schema: {
        type: "object",
        properties: {
            date_format: {
                type: "string",
                description:
                    "Optional strftime-style format string controlling the output. " +
                    "Supported directives: %Y (4-digit year), %y (2-digit year), %m (month 01-12), %d (day 01-31), " +
                    "%H (hour 00-23, 24-hour clock), %M (minute 00-59), %S (second 00-59), " +
                    "%A (full weekday name, English, e.g. 'Friday'), %B (full month name, English, e.g. 'October'), " +
                    "%% (literal percent sign). All other characters are copied literally. Must not be empty. " +
                    "Examples: '%Y-%m-%d' -> '2026-10-23'; '%A, %B %d, %Y' -> 'Friday, October 23, 2026'; '%H:%M' -> '17:03'. " +
                    "If omitted, defaults to '%Y-%m-%d %H:%M:%S'.",
                default: "%Y-%m-%d %H:%M:%S",
                minLength: 1,
                pattern: "^([^%]|%[YymdHMSAB%])+$",
                examples: ["%Y-%m-%d", "%A, %B %d, %Y", "%H:%M"],
            },
        },
        required: [],
        additionalProperties: false,
    },
};
