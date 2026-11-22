// The minimal shape of an MCP prompt that this module needs
export type PromptInfo = {
    name: string;
    arguments?: { name: string; required?: boolean }[];
};

export function usage(prompt: PromptInfo): string {
    const args = (prompt.arguments ?? []).map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`));
    return [`/${prompt.name}`, ...args].join(" ");
}

export type ParsedCommand =
    | { ok: true; name: string; args: Record<string, string> }
    | { ok: false; error: string };

// "/format plan.md" -> { name: "format", args: { doc_id: "plan.md" } }
// Values are positional and split on whitespace (values containing spaces are not supported)
export function parseCommand(line: string, prompts: PromptInfo[]): ParsedCommand {
    const [name, ...values] = line.slice(1).trim().split(/\s+/);
    const prompt = prompts.find((p) => p.name === name);
    if (!prompt) {
        return { ok: false, error: `Unknown command /${name}. Available: ${prompts.map(usage).join(", ")}` };
    }

    const declared = prompt.arguments ?? [];
    if (values.length > declared.length) {
        return { ok: false, error: `Too many arguments. Usage: ${usage(prompt)}` };
    }

    const args: Record<string, string> = {};
    declared.forEach((a, i) => {
        if (values[i] !== undefined) args[a.name] = values[i];
    });

    const missing = declared.filter((a) => a.required && args[a.name] === undefined);
    if (missing.length > 0) {
        return { ok: false, error: `Missing ${missing.map((a) => a.name).join(", ")}. Usage: ${usage(prompt)}` };
    }
    return { ok: true, name: prompt.name, args };
}
