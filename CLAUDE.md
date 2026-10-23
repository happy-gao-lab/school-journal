# School Journal

Online school journal for tracking student progress. Roles: **admin, teacher, student, parent**.

- Global plan (roles, concepts, domain model, structure): [docs/PLAN.md](docs/PLAN.md)
- Backend tickets: [docs/BE_TICKETS.md](docs/BE_TICKETS.md) · Frontend tickets: [docs/FE_TICKETS.md](docs/FE_TICKETS.md)
- Project Claude commands (`/ticket-update`, `/ticket-review`, `/ticket-tests`) and useful built-ins: [docs/COMMANDS.md](docs/COMMANDS.md)

## Workflow

Ticket lifecycle — each step starts only when the user asks for it; a yes covers only that step, and answers during the discussion are not permission to write anything:

1. The user sends a ticket → we discuss its details.
2. `/ticket-update` → show the preview; update Jira and the ticket file only after the user approves it.
3. Create the ticket branch (on request).
4. Implement the ticket (on request).
5. `/ticket-review` → report only.
6. Fix the findings and re-check (on request).
7. `/ticket-tests` → write tests.
8. Fix what the tests found (on request).
9. Commit and push (on request).
10. Open the PR into the epic and remind the user to review it.
11. Merge (on request).

- Work is done **one ticket at a time** (`BE-<block>.<n>` / `FE-<block>.<n>`). Stay inside the ticket's scope; anything extra → note it, don't build it.
- BE and FE are separate tickets — never mix backend and frontend changes in one task.
- Before starting, read the block overview (goal, shared context) and the ticket's dependencies.
- Tickets live in Jira project `SJ` (https://happygaodev.atlassian.net): blocks are epics, tickets are tasks whose summary starts with the ticket ID (e.g. `BE-1.3 Registration`), dependencies are "Blocks" links. **Jira is the source of truth for status**; the ticket files are documentation only and have no statuses.
- At the start of each ticket we discuss its details. When asked, apply the agreed changes to **both** the Jira task and its section in the ticket file, keeping them in sync. Don't update either on your own.
- Branch flow: `dev` → epic → ticket. One branch per epic (block), created from an up-to-date `dev`; one branch per ticket, created from its epic branch. Merge in reverse order: ticket → epic, then epic → `dev`. An epic is merged into `dev` only after all of its tickets are completed. Merges go through pull requests: after pushing a ticket branch, open a PR into its epic (`gh pr create --base <epic-branch>`); an epic gets a PR into `dev` once all its tickets are merged. PR title = the commit-style summary (`SJ-18 BE-0.2 Shared package`), body = what changed and how it was checked. Then remind the user to review the PR before merging, and **never merge without their explicit OK**. Merge with a merge commit and delete the merged branch locally and on origin (`gh pr merge --merge --delete-branch`): a ticket branch once it's merged into its epic, an epic branch once it's merged into `dev`. Only `main`, `dev` and the open epics stay.
- Branch names are lowercase kebab-case; the Jira key stays uppercase so Jira can link the branch:
    - epic: `<epic-key>-<block-id>-<short-title>` (e.g. `SJ-1-be-0-setup`)
    - ticket: `<jira-key>-<ticket-id>-<short-title>` (e.g. `SJ-19-be-0.3-nestjs-scaffold`)
- Commit messages start with the ticket's Jira key (`SJ-19 ...`).
- Check the working tree is clean first. **Never create a branch without asking:** show the exact branch name (and base) and wait for a yes.
- **Tests only on explicit request.**
- If a ticket conflicts with docs/PLAN.md or with reality in code — stop and ask; update the docs after the decision.

## Domain rules (short)

- Sign-in: username + password. Email required for teacher and parent, optional for student.
- Registration → status `pending` → admin reviews/edits → `approved` / `rejected`. Only approved users sign in. First admin via seed.
- Student picks own class at registration (admin can correct). One class per student.
- One teacher per subject. Subjects are assigned to classes.
- Topics belong to a subject and have a date.
- Grades: 1–100, no types, one per student per topic, saved one at a time, **no delete** — only change.
- Parent links to a child via a student-generated, single-use, expiring invite code.
- Weak / strong topics: per-topic average < 60 / ≥ 85 (constants in the shared package).
- Admin sees everything.

## Monorepo

pnpm workspaces + Turborepo.

```
apps/backend     NestJS
apps/frontend    Next.js
packages/shared  @school-journal/shared — enums, constants, zod schemas + inferred types
```

Shared things (roles, statuses, thresholds, request schemas) live only in `packages/shared` — never duplicate them in an app.

### Reuse first — no duplicates

- Before writing a helper or component, check the existing `utils/` (FE and BE) and `components/shared/` (FE) for one that already does it.
- Backend: functions used in more than one place go to `apps/backend/src/utils/` (one file per topic, e.g. `utils/date.ts`).
- Frontend: functions used in more than one place go to `apps/frontend/src/utils/` (one file per topic, e.g. `utils/grades.ts`).
- Frontend: components used by more than one page or feature go to `components/shared/`.
- Don't extract one-off code just in case — move it to `utils/` or `shared/` once a second usage appears.

### Code style & tooling

Configs live at the root: `tsconfig.base.json`, `.prettierrc`, `.oxlintrc.json` (+ local rules in `lint/oxlint-plugin.mjs`), `.editorconfig`, `.nvmrc` (Node 24). `pnpm lint` fails on any warning (`--deny-warnings`). The husky pre-commit hook runs Prettier and oxlint on staged files — never bypass it with `--no-verify`.

Formatting (Prettier, applies to BE and FE): 4 spaces, double quotes, semicolons, 100 columns, trailing commas, final newline. Import groups are sorted automatically: `react` → `next` → builtins / third-party → `@school-journal/*` → `@/*` → relative.

Code rules (most enforced by oxlint; write code this way from the start):

- Functions are arrow functions assigned to `const`, React components included — no `function` declarations. Default exports go on their own line: `const Page = () => …;` then `export default Page;`.
- Functions with a block body are never passed inline as an argument — extract a named function. One-line arrows are fine: `items.map((item) => <Row key={item.id} … />)`, `.filter((user) => user.isActive)`. Exceptions: React hook callbacks (`useEffect(() => { … }, [deps])`) stay inline so `exhaustive-deps` can check them; `db.transaction(async (tx) => { … })`, `new Promise((resolve) => { … })` and test files (`*.spec.*`, `*.test.*`, `test/`, `tests/`) are allowed too.
- No functions created inline in JSX event-handler props (`on*`) — pass a named handler (`onClick={handleSave}`) or a handler factory (`onDelete={handleDelete(item.id)}`). Render props (e.g. the UI kit's `<FormField render={…} />`) are fine.
- No one-letter names — variables, parameters and type parameters (`TItem`, not `T`). Only `_` is allowed, as is a leading `_` for intentionally unused parameters. Object property names aren't checked (`{ x, y }` from external shapes is fine).
- No `any`, `var`, `==`, or `console.*` (BE logs through pino).
- Backend: every promise is awaited or explicitly marked `void` (`no-floating-promises`, type-aware).
- Imports: backend and `packages/shared` use relative imports ending in `.js` — no TS path aliases (`tsc` doesn't rewrite them, so Node fails at runtime). The frontend may use `@/*`.
- Don't use or enforce `import type` (`consistent-type-imports` is off): in the backend it erases classes that Nest DI needs at runtime.

New packages (`apps/*`, `packages/*`) must:

- extend the base config: `"extends": "../../tsconfig.base.json"` (plus their own `module` / `moduleResolution`; decorators for the backend);
- define the scripts turbo runs: `lint` (`oxlint --deny-warnings .`; backend adds `--type-aware`), `typecheck` (`tsc --noEmit`), and `test` (`vitest run`) once the package has tests. No `format` script: Prettier runs once from the root (`pnpm format`), where it reads the root `.gitignore` and `.prettierignore`.

## Backend (`apps/backend`)

Stack: NestJS, Drizzle ORM, PostgreSQL on Neon (serverless driver), nestjs-pino, throttler, JWT access + refresh with DB sessions.

Conventions:

- ESM — relative imports end with `.js`.
- Module per feature folder: `<feature>/<feature>.controller.ts`, `.service.ts`, `.module.ts`, `dto.ts`.
- Cross-cutting code: `common/` (guards, decorators), `filters/`, `config/` (typed `env` validated at startup, app setup such as Swagger), `constants/` (`errors.ts` messages map, `index.ts` config constants), `utils/` (shared pure functions, no Nest dependencies).
- DB: `db/index.ts` exports the Drizzle instance; tables in `db/schemas/<name>.schemas.ts` named `<name>Table`, with exported types `XTable` (`$inferSelect`), `CreateX` (`$inferInsert`), `UpdateX` (`Partial`).
- snake_case column names, `timestamp(..., { mode: 'string' })`, `created_at` / `updated_at` defaults.
- Controllers are thin; logic and access checks in services. Errors via Nest exceptions with messages from `constants/errors.ts`.
- Validation: zod schemas from `@school-journal/shared` through the zod validation pipe (not class-validator).
- Auth: `AuthGuard` + `RolesGuard` with `@Roles()`, current user via `@CurrentUser()`. Student visibility checks go through `StudentAccessService`.
- Schema changes: `db:generate` then `db:migrate` — never edit generated migrations by hand.

## Frontend (`apps/frontend`)

Stack: Next.js (App Router), axios, React Query, shadcn/ui, Tailwind, React Hook Form + zod.

```
src/
  app/          routes only (thin): (auth), admin, teacher, student, parent
  components/   pages/ · layout/ · providers/ · ui/ (shadcn + UI kit) · shared/ (reusable feature components)
  hooks/        React Query hooks per feature
  api/          axios client + requests per feature
  constants/    query keys, navigation, etc.
  utils/        shared pure functions (formatting, grade helpers, etc.)
  lib/          shadcn internals only (`cn`)
  types/
```

Conventions:

- Pages never fetch directly: `components/pages/*` → `hooks/*` → `api/*`.
- Forms: RHF + zod resolver with schemas from `@school-journal/shared`; use the UI kit form fields.
- Use UI kit components and theme tokens — no hard-coded colors; must work in light/dark and at phone width.
- Every data view handles loading / empty / error states.

## Commands (once BE-0 / FE-0 are done)

```
pnpm install
pnpm dev                       # all apps via turbo
pnpm --filter backend dev
pnpm --filter frontend dev
pnpm lint / pnpm typecheck / pnpm test
pnpm format / pnpm format:check  # write / check only
pnpm --filter backend db:generate | db:migrate | db:seed
```
