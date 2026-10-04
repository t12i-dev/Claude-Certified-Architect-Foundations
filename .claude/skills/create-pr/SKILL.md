---
name: create-pr
description: Open a pull request for the current work - branch, commit, push, and create the PR with a title and description derived from the actual diff. Use only when the user invokes /create-pr.
disable-model-invocation: true
---

# /create-pr: Open a pull request for the current work

Anything following `/create-pr` is guidance from the user: a title, a target branch, a reviewer, "don't commit the stray file", or just "go". Honor it over the defaults below.

The goal is a PR a reviewer can act on: a correct base branch, a clean commit, and a description that explains the change rather than restating the file list. Read the diff before writing a single word of the PR — a description written from the branch name alone is the main way this goes wrong.

## Step 1: Read the repository state

Run these together, since nothing below can be decided without all of them:

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git remote -v
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true
```

From this, establish four things:

- **Base branch** — the repo's default branch. Prefer the `origin/HEAD` symref; if it is unset, fall back to `main` when `origin/main` exists, then `master`. If the user named a base, use theirs.
- **Current branch** — and whether it already tracks an upstream.
- **Whether work is committed** — staged, unstaged, and untracked all matter.
- **Whether a PR tool exists** — `command -v gh`. This decides Step 6.

## Step 2: Get onto a feature branch

If the current branch is the base branch, the work cannot become a PR from where it sits. Create a branch first:

```bash
git checkout -b <branch-name>
```

Name it from the change itself, in the repo's existing style (check `git branch -a` — if every branch looks like `feat/thing` or `trieu/thing`, match that). Lowercase, hyphenated, specific: `add-pr-skill`, not `updates` or `fix`. Uncommitted changes carry over to the new branch automatically, so this is safe to do with a dirty tree.

If already on a feature branch, stay on it.

## Step 3: Decide what goes in

Look at what is actually uncommitted:

```bash
git diff --stat
git diff --cached --stat
git status --short
```

Untracked files are the judgment call. A new source file that belongs to this change should go in; `.env`, build output, `node_modules/`, scratch files, and editor state should not. When something is genuinely ambiguous — a stray script, a data dump, a file unrelated to the change — ask rather than guessing, and name the specific files. Silently committing a secret or a 40MB artifact is far more expensive to undo than one question.

If the tree is already clean and the branch has commits the base doesn't, skip to Step 5.

## Step 4: Commit

Read the full diff first (`git diff`, `git diff --cached`), not just the stat — the message should describe intent, which only the diff shows.

Match the repo's commit convention. Check it:

```bash
git log --format='%s%n%b%n---' -10
```

Absent a clear house style, use a short imperative subject (~50 chars, no trailing period) and a bullet body only when the change has distinct parts worth separating:

```
Add exercise 7: generate eval dataset

- Prompt Haiku to generate AWS tasks
- Use prefill + stop sequence for raw JSON
- Validate and save to dataset.json
```

End the commit message with whatever commit attribution lines the current session specifies. If the session gives none, add none.

Stage deliberately — `git add <paths>` for the files decided in Step 3, never a blind `git add -A` unless the tree was verified to contain only wanted files. Then commit with a heredoc so the body's newlines survive:

```bash
git commit -F - <<'EOF'
Subject line

- body bullet
EOF
```

## Step 5: Push

Pushing publishes the branch, so confirm with the user before the first push unless they already said to go ahead (a bare `/create-pr`, "ship it", or an explicit title all count as go-ahead — they asked for a PR, which requires a push).

```bash
git push -u origin HEAD
```

If the push is rejected because the remote moved, report the rejection and ask how to proceed. Do not reach for `--force` or `--force-with-lease` on your own; a force-push can destroy someone else's commits, and the user is the one who knows whether that is safe here.

## Step 6: Create the PR

### Write the title and body first

**Title**: one line, imperative, describing the change — it is usually the commit subject, or a summary covering all commits when there are several.

**Body**: this exact structure, kept short. A reviewer reads it to know what to look at.

```markdown
## Summary
<1-3 sentences: what changed and why. The "why" is the part the diff cannot show.>

## Changes
- <the meaningful changes, grouped by intent — not a file listing>

## Testing
<What was actually run, and its result. If nothing was run, say so plainly — "Not tested; no test suite in this repo" is useful information, a fabricated green checkmark is a liability.>
```

Drop a section when it would be empty or padding: a one-line docs fix does not need three headings. Add `## Notes` only for something a reviewer genuinely needs — a follow-up left undone, a deliberate trade-off, a breaking change.

End the body with whatever PR attribution line the current session specifies, and none if it specifies none.

### Then create it, by whichever route is available

**If `gh` exists** (`command -v gh` succeeded), and `gh auth status` is authenticated:

```bash
gh pr create --base <base> --head <branch> --title "<title>" --body-file <path-to-body>
```

Write the body to a file in the scratchpad directory rather than inlining it — shell quoting mangles multi-line markdown, and backticks in a body are an injection hazard in an inlined string. Pass `--draft` if the user asked for a draft, and `--reviewer <user>` if they named reviewers.

If `gh` is present but unauthenticated, say so, suggest `gh auth login` (which the user can run in this session by typing `! gh auth login`), and fall back to the URL route rather than stalling.

**If `gh` is missing or unauthenticated**, the branch is already pushed, so GitHub's compare page can do the rest. Build the URL from the remote:

```bash
git remote get-url origin
```

Normalize it to `owner/repo` — strip a leading `git@github.com:` or `https://github.com/` and a trailing `.git` — then construct:

```
https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1
```

Give the user that link along with the title and body as copyable markdown, so they paste rather than retype. Then mention once, without insisting, that `brew install gh` would let future runs create the PR directly.

If the remote is not GitHub (GitLab, Bitbucket, a self-hosted host), do not invent a URL shape you are unsure of. Report the pushed branch, the base, and the prepared title and body, and say the PR needs to be opened on that host.

## Step 7: Report

One short block, no victory lap:

- Branch pushed, and its base
- PR URL — the real one from `gh`, or the compare link to click
- Anything deliberately left out of the commit, named explicitly

If any step was skipped or failed, say which and why. A PR that was not actually created must never be reported as created.

## Things that go wrong

- **Writing the description from the branch name.** Read the diff. A PR body that misdescribes the change costs the reviewer more than no body at all.
- **Committing on the base branch.** Check the branch before staging, not after.
- **Sweeping in unrelated files.** `git add -A` on a dirty tree is how `.env` files reach GitHub. Pushing is hard to undo; a leaked credential must be rotated, not reverted.
- **Claiming tests passed.** Report only what was run.
- **Force-pushing to recover from a rejected push.** Ask instead.
- **Opening a second PR for a branch that already has one.** With `gh`, check `gh pr list --head <branch>` first; if one exists, offer to update it (`gh pr edit`) instead of creating a duplicate.
