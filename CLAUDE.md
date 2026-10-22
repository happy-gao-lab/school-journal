# School Journal

Online school journal for tracking student progress. Roles: **admin, teacher, student, parent**.

- Global plan (roles, concepts, domain model, structure): [docs/PLAN.md](docs/PLAN.md)
- Backend tickets: [docs/BE_TICKETS.md](docs/BE_TICKETS.md) · Frontend tickets: [docs/FE_TICKETS.md](docs/FE_TICKETS.md)
- Project Claude commands (`/ticket-update`, `/ticket-review`, `/ticket-tests`) and useful built-ins: [docs/COMMANDS.md](docs/COMMANDS.md)

## Workflow
- Work is done **one ticket at a time** (`BE-<block>.<n>` / `FE-<block>.<n>`). Stay inside the ticket's scope; anything extra → note it, don't build it.
- BE and FE are separate tickets — never mix backend and frontend changes in one task.
- Before starting, read the block overview (goal, shared context) and the ticket's dependencies.
- Tickets live in Jira project `SJ` (https://happygaodev.atlassian.net): blocks are epics, tickets are tasks whose summary starts with the ticket ID (e.g. `BE-1.3 Registration`), dependencies are "Blocks" links. **Jira is the source of truth for status**; the ticket files are documentation only and have no statuses.
- At the start of each ticket we discuss its details. When asked, apply the agreed changes to **both** the Jira task and its section in the ticket file, keeping them in sync. Don't update either on your own.
- One branch per ticket, created from an up-to-date `main`: `<jira-key>-<ticket-id>-<short-title>`, lowercase kebab-case (e.g. `SJ-19-be-0.3-nestjs-scaffold`). The Jira key stays uppercase so Jira can link the branch, and commit messages start with the same key (`SJ-19 ...`). Check the working tree is clean first. **Never create a branch without asking:** show the exact branch name (and base) and wait for a yes.
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

## Backend (`apps/backend`)
Stack: NestJS, Drizzle ORM, PostgreSQL on Neon (serverless driver), nestjs-pino, throttler, JWT access + refresh with DB sessions.
Reference project for structure and style: `/home/dev/Documents/coding/pet/pw-backend/src`.

Conventions (follow pw-backend):
- ESM — relative imports end with `.js`.
- Module per feature folder: `<feature>/<feature>.controller.ts`, `.service.ts`, `.module.ts`, `dto.ts`.
- Cross-cutting code: `common/` (guards, decorators), `filters/`, `constants/` (`errors.ts` messages map, `index.ts` config constants), `utils/` (shared pure functions, no Nest dependencies).
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
pnpm lint / pnpm format
pnpm --filter backend db:generate | db:migrate | db:seed
```
