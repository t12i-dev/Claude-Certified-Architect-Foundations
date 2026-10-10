---
name: explain-function
description: Explain a function or method (control flow, inputs, outputs, dependencies, edge cases). Use when asked to explain, understand, trace, or "what does X do" about a specific function, in the codebase or in pasted code.
---

# Explain Function

Inspect the actual source before answering. Never invent implementation details.

## Workflow

1. If code is pasted in the conversation, use it directly. Otherwise locate the function (language, file, line). If several match, list them and pick the most contextually likely one, saying so.
2. Read the full function plus relevant types, decorators, and enclosing class/module.
3. Trace helper calls only when the function's behavior depends on them (max 1–2 levels). Skip stdlib and third-party internals.
4. Separate confirmed behavior from assumptions; flag assumptions explicitly.

## Response format

Start with a one-sentence summary of what the function does. Then use only the sections that add value:

- **Purpose** – the problem it solves
- **Inputs** – parameters, types, defaults, constraints
- **Outputs** – return values, side effects, exceptions
- **Execution flow** – walk through branches and loops in order
- **Example** – small input/output case (when it clarifies)
- **Dependencies** – key helpers, external calls, shared state
- **Edge cases** – failure paths, boundary conditions

Trivial functions: 2–4 sentences, no headers.

## Rules

- Plain language first, then technical terms.
- Cite locations as `path/file.ext:line` and use real identifier names.
- Short snippets only when they clarify behavior; explain why, not line-by-line what.
- Do not modify code unless asked.
- Do not explore beyond what the function needs. If context is missing, say what to inspect.
- Respond in the user's language; keep identifiers unchanged.
- Keep the first answer concise; expand on request.