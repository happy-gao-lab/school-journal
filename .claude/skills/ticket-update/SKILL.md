---
name: ticket-update
description: Apply the changes agreed in the ticket discussion to both the ticket file (docs/BE_TICKETS.md / docs/FE_TICKETS.md) and the matching Jira task in project SJ, keeping them identical.
argument-hint: <ticket-id, e.g. BE-1.3>
disable-model-invocation: true
---

# Update ticket: $ARGUMENTS

Write the changes agreed in this conversation's discussion of ticket `$ARGUMENTS` into **both** places, using identical wording:

1. Its section in `docs/BE_TICKETS.md` (for `BE-*`) or `docs/FE_TICKETS.md` (for `FE-*`)
2. Its Jira task in project `SJ`

If no ticket ID was given, use the ticket being discussed in this conversation. If that's unclear, ask.

## Jira facts

- cloudId: `8ef6d774-41da-4460-a941-cbfccb58d584`, site https://happygaodev.atlassian.net
- Find the task by its summary prefix with JQL: `project = SJ AND summary ~ "\"<ID>\"" AND issuetype = Task`. Check that the summary actually starts with `<ID> ` (the search is fuzzy).
- Summary = `<ID> <Title>` (e.g. `BE-0.1 Monorepo init`). Epics are named `[BE-0] Setup`.
- Description (markdown) = the file section **without** the `## [ID] Title` heading and **without** the `**Block:** … · ` prefix, so it starts with `**Depends on:** …`.
- Dependencies are "Blocks" links: dependency → _blocks_ → dependent.

## Steps

1. **Collect the agreed changes** from the conversation: goal, scope, acceptance criteria, title, and dependencies. Use only what was explicitly agreed. Don't add your own ideas. If something is ambiguous or still open, ask before writing.
2. **Read the current state.** Read the ticket's section in the file (and the block's `## Tickets` table). Read the Jira task with `getJiraIssue` (`view: "evidence"` to get the links). If the file and Jira already differ from each other in a way the discussion doesn't explain, show the difference and ask which one is right.
3. **Show one preview and wait for one yes.** Before writing anything, show:
    - The new section text exactly as it will go into the file (the Jira description is the same text minus the heading and `**Block:** … · ` prefix, so don't repeat it)
    - The Jira task key and link (`SJ-<n>`, https://happygaodev.atlassian.net/browse/SJ-<n>)
    - **Summary:** old → new (or "unchanged")
    - **Links:** each "Blocks" link to add or remove, written as `SJ-a (ID) blocks SJ-b (ID)` (or "no changes")
    - **Tickets table row:** old → new (or "unchanged")

    Then ask once: "Update the file and Jira?" That single yes covers every change in the preview — the file and Jira, including any link removals listed in it. Don't ask again between the file and Jira. If the user asks for changes, revise, show the full preview again, and wait again.

4. **Update the file and Jira together** (right after that yes, in the same pass), applying exactly what was previewed:
    - File: rewrite the ticket's section in the existing format: `**Block:** … · **Depends on:** …`, then `**Goal:**`, `**Scope**`, `**Acceptance criteria**` with `- [ ]` items. If the title or dependencies changed, update the block's `## Tickets` table row too. Don't add statuses — the files hold none, and Jira tracks status.
    - Jira: `editJiraIssue` with `description` (markdown, derived from the new file section as described above). Also send `summary` if the title changed.
    - Jira links: if dependencies changed, add or remove "Blocks" links to match. Use `discover` to find the issue-link operations, and never guess an operation name.
    - Don't change status, assignee, labels, or the parent epic unless the user asked.
    - Anything not in the preview needs a new preview and a new yes.
5. **Verify:** read the Jira task back and compare its description with the file section (ignoring markdown escaping such as `\[ \]`). Report what changed in each place and give the Jira link (`https://happygaodev.atlassian.net/browse/SJ-<n>`).

## Out of scope

- If the agreed changes conflict with `docs/PLAN.md` or `CLAUDE.md`, point it out. Update those docs only if the user says so.
- Changes that touch other tickets (e.g. moving scope to another ticket) need the user's confirmation for each ticket. Then apply them to both places for each one.
