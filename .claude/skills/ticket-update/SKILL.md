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
- Dependencies are "Blocks" links: dependency → *blocks* → dependent.

## Steps
1. **Collect the agreed changes** from the conversation: goal, scope, acceptance criteria, title, and dependencies. Use only what was explicitly agreed. Don't add your own ideas. If something is ambiguous or still open, ask before writing.
2. **Read the current state.** Read the ticket's section in the file (and the block's `## Tickets` table). Read the Jira task with `getJiraIssue` (`view: "evidence"` to get the links). If the file and Jira already differ from each other in a way the discussion doesn't explain, show the difference and ask which one is right.
3. **Show the proposed result** to the user before writing anything: the new section text, plus a short list of the other changes (title, dependency links, Tickets table row). Wait for a yes.
4. **Update the ticket file:**
   - Rewrite the ticket's section in the existing format: `**Block:** … · **Depends on:** …`, then `**Goal:**`, `**Scope**`, `**Acceptance criteria**` with `- [ ]` items.
   - If the title or dependencies changed, update the block's `## Tickets` table row too.
   - Don't add statuses. The files hold none, and Jira tracks status.
5. **Jira preview — wait for permission.** Before any Jira write, show the user exactly what will be sent and stop:
   - The task key and link (`SJ-<n>`, https://happygaodev.atlassian.net/browse/SJ-<n>)
   - **Summary:** old → new (or "unchanged")
   - **Description:** the full markdown that will be written, in a ```markdown block, exactly as it will be sent
   - **Links:** each "Blocks" link to add or remove, written as `SJ-a (ID) blocks SJ-b (ID)` (or "no changes")
   Then ask: "Write this to Jira?" and wait. Write only after an explicit yes. If the user asks for changes, revise, show the full preview again, and wait again. A yes on the file changes in step 3 doesn't count as permission for Jira.
6. **Update Jira** (only after that yes), sending exactly what was previewed:
   - `editJiraIssue` with `description` (markdown, derived from the new file section as described above). Also send `summary` if the title changed.
   - If dependencies changed, add or remove "Blocks" links to match. Use `discover` to find the issue-link operations, and never guess an operation name. Removing a link is destructive, so confirm it with the user first.
   - Don't change status, assignee, labels, or the parent epic unless the user asked.
7. **Verify:** read the Jira task back and compare its description with the file section (ignoring markdown escaping such as `\[ \]`). Report what changed in each place and give the Jira link (`https://happygaodev.atlassian.net/browse/SJ-<n>`).

## Out of scope
- If the agreed changes conflict with `docs/PLAN.md` or `CLAUDE.md`, point it out. Update those docs only if the user says so.
- Changes that touch other tickets (e.g. moving scope to another ticket) need the user's confirmation for each ticket. Then apply them to both places for each one.
