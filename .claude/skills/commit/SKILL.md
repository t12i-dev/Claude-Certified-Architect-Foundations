---
name: commit
description: Commit the current changes with a message written from the actual diff, matching the repo's commit style. Use only when the user invokes /commit.
disable-model-invocation: true
---

# /commit: Commit the current work

Anything following `/commit` is guidance from the user: a message, "only the lib.ts change", "split it up". Honor it over the defaults below. This skill commits only; it never pushes.

## Step 1: Look at the state

```bash
git status --short --branch
git diff --stat
git diff --cached --stat
git log --format='%s' -10
```

If there is nothing to commit, say so and stop.

## Step 2: Decide what goes in

Read the full diff (`git diff`, `git diff --cached`), not just the stat.

- Include files that belong to the change.
- Exclude `.env`, credentials, build output, `node_modules/`, scratch files, and editor state.
- If a file is ambiguous, ask and name it. Committing a secret is costly to undo.
- If the diff holds two unrelated changes, propose separate commits.

## Step 3: Write the message

Match the house style from the log. Absent one: short imperative subject (~50 chars, no trailing period), and a bullet body only when the change has distinct parts.

The message describes intent, which only the diff shows. Never write it from file names alone.

End the message with whatever commit attribution lines the session specifies, unless the user's memory or instructions say to omit them. If none are specified, add none.

## Step 4: Stage and commit

Stage deliberately with `git add <paths>`, never a blind `git add -A` unless the tree was verified to hold only wanted files. Don't commit on `main`/`master` without asking first; offer to create a branch.

```bash
git commit -F - <<'EOF'
Subject line

- body bullet
EOF
```

Never use `--no-verify` or `--amend` unless asked. If a hook fails, report the failure and fix the cause; don't bypass it.

## Step 5: Report

One short block: the commit hash and subject, files included, and anything deliberately left out. If the commit failed, say so.
