---
name: ticket-push
description: Commit a ticket's work (BE-x.y / FE-x.y), push its branch and open a PR into the epic with the Jira link — after checks pass; never merges.
argument-hint: <ticket-id, e.g. BE-1.3>
disable-model-invocation: true
---

# Push ticket: $ARGUMENTS

Commit the work for ticket `$ARGUMENTS`, push its branch, and open a pull request into its epic with the Jira link. Running this command is the user's yes for the commit + push + PR steps of the ticket lifecycle (`CLAUDE.md`, steps 9–10). It is **not** a yes to merge.

If no ticket ID was given, use the ticket being worked on in this conversation. If that's unclear, ask.

## Facts

- Repo for `gh`: always pass `--repo happy-gao-lab/school-journal` (the git remote uses an SSH alias, so `gh` can't infer it).
- Jira: https://happygaodev.atlassian.net, cloudId `8ef6d774-41da-4460-a941-cbfccb58d584`, project `SJ`. The ticket's Jira key is in its branch name (`SJ-<n>-...`). Find the epic key from the Jira task's parent if needed.
- Branches: ticket `<jira-key>-<ticket-id>-<short-title>` (e.g. `SJ-19-be-0.3-nestjs-scaffold`), created from its epic branch `<epic-key>-<block-id>-<short-title>` (e.g. `SJ-1-be-0-setup`). The PR goes into the epic branch, never into `dev` or `main`.

## 1. Check where you are

- The current branch must be the ticket's branch, and its Jira key must match the ticket. If not, stop and ask.
- Find the epic branch (`git branch -a`) and check that the ticket branch is based on it (`git merge-base --is-ancestor origin/<epic> HEAD`). If the epic moved ahead, say so and ask whether to continue (don't rebase or merge on your own).
- Look at everything that will go in: `git status`, `git diff`, untracked files. Make sure nothing that shouldn't be committed is there: `.env` files, secrets, build output, throwaway or debug files, files from another ticket. If something looks wrong, stop and ask.

## 2. Run the checks

Run from the repo root: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, plus `pnpm --filter <app> test:e2e` and `pnpm --filter <app> build` for each app the ticket touched. Never run `db:migrate`, `db:push` or anything that touches a database.

If any check fails, stop and report it with the key output lines. Don't fix anything without the user's yes, and don't commit with failing checks.

## 3. Commit

Split the work into a few logical commits, in this order (skip any that are empty):

1. **Context changes** — `CLAUDE.md`, `docs/`, `.claude/skills/`, and the ticket's section in `docs/BE_TICKETS.md` / `docs/FE_TICKETS.md`. Say in the message that it's a context change.
2. **The ticket's code** — the feature itself.
3. **Tests** — new and updated tests.

Message format (match the existing history, `git log` for examples):

```
SJ-<n> <Short imperative summary>
<blank line>
- what changed and why, one bullet per point
- mention decisions a reviewer should know
<blank line>
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- Every message starts with the ticket's Jira key.
- Stage files by path (`git add <paths>`), not `git add -A`, so nothing unexpected slips in.
- Let the pre-commit hooks (husky + lint-staged) run. Never use `--no-verify`. If a hook fails, fix the cause only if it's formatting the hook itself applies; otherwise stop and report.
- Never amend or rewrite commits that are already pushed.

## 4. Push

`git push -u origin <ticket-branch>`. Never force-push, and never push the epic, `dev` or `main`.

## 5. Open the PR

```
gh pr create --repo happy-gao-lab/school-journal --base <epic-branch> --head <ticket-branch> \
  --title "SJ-<n> <ticket-id> <Ticket title>" --body-file <file>
```

- Title: the commit-style summary, e.g. `SJ-18 BE-0.2 Shared package`.
- Body (write it to a file in the scratchpad, not in the repo):

    ```
    ## What changed

    - bullets per area: the feature, error shapes, config, docs/context changes

    ## How it was checked

    - lint, typecheck, format:check, build — pass/fail
    - tests: counts per suite
    - manual checks done in the conversation, if any

    ## Out of scope

    - notes for later tickets (omit the section if none)

    🤖 Generated with [Claude Code](https://claude.com/claude-code)
    ```

- If a PR for this branch already exists, don't open a second one: push updates it. Say so and give its link.

## 6. Link Jira

Right after creating the PR, comment the Jira link on it:

```
gh pr comment <number> --repo happy-gao-lab/school-journal --body "Jira: https://happygaodev.atlassian.net/browse/SJ-<n>"
```

Don't change the Jira status here. The ticket stays in its current stage until its PR is merged into the epic (then `Done`).

## 7. Report and stop

- The commits (hash + subject), the pushed branch, and the PR link.
- Remind the user to review the PR on GitHub before merging, and to say "merged" once it is merged.
- **Never merge.** Merging is a separate step, done only on the user's explicit OK.

## 8. After the user says "merged"

The word "merged" (about this PR, or an epic PR into `dev`) is the yes for these steps. Do them all, in this order, then report.

1. **Check the PR really is merged:** `gh pr view <number> --repo happy-gao-lab/school-journal --json state,mergedAt,baseRefName,headRefName`. If `state` isn't `MERGED`, stop and say so. Then `git fetch origin --prune`.
2. **Statuses** (they follow the workflow, so no asking): a ticket PR merged into its epic → the ticket goes to `Done`; an epic PR merged into `dev` → the epic goes to `Done`. Read the epic's status as well: it must be `In Progress` while it has open tickets. Report each status before → after, or "already right".
3. **Delete the merged branch** (a ticket branch after its merge into the epic, an epic branch after its merge into `dev`):
    - Check it's merged: `git merge-base --is-ancestor origin/<branch> origin/<base>` (skip if the remote branch is already gone).
    - If this worktree has it checked out, the working tree must be clean (otherwise stop and ask); then `git switch --detach origin/<base>`.
    - On origin: `git push origin --delete <branch>`, unless GitHub already deleted it.
    - Locally: `git branch -d <branch>` (never `-D`; if `-d` refuses, stop and report).
4. **Update locally:** fast-forward the local base branch (the epic, or `dev`) to `origin/<base>`:
    - Checked out in a worktree (`git worktree list`) → `git -C <that-path> merge --ff-only origin/<base>`, only if that worktree is clean.
    - Not checked out anywhere → `git branch -f <base> origin/<base>`, only if `git merge-base --is-ancestor <base> origin/<base>` passes.
    - If it can't fast-forward, stop and report; never rebase, reset or force.
5. **Report:** the merge commit, the status changes, the deleted branches (origin + local), the updated local branch with its new head, and where this worktree's HEAD is now.
