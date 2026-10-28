# Project commands

Custom Claude Code commands for this project. They're defined in `.claude/skills/<name>/SKILL.md` and only run when you type them.

| Command               | When                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ticket-update <ID>` | After a ticket's details are agreed | Writes the agreed changes to the ticket's section in `docs/BE_TICKETS.md` / `docs/FE_TICKETS.md` and to its Jira task in project SJ, keeping the wording identical. It shows one preview (new section text, Jira summary, "Blocks" links, Tickets table row) and waits for one yes, then updates the file and Jira together. It never changes status, assignee or labels.                                                                                                                                                        |
| `/ticket-review <ID>` | After the ticket's code is written  | A senior-level review of every file the ticket touched: acceptance criteria and scope, edge cases, domain rules, security and access, the database, and BE/FE/shared conventions. It also runs lint, typecheck and format. It reports a verdict plus findings by severity, each with a `file:line` link and a fix. It edits nothing until you ask.                                                                                                                                                                               |
| `/ticket-tests <ID>`  | When you want tests for a ticket    | Writes only the tests the ticket needs (Vitest), and finds the existing tests of done features that the ticket affects. It shows the test cases and any changes to existing tests, and waits for your approval. It finishes only when the full suite passes, and stops to ask if it finds a bug in the app code.                                                                                                                                                                                                                 |
| `/ticket-push <ID>`   | After the tests pass                | Runs lint, typecheck, format, tests and build, then commits the ticket's work: context changes, code and tests, each starting with the Jira key. It pushes the ticket branch, opens a PR into the epic, comments the Jira link on it, and reminds you to review it. It stops if a check fails or something unexpected is staged, and it never merges. After you say "merged", it checks the PR is merged, moves the Jira statuses, deletes the merged branch on origin and locally, and fast-forwards the local epic (or `dev`). |

The `<ID>` is optional, e.g. `BE-1.3` or `FE-2.1`. Without it, the command uses the ticket being discussed in the conversation.

Flow for a ticket: discuss → `/ticket-update` → branch → implement → `/ticket-review` → fixes → `/ticket-tests` → fixes → `/ticket-push` (commit + push + PR; review it) → merge. Every step after the discussion runs only on request; the full list is in [CLAUDE.md](../CLAUDE.md) under "Ticket lifecycle".

The built-in `/code-review` complements `/ticket-review` with a general bug pass over a diff or paths, but it doesn't know about the tickets.

## Useful built-in commands

**Context & tokens**

| Command            | What it does                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/clear`           | Starts with an empty context. Use it between tickets.                                                           |
| `/compact [focus]` | Summarizes the conversation to free up context, e.g. `/compact keep BE-1.3 decisions`. Use it in a long ticket. |
| `/context`         | Shows what's taking up the context window right now.                                                            |
| `/cost`            | Token usage and cost for the current session.                                                                   |
| `/resume`          | Reopens an earlier session.                                                                                     |
| `/rewind`          | Rolls the conversation and/or code changes back to an earlier point.                                            |

**Other**

| Command            | What it does                                                                |
| ------------------ | --------------------------------------------------------------------------- |
| `/security-review` | Security review of the pending changes. Useful for the auth tickets (BE-1). |
| `/help`            | Lists all commands.                                                         |
