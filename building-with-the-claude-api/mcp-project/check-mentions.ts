import { buildPrompt, extractMentions } from "./mentions.js";

const ids = ["report.pdf", "plan.md", "spec.txt"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let failures = 0;
function expect(label: string, condition: boolean) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

expect("finds a mention", same(extractMentions("What's in @report.pdf?", ids), ["report.pdf"]));
expect("handles a trailing period", same(extractMentions("Read @plan.md.", ids), ["plan.md"]));
expect("ignores unknown ids", same(extractMentions("see @nope.txt", ids), []));
expect("ignores emails", same(extractMentions("mail bob@plan.md now", ids), []));
expect(
    "dedups and keeps order",
    same(extractMentions("@spec.txt and @report.pdf and @spec.txt", ids), ["spec.txt", "report.pdf"]),
);
expect("no mentions leaves the prompt unchanged", buildPrompt("hello", []) === "hello");
expect(
    "documents come first, wrapped in tags",
    buildPrompt("Q?", [{ id: "plan.md", text: "T" }]) === '<document id="plan.md">\nT\n</document>\n\nQ?',
);

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
