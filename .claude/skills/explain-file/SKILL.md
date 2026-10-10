---
name: explain-file
description: Explain the structure and purpose of a single source file: its role, main components, how they interact, and external dependencies. Use when asked to explain, summarize, or understand a whole file or module. For a single function, use explain-function instead.
---

# Explain File

Read the whole file before answering. Never invent details.

## Workflow

1. Read the full file; note language, role (controller, service, util, config...).
2. Identify top-level components: classes, functions, constants, exports.
3. Map how components call each other and what the file imports/exports.
4. Peek at direct importers/dependencies only if needed to explain the file's role.

## Response format

1. **Overview**: 2-3 sentences on what the file is for and where it fits.
2. **Components**: table or short list, one line per function/class (name, purpose).
3. **Flow**: how the pieces connect (entry points → helpers → I/O). Use a small diagram if it helps.
4. **Dependencies & side effects**: imports, DB/queue/AWS/API calls, shared state.
5. **Things to watch**: tricky logic, edge cases, possible bugs.

## Rules

- Summarize by structure; do not narrate line by line.
- Cite locations as `path/file.ext:line`.
- Offer to deep-dive any function (via explain-function) instead of expanding all of them.
- Respond in the user's language; keep identifiers unchanged.
