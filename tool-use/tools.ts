// Tool functions: plain functions that YOUR code runs when Claude asks for them.
// Claude never executes them; it only requests a call.

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

    return dateFormat.replace(/%./g, (directive) => {
        const format = DIRECTIVES[directive];
        if (!format) {
            throw new Error(
                `Unsupported format directive "${directive}". Supported: ${Object.keys(DIRECTIVES).join(" ")}`,
            );
        }
        return format(now);
    });
}
