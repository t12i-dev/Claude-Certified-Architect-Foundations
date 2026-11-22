export const DOC_LIST_URI = "docs://documents";
export const docUri = (id: string) => `${DOC_LIST_URI}/${encodeURIComponent(id)}`;

// "@name" tokens that match a KNOWN document id (emails and unknown handles are left alone)
export function extractMentions(text: string, knownIds: string[]): string[] {
    const found = new Set<string>();
    // The lookbehind skips "bob@plan.md": a mention must not follow a word character
    for (const match of text.matchAll(/(?<![\w@])@(\w[\w.\-]*)/g)) {
        const id = match[1].replace(/[.\-]+$/, ""); // "Read @plan.md." -> "plan.md"
        if (knownIds.includes(id)) found.add(id);
    }
    return [...found];
}

// Documents first (wrapped in tags), then the user's question
export function buildPrompt(question: string, docs: { id: string; text: string }[]): string {
    if (docs.length === 0) return question;
    const blocks = docs.map((d) => `<document id="${d.id}">\n${d.text}\n</document>`);
    return `${blocks.join("\n\n")}\n\n${question}`;
}
