import { getCurrentDatetime, getCurrentDatetimeSchema } from "./tools.js";

// Compare what the schema ALLOWS with what the function ACCEPTS
const props = getCurrentDatetimeSchema.input_schema.properties as Record<
    string,
    { pattern?: string; minLength?: number }
>;
const { pattern, minLength = 0 } = props.date_format;
const re = new RegExp(pattern!);

const samples = [
    "%Y-%m-%d", "%A, %B %d, %Y", "%H:%M", "%y/%m", "%%", "100%% done", "hello",
    "%Z", "%j", "%p", "%I:%M %p", "%Y-%m-%d %Q",
    "", "%", "abc%",
];

let mismatches = 0;
for (const s of samples) {
    const schemaOk = s.length >= minLength && re.test(s);

    let functionOk = true;
    try {
        getCurrentDatetime(s);
    } catch {
        functionOk = false;
    }

    const same = schemaOk === functionOk;
    if (!same) mismatches++;
    console.log(
        `${same ? "OK      " : "MISMATCH"} schema=${schemaOk} function=${functionOk}  ${JSON.stringify(s)}`,
    );
}

console.log(mismatches === 0 ? "\nSchema and function agree." : `\n${mismatches} mismatch(es).`);
