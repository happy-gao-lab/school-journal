---
name: ticket-tests
description: Write tests for one ticket (BE-x.y / FE-x.y) — only what the ticket needs, update existing tests the ticket affects, show the test plan first, and finish only when the whole suite passes.
argument-hint: <ticket-id, e.g. BE-1.3>
disable-model-invocation: true
---

# Tests for ticket: $ARGUMENTS

Write the tests that ticket `$ARGUMENTS` needs, update the existing tests it affects, and get the whole test suite passing.

If no ticket ID was given, use the ticket being worked on in this conversation. If that's unclear, ask.

## Rules

- **Only this ticket.** Test only the behaviour this ticket added or changed. Don't fill test gaps in other features. List them under "Out of scope" instead.
- **Only if needed.** Every test must protect against a real risk: a domain rule, access control, validation, an edge case, an error path, or non-trivial logic. Skip tests that only restate the framework or the code, such as "the module compiles", "the controller calls the service", a getter, or plain config. If the ticket needs no tests at all (e.g. pure setup or config), say so with a reason and stop.
- **Show the plan first.** Don't create or change any test file until the user approves the plan in step 4.
- **Existing tests are the user's call.** Never change, rewrite or delete an existing test without listing it in the plan and getting a yes.
- **Never cheat to go green.** Don't weaken assertions, skip or `.only` tests, or bend tests to fit buggy code. If a test fails because the app code is wrong, stop and report the bug. Fix app code only if the user says so.
- **No real external services.** Never point tests at the Neon database from `.env` / `DATABASE_URL`. Never run `db:migrate` / `db:push`. Never call real third-party APIs.

## 1. Load context

- Read the ticket's section in `docs/BE_TICKETS.md` / `docs/FE_TICKETS.md`, its block overview, and the tickets it depends on. Read `CLAUDE.md` (domain rules, conventions).
- Find the ticket's code: `git status` / `git diff`, plus commits whose message contains the ticket ID, plus the files named in the ticket's scope, plus files changed in this conversation.
- Look at the existing test setup: the test scripts in each app's `package.json`, `vitest.config*.ts`, the existing `*.spec.ts` / `*.test.ts(x)` files and their helpers or mocks. Write new tests in the same style.

## 2. Test setup

Use this setup unless the project already does it differently:

- **Backend:** Vitest. Unit tests go in `src/<feature>/tests/<file>.spec.ts` and use `@nestjs/testing` with the DB layer and other providers mocked. E2E tests go in `test/` with supertest and `vitest.config.e2e.ts`. Scripts: `test`, `test:e2e`.
- **Frontend:** Vitest + React Testing Library + jsdom. Mock HTTP at the `api/*` layer (or with MSW if the project already uses it). Wrap components in a fresh React Query client per test.
- **Shared package:** plain Vitest unit tests for zod schemas and helpers.

If the app has no test setup yet, include its setup in the plan (packages, config, scripts) and get approval for it with the rest. If an e2e test needs a database and the project has no isolated test DB (a separate Neon branch, a local Postgres or a container), don't invent one. Propose an option in the plan and let the user decide.

## 3. Find what's affected

- **New behaviour:** what this ticket adds.
- **Changed behaviour of features that are already done:** for each function, endpoint, schema, component or hook that this ticket changed and that existed before, find the existing tests that cover it (search the spec files for its name, route or schema). Run them now to see what currently breaks. Decide for each one whether it **still holds**, **needs updating** (the behaviour changed on purpose in this ticket), or **is now wrong** (it tests behaviour that was removed).
- Also find things the change can break indirectly: shared zod schemas or constants used elsewhere, guards, `StudentAccessService`, and the API response shapes the frontend relies on.

## 4. Show the plan and wait

Show this, then stop and ask for approval:

**New tests:** grouped by file (`path/to/x.spec.ts`), one line per case, written as behaviour:

- `rejects a grade of 101 with 400`
- `teacher of another subject can't set a grade → 403`
- `a reused invite code fails`

Mark each case: ✅ happy path / ⚠️ edge case / ⛔ error or access.

**Cases to cover where they apply:** validation boundaries (grade 0/1/100/101, 1.5, `"50"`, empty, missing, unknown fields), role and ownership access (each role, someone else's id), the domain rules from `CLAUDE.md`, state transitions (pending/approved/rejected), single-use and expiry, duplicates and uniqueness, and error paths. FE: loading/empty/error states, form validation and server errors, double submit, cache refresh after a mutation.

**Existing tests to change:** for each one: file + test name → **update / rewrite / delete**, the reason (which behaviour of which done feature this ticket changed), and old expectation → new expectation.

**Setup changes:** packages, config, scripts, test helpers (if any).

**Not testing:** the parts of the ticket deliberately left without tests, and why.

Ask: "Go ahead with this plan?" and wait. If the user edits the plan, update it and show it again. Explicit approval of the changes to existing tests is required.

## 5. Write the tests

- Each test is independent: no shared mutable state, a fresh module or mocks per test, no order dependence. Use fake timers for expiry or time logic instead of real waiting.
- Assert behaviour (status code, error message from `constants/errors.ts`, returned data, the DB call made or not made, what's rendered), not implementation details.
- Build test data with small factories and helpers. Constants such as grade bounds and thresholds come from `@school-journal/shared`, not literals.
- Use the project's conventions: ESM `.js` imports in the backend, strict types, no `any`.
- Apply only the changes to existing tests that were approved in the plan.

## 6. Run until green

- Run the new tests, then the **full** suite of each affected app, plus `test:e2e` if e2e tests were added or touched. Run lint and typecheck on the test files.
- If a test fails:
    - The test is wrong → fix the test.
    - The app code is wrong → stop. Report the bug (file:line, failing case, expected vs actual) and ask whether to fix the code. Don't fix app code without a yes.
    - It's flaky (passes and fails across runs) → fix the cause, don't retry it away.
    - An unrelated, already failing test → report it. Don't fix it without asking.
- The task is finished **only when every test passes**. If you can't get there, say so plainly.

## 7. Report

- The tests added (count per file) and the existing tests changed, with reasons.
- The final test run output summary: files, passed, failed, skipped. It must show 0 failed and 0 skipped from this work.
- Bugs found in the app code, and what was decided.
- Out of scope: test gaps noticed in other features (note them, don't write them).
