import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ToolDef } from "../lib.js";

// The small stub Claude expands into the full text editor tool.
// Version strings depend on the model: check the text editor tool docs for yours.
export function getTextEditorTool(model: string, maxCharacters = 10_000): ToolDef {
    if (model.startsWith("claude-3-7-sonnet")) {
        return { type: "text_editor_20250124", name: "str_replace_editor" } as ToolDef;
    }
    if (model.startsWith("claude-3-5-sonnet")) {
        // The SDK types no longer include this old version, so go through unknown
        return { type: "text_editor_20241022", name: "str_replace_editor" } as unknown as ToolDef;
    }
    // Claude 4 family and later
    return {
        type: "text_editor_20250728",
        name: "str_replace_based_edit_tool",
        max_characters: maxCharacters,
    } as ToolDef;
}

export const TEXT_EDITOR_NAMES = ["str_replace_based_edit_tool", "str_replace_editor"];

// The tool schema is built into Claude, but THIS is the implementation you must write.
// Everything is confined to rootDir: the model must never touch the rest of the disk.
export function createTextEditor(
    rootDir: string,
    maxCharacters = 10_000,
): (input: unknown) => string {
    mkdirSync(rootDir, { recursive: true });
    const realRoot = realpathSync(rootDir);

    const isInside = (target: string): boolean => {
        const rel = path.relative(realRoot, target);
        return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
    };

    const display = (full: string) => path.relative(realRoot, full) || ".";

    // Resolve a model-supplied path and make sure it cannot leave the workspace,
    // neither with ../ nor through a symlink.
    function resolveSafe(p: unknown): string {
        if (typeof p !== "string" || p.trim() === "") {
            throw new Error("path must be a non-empty string");
        }
        const full = path.resolve(realRoot, p);

        let existing = full;
        while (!existsSync(existing)) existing = path.dirname(existing);

        if (!isInside(full) || !isInside(realpathSync(existing))) {
            throw new Error(
                `Path "${p}" is outside the workspace. Use a path relative to the workspace root, e.g. "main.js".`,
            );
        }
        return full;
    }

    function assertFile(full: string) {
        const stat = statSync(full, { throwIfNoEntry: false });
        if (!stat) throw new Error(`File not found: ${display(full)}`);
        if (stat.isDirectory()) throw new Error(`${display(full)} is a directory, not a file`);
    }

    const readLines = (full: string): string[] => {
        const content = readFileSync(full, "utf-8");
        return content === "" ? [] : content.replace(/\n$/, "").split("\n");
    };

    function view(full: string, viewRange: unknown): string {
        const stat = statSync(full, { throwIfNoEntry: false });
        if (!stat) throw new Error(`Path does not exist: ${display(full)}`);

        if (stat.isDirectory()) {
            const entries = readdirSync(full, { withFileTypes: true })
                .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
                .sort();
            return entries.length ? entries.join("\n") : "(empty directory)";
        }

        const lines = readLines(full);
        let start = 1;
        let end = lines.length;

        if (viewRange !== undefined) {
            if (
                !Array.isArray(viewRange) ||
                viewRange.length !== 2 ||
                !viewRange.every((n) => Number.isInteger(n))
            ) {
                throw new Error("view_range must be two integers: [start, end]");
            }
            [start, end] = viewRange as [number, number];
            if (end === -1) end = lines.length; // -1 means "until the end of the file"
            if (start < 1 || end < start || end > lines.length) {
                throw new Error(
                    `Invalid view_range [${start}, ${end}]: the file has ${lines.length} lines (line numbers start at 1, use -1 as the end for end of file)`,
                );
            }
        }

        const text = lines
            .slice(start - 1, end)
            .map((line, i) => `${start + i}: ${line}`)
            .join("\n");

        return text.length > maxCharacters
            ? `${text.slice(0, maxCharacters)}\n[truncated: output exceeded ${maxCharacters} characters, use view_range to read the rest]`
            : text;
    }

    function strReplace(full: string, oldStr: unknown, newStr: unknown): string {
        assertFile(full);
        if (typeof oldStr !== "string" || oldStr === "") {
            throw new Error("old_str must be a non-empty string");
        }
        if (newStr !== undefined && typeof newStr !== "string") {
            throw new Error("new_str must be a string (use an empty string to delete text)");
        }

        const content = readFileSync(full, "utf-8");
        const first = content.indexOf(oldStr);
        if (first === -1) {
            throw new Error(
                `No match found for old_str in ${display(full)}. It must match exactly, including whitespace and indentation: view the file again and copy the exact text.`,
            );
        }
        if (content.indexOf(oldStr, first + 1) !== -1) {
            throw new Error(
                `old_str appears more than once in ${display(full)}. Include more surrounding lines so it matches exactly once.`,
            );
        }

        // slice instead of String.replace: "$&" and similar in new_str must stay literal
        const updated =
            content.slice(0, first) + (newStr ?? "") + content.slice(first + oldStr.length);
        writeFileSync(full, updated);
        return `Successfully replaced text in ${display(full)}`;
    }

    function create(full: string, fileText: unknown): string {
        if (typeof fileText !== "string") throw new Error("file_text must be a string");
        if (existsSync(full)) {
            throw new Error(`${display(full)} already exists. Use str_replace or insert to modify it.`);
        }
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, fileText);
        return `File created: ${display(full)}`;
    }

    function insert(full: string, insertLine: unknown, insertText: unknown): string {
        assertFile(full);
        if (typeof insertLine !== "number" || !Number.isInteger(insertLine)) {
            throw new Error("insert_line must be an integer (0 = beginning of the file)");
        }
        if (typeof insertText !== "string") throw new Error("insert_text must be a string");

        const lines = readLines(full);
        if (insertLine < 0 || insertLine > lines.length) {
            throw new Error(
                `insert_line ${insertLine} is out of range: the file has ${lines.length} lines (valid values: 0 to ${lines.length})`,
            );
        }

        lines.splice(insertLine, 0, ...insertText.replace(/\n$/, "").split("\n"));
        writeFileSync(full, lines.join("\n") + "\n");
        return `Inserted text after line ${insertLine} of ${display(full)}`;
    }

    // The handler: one entry point for every command the model can send
    return (input: unknown): string => {
        const args = (
            typeof input === "object" && input !== null ? input : {}
        ) as Record<string, unknown>;

        switch (args.command) {
            case "view":
                return view(resolveSafe(args.path), args.view_range);
            case "str_replace":
                return strReplace(resolveSafe(args.path), args.old_str, args.new_str);
            case "create":
                return create(resolveSafe(args.path), args.file_text);
            case "insert":
                return insert(resolveSafe(args.path), args.insert_line, args.insert_text);
            default:
                throw new Error(
                    `Unsupported command "${String(args.command)}". Supported: view, str_replace, create, insert.`,
                );
        }
    };
}
