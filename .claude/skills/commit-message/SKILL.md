---
name: commit-message
description: Suggest a commit message written from the actual diff, matching the repo's commit style. Prints the message only; never stages, commits, or pushes. Use only when the user invokes /commit-message.
disable-model-invocation: true
---

# /commit-message: Suggest a commit message

Anything following `/commit-message` is guidance from the user (e.g. "only the lib.ts change", "in Vietnamese", "split it up"). Honor it over the defaults below.

**Read-only skill.** Never run `git add`, `git commit`, `git push`, `git stash`, `git reset`, or anything that changes the repo or index. The user commits by themselves.

## Step 1: Look at the state

```bash
git status --short --branch
git diff --cached --stat
git diff --stat
git log --format='%s' -10
```

If there is nothing to commit, say so and stop.

## Step 2: Pick the diff to describe

- If something is staged, describe the staged diff (`git diff --cached`). Mention that unstaged changes were ignored.
- If nothing is staged, describe the working tree diff (`git diff`).
- Read the full diff, not just the stat.
- If the diff holds two unrelated changes, suggest separate messages, each with the files that belong to it.
- If the diff contains `.env`, credentials, build output, or scratch files, warn the user and name the file. Do not include them in the description.

## Step 3: Write the message

Match the house style from the log (prefix convention, language, casing). Absent one: short imperative subject (~50 chars, no trailing period), and a bullet body only when the change has distinct parts.

The message describes intent, which only the diff shows. Never write it from file names alone. Do not add attribution or co-author lines.

## Step 4: Output

Print only:

1. The suggested message in one code block, ready to copy.
2. For split suggestions: one code block per message, each preceded by the `git add <paths>` line the user would run.
3. One line of warnings, if any (suspicious files, ambiguous changes).

No commentary beyond that, and do not run the commit for the user.
