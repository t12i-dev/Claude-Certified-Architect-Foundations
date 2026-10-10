import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type TestCase = {
    description: string;
    promptInputs: Record<string, string>;
    solutionCriteria: string[];
};

type CaseResult = {
    testCase: TestCase;
    output: string;
    score: number;
    reasoning: string;
    weaknesses?: string[];
};

// Resolve paths next to this script, not relative to where the command was run
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Usage: npx tsx prompt-engineering/report.ts [results_v1.json] [report_v1.html]
// Args are file names inside the prompt-engineering folder
const resultsFile = here(process.argv[2] ?? "results_v1.json");
const htmlFile = here(process.argv[3] ?? "report_v1.html");

// Keep in sync with PASS_THRESHOLD in evaluator.ts
const PASS_THRESHOLD = 7;

const { results } = JSON.parse(readFileSync(resultsFile, "utf-8")) as {
    results: CaseResult[];
};

// Model output is arbitrary text, so always escape it before embedding in HTML
const esc = (s: string) =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const list = (items: string[]) =>
    `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

const average = results.reduce((s, r) => s + r.score, 0) / results.length;
const passRate =
    results.filter((r) => r.score >= PASS_THRESHOLD).length / results.length;

const scoreClass = (score: number) =>
    score >= PASS_THRESHOLD ? "good" : score >= 4 ? "mid" : "bad";

// Worst cases first: that's where the prompt is failing
const rows = [...results]
    .sort((a, b) => a.score - b.score)
    .map((r) => {
        const inputs = Object.entries(r.testCase.promptInputs)
            .map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`)
            .join("");

        return `
      <tr>
        <td>${esc(r.testCase.description)}</td>
        <td>${inputs}</td>
        <td>${list(r.testCase.solutionCriteria)}</td>
        <td><div class="md">${esc(r.output)}</div></td>
        <td><span class="score ${scoreClass(r.score)}">${r.score}</span></td>
        <td>${esc(r.reasoning)}${r.weaknesses?.length ? list(r.weaknesses) : ""}</td>
      </tr>`;
    })
    .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prompt Evaluation Report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f0f0f0; color: #222; }
  header { padding: 24px 32px 8px; }
  h1 { margin: 0 0 16px; }
  .cards { display: flex; gap: 16px; flex-wrap: wrap; padding: 0 32px 24px; }
  .card { background: #fff; border-radius: 8px; padding: 14px 20px; min-width: 200px; flex: 1; }
  .card .label { font-size: 13px; color: #555; }
  .card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; table-layout: fixed; }
  th { background: #2d2d2d; color: #fff; text-align: left; padding: 10px 12px; font-size: 14px; }
  td { padding: 12px; vertical-align: top; border-bottom: 1px solid #e3e3e3; font-size: 13.5px; }
  tr:nth-child(even) td { background: #fafafa; }
  th:nth-child(1) { width: 12%; } th:nth-child(2) { width: 14%; }
  th:nth-child(3) { width: 22%; } th:nth-child(4) { width: 26%; }
  th:nth-child(5) { width: 6%; }  th:nth-child(6) { width: 20%; }
  /* Output is markdown: shown as raw text until marked renders it (or if the CDN is unreachable) */
  .md { padding: 10px 12px; background: #eef0ee; border-radius: 6px; max-height: 320px; overflow: auto;
        white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; }
  .md.rendered { white-space: normal; }
  .md h1, .md h2, .md h3 { margin: 12px 0 6px; line-height: 1.25; }
  .md h1 { font-size: 17px; } .md h2 { font-size: 15px; } .md h3 { font-size: 14px; }
  .md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
  .md p { margin: 6px 0; }
  .md ul, .md ol { margin: 6px 0; padding-left: 20px; color: inherit; }
  .md table { width: auto; border-collapse: collapse; background: #fff; margin: 8px 0; table-layout: auto; }
  .md th, .md td { border: 1px solid #ccd; padding: 4px 8px; font-size: 12.5px; background: #fff; }
  .md th { background: #dde0dd; color: #222; }
  .md code { background: #dfe3df; padding: 1px 4px; border-radius: 3px; }
  .score { display: inline-block; min-width: 28px; text-align: center; padding: 4px 8px;
           border-radius: 4px; font-weight: 700; }
  .score.bad  { background: #f8d0d0; color: #a11; }
  .score.mid  { background: #fdebc0; color: #8a5a00; }
  .score.good { background: #cdeccd; color: #1a6b1a; }
  ul { margin: 6px 0 0; padding-left: 18px; color: #444; }
  td > ul:first-child { margin-top: 0; }
</style>
</head>
<body>
<header><h1>Prompt Evaluation Report</h1></header>
<div class="cards">
  <div class="card"><div class="label">Total Test Cases</div><div class="value">${results.length}</div></div>
  <div class="card"><div class="label">Average Score</div><div class="value">${average.toFixed(1)} / 10</div></div>
  <div class="card"><div class="label">Pass Rate (&ge;${PASS_THRESHOLD})</div><div class="value">${(passRate * 100).toFixed(1)}%</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>Test Case</th><th>Scenario</th><th>Solution Criteria</th>
      <th>Output</th><th>Score</th><th>Reasoning</th>
    </tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
<script>
  if (window.marked && window.DOMPurify) {
    document.querySelectorAll(".md").forEach((el) => {
      el.innerHTML = DOMPurify.sanitize(marked.parse(el.textContent));
      el.classList.add("rendered");
    });
  }
</script>
</body>
</html>`;

writeFileSync(htmlFile, html);
console.log(`Report written to ${htmlFile}`);
