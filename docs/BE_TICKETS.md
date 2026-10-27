# School Journal — Backend Tickets

Global context: [PLAN.md](PLAN.md).
Tests are written only on explicit request.

ID pattern: `BE-<block>.<n>`. Status is tracked in Jira (project `SJ`).

---

# [BE-0] Setup

## Goal

Working monorepo with a running NestJS app connected to Neon, plus a shared package used by both apps.

## Shared context

- pnpm workspaces + Turborepo; apps in `apps/`, shared code in `packages/shared`
- Tooling: ESM, oxlint, prettier + sort-imports, drizzle-kit, nestjs-pino, throttler; formatting from the root config (4 spaces, double quotes)

## Tickets

| ID     | Title                            | Depends on     |
| ------ | -------------------------------- | -------------- |
| BE-0.1 | Monorepo init                    | —              |
| BE-0.2 | Shared package                   | BE-0.1         |
| BE-0.3 | NestJS app scaffold              | BE-0.1, BE-0.2 |
| BE-0.4 | Database connection & migrations | BE-0.3         |
| BE-0.5 | Zod validation pipe              | BE-0.2, BE-0.3 |

---

## [BE-0.1] Monorepo init

**Block:** BE-0 · **Depends on:** —

**Goal:** Monorepo skeleton with shared TypeScript, formatting, lint and commit tooling for both apps.

**Scope**

- Already in place: `pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `.gitignore`, git repo
- `tsconfig.base.json`: `strict`, `skipLibCheck`, `isolatedModules`, `esModuleInterop`, `target: ES2023`; apps add their own module settings (and decorators for the backend) in BE-0.3 / FE-0.1
- Prettier — root `.prettierrc` + `.prettierignore`: 4 spaces, double quotes, `printWidth: 100`, trailing commas, `@ianvs/prettier-plugin-sort-imports` with order `react` → `next` → third-party → `@school-journal/*` → `@/*` → relative
- oxlint — root `.oxlintrc.json` with per-app `overrides` (BE: `node` env; FE: `react`, `nextjs`, `jsx-a11y` plugins); all rules `warn`, `lint` runs with `--deny-warnings`:
    - `no-unused-vars` (`_` prefix allowed), `id-length` (min 2, only `_` allowed, property names not checked)
    - `func-style: expression`, `import/no-anonymous-default-export`
    - `no-console`, `eqeqeq`, `prefer-const`, `no-var`, `typescript/no-explicit-any`
    - BE: `typescript/no-floating-promises` (type-aware mode)
    - FE: `react/function-component-definition` (arrow functions), `react/exhaustive-deps`, `react/rules-of-hooks`, `react/jsx-key`
    - Local JS-plugin rules in `lint/oxlint-plugin.mjs`:
        - `no-block-arrow-argument`: no block-body functions passed as arguments; one-line arrows (e.g. `items.map((item) => <Row … />)`), React hook callbacks, `.transaction()`, `new Promise()` and test files are allowed
        - `no-inline-jsx-function` (FE): no inline functions in JSX `on*` props; render props are allowed
- `turbo.json`: drop `dependsOn: ["^build"]` from `lint`; add a `typecheck` task (`tsc --noEmit` per package, after `^build`); `lint` / `typecheck` cache inputs include the root lint and tsconfig files; root files are covered by `lint:root` / `format:root`
- Pre-commit: husky + lint-staged — `*.{ts,tsx,js,mjs}` → `prettier --write`, `oxlint --deny-warnings`; `*.{json,md,css,yaml,yml}` → `prettier --write`
- Tests: `vitest` at the root; `lint/tests/oxlint-plugin.spec.mjs` covers both local lint rules by running oxlint on sample code; `pnpm test` → `turbo run test test:root` (packages add their own `test` scripts); the test-file exception of `no-block-arrow-argument` matches `**/*.spec.*`, `**/*.test.*`, `test/`, `tests/`
- Node: `.nvmrc` (`24`) and `"engines": { "node": ">=24" }` in root `package.json`
- `.editorconfig`: LF, 4-space indent, final newline
- Not here: `consistent-type-imports` (breaks Nest DI, off in both apps); TS path aliases on the backend (relative `.js` imports); root `.env.example` (each app gets its own in BE-0.3 / BE-0.4 / FE-0.1); Tailwind Prettier plugin (FE-0)

**Acceptance criteria**

- [ ] `pnpm install` works at the root and installs the git hook
- [ ] `pnpm dev / build / lint / typecheck / format` run through turbo
- [ ] Each lint rule confirmed on a throwaway sample file (incl. `id-length` on generics like `T`, `func-style` on `export default function`)
- [ ] A commit with an unformatted or lint-failing file is fixed or blocked by the hook

---

## [BE-0.2] Shared package

**Block:** BE-0 · **Depends on:** BE-0.1

**Goal:** One place for enums, constants and zod schemas used by both apps.

**Scope**

- `packages/shared` (`@school-journal/shared`) compiled with `tsc` to ESM in `dist/` (`NodeNext`, `.js` relative imports), usable from NestJS and Next.js
- `package.json` `exports` map (`types` first, then `default`), declarations + declaration maps; packaging checked with `publint` / `@arethetypeswrong/cli`
- Single root entry point (no subpath exports yet)
- Enums as `as const` objects with a matching union type and a tuple for `z.enum` / Drizzle:
    - `Role` (admin, teacher, student, parent) + `ROLES`
    - `UserStatus` (pending, approved, rejected) + `USER_STATUSES`
- Constants: `GRADE_MIN` = 1, `GRADE_MAX` = 100, `WEAK_TOPIC_THRESHOLD` = 60 (average < 60), `STRONG_TOPIC_THRESHOLD` = 85 (average ≥ 85)
- `schemas/` folder for zod schemas (filled by later tickets); `zod` v4 as a dependency
- Scripts `build`, `dev` (`tsc --watch`), `typecheck`, `lint`, `check:package` wired into turbo; formatting runs from the root (`pnpm format` / `pnpm format:check`)

**Acceptance criteria**

- [ ] `pnpm --filter @school-journal/shared build` emits ESM + type declarations in `dist/`
- [ ] A plain Node ESM `import { Role } from '@school-journal/shared'` works
- [ ] `typecheck`, `lint` and the packaging check pass

---

## [BE-0.3] NestJS app scaffold

**Block:** BE-0 · **Depends on:** BE-0.1, BE-0.2

**Goal:** Running backend app with base infrastructure.

**Scope**

- `apps/backend` layout: `main.ts`, `app.module.ts`, `constants/`, `filters/`, `health/`
- NestJS (Express) via Nest CLI: `dev` (`nest start --watch`), `build`, `start`, `typecheck`, `lint` wired into turbo
- `tsconfig.json` extends `tsconfig.base.json`: `module` / `moduleResolution: nodenext`, `experimentalDecorators` + `emitDecoratorMetadata` (required by Nest DI), `strictPropertyInitialization: false`
- `@school-journal/shared` as a workspace dependency
- Env: `dotenv` + zod schema validated at startup (fails fast), exported typed `env` (not `@nestjs/config`); `NODE_ENV`, `PORT` (default `4000`), `CLIENT_URL` (default `http://localhost:3000`, a plain http(s) origin), optional `LOG_LEVEL` in `apps/backend/.env.example`
- CORS for `CLIENT_URL` only, `credentials: true`; global prefix `/api`; `enableShutdownHooks()`
- `helmet()` security headers with the default Content-Security-Policy (the Swagger UI works with it)
- Swagger (`@nestjs/swagger`): UI at `/api/docs`, outside production only; zod schemas in the docs come in BE-0.5
- nestjs-pino: `pino-pretty` + `debug` in dev, JSON + `info` in prod, `silent` in tests; `LOG_LEVEL` overrides the level; `authorization` / `cookie` headers redacted; health requests not logged; `bufferLogs`
- Throttler: global limit 100 requests / 60 s (constants in `constants/index.ts`); stricter auth limits in BE-1
- `constants/errors.ts`: `errors` as `as const` object, the only source of error messages
- Global `HttpExceptionFilter`: `{ statusCode, message }` with `message` always a string (arrays joined); unknown exceptions are logged → 500 with `errors.SOMETHING_WENT_WRONG`
- `GET /health` → `{ status: "ok" }`, excluded from throttling (`@SkipThrottle()`); DB check not here (BE-0.4)
- Not here: `DATABASE_URL` (BE-0.4)

**Acceptance criteria**

- [ ] `pnpm --filter backend dev` starts the app; missing/invalid env stops it with a clear message
- [ ] `GET /api/health` returns 200 `{ status: "ok" }`; unknown route returns `{ statusCode: 404, message }`
- [ ] `Access-Control-Allow-Origin` is always `CLIENT_URL`, so browsers block other origins
- [ ] Responses carry helmet security headers (no `X-Powered-By`)
- [ ] `/api/docs` opens the Swagger UI in dev and is not available in production
- [ ] `typecheck` and `lint` pass

---

## [BE-0.4] Database connection & migrations

**Block:** BE-0 · **Depends on:** BE-0.3

**Goal:** Drizzle connected to Neon with a migration workflow.

**Scope**

- Drizzle 1.0 RC (`drizzle-orm`, `drizzle-kit`) + `@neondatabase/serverless`
- `db/index.ts`: Neon serverless `Pool` (WebSocket) with `drizzle-orm/neon-serverless`, exports the Drizzle instance; not `neon-http`, which has no interactive transactions; 5 s connection timeout (`DB_CONNECTION_TIMEOUT`) so an unreachable DB fails fast
- `DbModule` closes the pool on application shutdown (`pool.end()`)
- `db/schemas/` folder for `<name>.schemas.ts` files (tables come in later tickets)
- Env: `DATABASE_URL` (required, `postgres://` / `postgresql://`) in the zod env schema and `apps/backend/.env.example`; the direct (non-pooler) Neon URL, used by both the app and migrations
- `drizzle.config.ts`: schema `./src/db/schemas/*.schemas.ts`, out `./drizzle` (migrations committed); no casing option (Drizzle 1.0 has none), schemas use `pgTable` with explicit snake_case column names (e.g. `timestamp("created_at")`); URL via `dotenv` + a `process.env.DATABASE_URL` check (not `config/env.ts`)
- Scripts `db:generate`, `db:migrate`; migrations run only through the script, never at app startup; no `db:push`
- `GET /health` checks the DB with `select 1`: 200 `{ status: "ok" }`, or 503 with `errors.DATABASE_UNAVAILABLE` through the global filter (`{ statusCode: 503, message }`)
- Global filter: our `HttpException`s keep their `errors.ts` message for 5xx too (5xx are logged); unknown errors → 500 `SOMETHING_WENT_WRONG`
- Not here: shared `timestamps` column helper (BE-1.1), seed (BE-1.8)

**Acceptance criteria**

- [ ] The app starts with a valid `DATABASE_URL`; a missing or invalid one stops it with a clear message
- [ ] `GET /api/health` returns 200 when the DB is reachable and 503 when it isn't
- [ ] `db:generate` / `db:migrate` run against the Neon dev branch (the first real migration comes in BE-1.1)
- [ ] `typecheck` and `lint` pass

---

## [BE-0.5] Zod validation pipe

**Block:** BE-0 · **Depends on:** BE-0.2, BE-0.3

**Goal:** Validate request bodies/queries with zod schemas from the shared package.

**Scope**

- Custom `ZodValidationPipe` (no `nestjs-zod`: it doesn't support Nest 12 / `@nestjs/swagger` 12): `schema.safeParse()`, passes the parsed value (`z.infer`) to the handler, throws `BadRequestException` on failure
- Per-route decorators in `common/decorators/`: `@ZodBody(schema)` and `@ZodQuery(schema)` — apply the pipe and register the schema in Swagger via `z.toJSONSchema()` (`@ApiBody` for bodies, `@ApiQuery` per property for queries)
- Validation errors in the unified error shape: `{ statusCode: 400, message: "Validation failed", errors: { "<field.path>": "<message>" } }`
    - nested paths joined with dots, first issue per field, object-level issues under the `""` key
    - message `VALIDATION_FAILED` in `constants/errors.ts`; `HttpExceptionFilter` passes `errors` through
- Query values arrive as strings: query schemas use `z.coerce.*` for numbers/booleans (the schemas' responsibility, added by feature tickets)
- Out of scope: path-param validation (Nest `ParseIntPipe` / `ParseUUIDPipe`; a `@ZodParam` can come with the first route that needs it) and response validation

**Acceptance criteria**

- [ ] Backend imports from `@school-journal/shared` and builds
- [ ] Invalid body returns 400 with field-level errors
- [ ] A route validated with a zod schema shows that schema in `/api/docs` (checked in tests with a test-only controller, so no demo route ships)

---

# [BE-1] Auth

## Goal

Users register with a role and sign in once approved; routes are protected by auth and role.

## Shared context

- Tables: `users`, `sessions`; minimal `classes` + `student_classes` (needed at student registration; class CRUD comes in BE-3)
- Username + password; email required for teacher and parent, optional for student
- Only `approved` users can sign in
- Auth building blocks: `session.service`, `token.service`, `auth.guard`

## Tickets

| ID     | Title                         | Depends on     |
| ------ | ----------------------------- | -------------- |
| BE-1.1 | Auth data schema              | BE-0.4         |
| BE-1.2 | Public classes list           | BE-1.1         |
| BE-1.3 | Registration                  | BE-1.1, BE-0.5 |
| BE-1.4 | Login                         | BE-1.3         |
| BE-1.5 | Refresh                       | BE-1.4         |
| BE-1.6 | Logout                        | BE-1.4         |
| BE-1.7 | Me + roles guard & decorators | BE-1.4         |
| BE-1.8 | Admin seed                    | BE-1.1, BE-1.2 |

---

## [BE-1.1] Auth data schema

**Block:** BE-1 · **Depends on:** BE-0.4

**Goal:** Tables needed for registration and sessions.

**Scope**

- `timestamps` column helper in `db/schemas/columns.ts`: `created_at` / `updated_at`, `updated_at` auto-updates on change
- All timestamps are `timestamptz` (`withTimezone: true`, `mode: "string"`)
- Integer identity primary keys (`generatedAlwaysAsIdentity`)
- Postgres enums `role` and `user_status` from `ROLES` / `USER_STATUSES` in `@school-journal/shared`
- `users` — one table for all roles:
    - username (unique, case-insensitive via `lower()`), password_hash
    - email (nullable, unique, case-insensitive via `lower()`), phone (nullable, not unique)
    - first_name, last_name, middle_name (nullable)
    - role, status (default `pending`)
    - rejection_reason (nullable), rejected_at (nullable; starts the 30-day timer before a rejected user is deleted)
    - failed_login_attempts (default 0), locked_until (nullable)
    - timestamps
    - index on (role, status)
- `sessions`: id, user_id (FK → users, cascade, indexed), token_id (uuid of the current refresh token), expires_at, revoked_at (nullable), created_at
- `classes`: id, name (e.g. `7-A`), year (school year start, e.g. `2026`), timestamps; unique (name, year)
- `student_classes`: student_id (PK, FK → users, cascade), class_id (FK → classes, restrict), timestamps; current class only
- Role-dependent rules (required email / phone for teacher and parent, class for student) are not DB constraints; they live in zod schemas and services
- Migration via `db:generate` + `db:migrate`
- Not here: `classes.level` and sample classes (BE-1.2), class history per school year (later)

**Acceptance criteria**

- [ ] Migration applies cleanly on an empty DB
- [ ] `username` / `email` uniqueness ignores case (`Ivan` and `ivan` conflict)

---

## [BE-1.2] Public classes list

**Block:** BE-1 · **Depends on:** BE-1.1

**Goal:** Registration form can show classes to pick from.

**Scope**

- `GET /classes/public` — no auth; returns a plain array `[{ id, name }]` (`[]` when there are none); global throttle limit
- Only classes of the current school year: `currentSchoolYear()` with `SCHOOL_YEAR_START_MONTH = 9` (September), both in `@school-journal/shared`
- `classes.level` — required `smallint`, `CLASS_LEVEL_MIN` (0) … `CLASS_LEVEL_MAX` (13) in shared: the school level set by the admin, so class names can follow any school system (`1-A`, `K-1`, `Year 7`, `CP`); migration via `db:generate` + `db:migrate`
- Sorted by `level`, then by `name` with a numeric-aware comparison using `DEFAULT_LOCALE` (`en`) from shared (`7-A` before `10-A`)
- `PublicClass` response type in `@school-journal/shared`
- `classes/` module (controller, service, module), Swagger tag `classes`
- `db:seed` script (`src/db/seed.ts`, run with `tsx`): `pnpm db:seed --samples` adds sample classes for the current school year, levels 1–11 with letters A and B (`1-A` … `11-B`); samples are opt-in (a plain `db:seed` never adds them) and skipped in production; idempotent (existing name + year skipped); BE-1.8 adds the admin to this script
- Global `HttpExceptionFilter`: database errors still return 500 `SOMETHING_WENT_WRONG`, but are logged as `Database unavailable` (connection failures) or `Database query failed` (errors Postgres reports for the query)
- Not here: `level` in class create / edit (BE-3.1)

**Acceptance criteria**

- [ ] Returns the current school year's classes without authentication, sorted by level then name (level 0 first; `1-A` < `2-A` < `10-A`)
- [ ] Classes of other school years are not returned
- [ ] The migration adding `level` applies cleanly
- [ ] Running `db:seed --samples` twice creates each sample class once; a plain `db:seed` adds none
- [ ] With the database unreachable, the endpoint returns 500 `SOMETHING_WENT_WRONG` and the log says `Database unavailable`

---

## [BE-1.3] Registration

**Block:** BE-1 · **Depends on:** BE-1.1, BE-0.5

**Goal:** Anyone can register as teacher, student or parent; the account waits for admin approval.

**API**

- `POST /auth/register`

**Rules**

- Role is one of teacher / student / parent (admin can't self-register)
- Email required for teacher and parent, optional for student
- Student must provide an existing `classId` → row in `student_classes`
- Password hashed (bcrypt); user created with status `pending`
- Zod schema lives in the shared package (discriminated by role)

**Acceptance criteria**

- [ ] Duplicate username/email → 409
- [ ] Teacher/parent without email → 400
- [ ] Student without/with unknown class → 400
- [ ] Response doesn't return tokens; it says the account awaits approval

---

## [BE-1.4] Login

**Block:** BE-1 · **Depends on:** BE-1.3

**Goal:** Approved users sign in with username + password.

**API**

- `POST /auth/login` → access + refresh tokens

**Rules**

- `pending` / `rejected` → 403 with a distinct error code for each (FE shows a proper message)
- Failed-attempt lockout: 5 wrong passwords lock the account for 15 minutes; a successful login resets the counter

**Acceptance criteria**

- [ ] Approved user gets tokens and a session row is created
- [ ] Wrong password → 401; locked account → 423/403

---

## [BE-1.5] Refresh

**Block:** BE-1 · **Depends on:** BE-1.4

**API**

- `POST /auth/refresh`

**Rules**

- Refresh token rotation (tokenId in session); reused old token revokes the session

**Acceptance criteria**

- [ ] Valid refresh returns a new pair; the old refresh token stops working

---

## [BE-1.6] Logout

**Block:** BE-1 · **Depends on:** BE-1.4

**API**

- `POST /auth/logout` (auth required)

**Acceptance criteria**

- [ ] Session is revoked; its refresh token no longer works

---

## [BE-1.7] Me + roles guard & decorators

**Block:** BE-1 · **Depends on:** BE-1.4

**Goal:** Building blocks for protecting every later route.

**Scope**

- `AuthGuard` puts `{ id, role, sessionId }` on the request
- `RolesGuard` + `@Roles(...)`, `@CurrentUser()` in `common/`
- `GET /auth/me` — profile + role (+ classId for students)

**Acceptance criteria**

- [ ] Route with `@Roles('admin')` returns 403 for a teacher
- [ ] `/auth/me` without a token → 401

---

## [BE-1.8] Admin seed

**Block:** BE-1 · **Depends on:** BE-1.1, BE-1.2

**Goal:** The first admin exists without self-registration.

**Scope**

- Adds the admin to the `db:seed` script from BE-1.2; credentials from env; idempotent; runs in production too

**Acceptance criteria**

- [ ] Running the seed twice creates exactly one approved admin

---

# [BE-2] Users & approvals

## Goal

Admin reviews registrations, fixes mistakes and approves or rejects them; admin can browse all users.

## Shared context

- All routes `@Roles('admin')`
- Base path `/admin/users`

## Tickets

| ID     | Title            | Depends on |
| ------ | ---------------- | ---------- |
| BE-2.1 | List users       | BE-1.7     |
| BE-2.2 | User details     | BE-1.7     |
| BE-2.3 | Edit user data   | BE-2.2     |
| BE-2.4 | Approve / reject | BE-2.2     |

---

## [BE-2.1] List users

**API**

- `GET /admin/users?role=&status=&classId=&search=&page=&limit=`

**Acceptance criteria**

- [ ] Filters combine; `search` matches username / first / last name
- [ ] Paginated response with total count

---

## [BE-2.2] User details

**API**

- `GET /admin/users/:id` — profile, role, status; class for students

**Acceptance criteria**

- [ ] Unknown id → 404

---

## [BE-2.3] Edit user data

**Goal:** Admin corrects registration mistakes.

**API**

- `PATCH /admin/users/:id` — names, email, student's class

**Rules**

- Role-dependent email rule from BE-1.3 still applies
- Username, role and password aren't editable here

**Acceptance criteria**

- [ ] Changing a student's class updates `student_classes`

---

## [BE-2.4] Approve / reject

**API**

- `POST /admin/users/:id/approve`
- `POST /admin/users/:id/reject` (optional reason)

**Rules**

- Only `pending` users can be approved/rejected; otherwise 409
- Rejecting revokes existing sessions (if any)

**Acceptance criteria**

- [ ] Approved user can log in right away; rejected user can't

---

# [BE-3] Classes & subjects

## Goal

Admin manages classes and subjects and wires them together: teacher → subject, subject → class.

## Shared context

- Tables: `classes` (from BE-1.1), `subjects` (id, name, teacherId), `class_subjects` (classId, subjectId)
- One teacher per subject for now
- Write routes `@Roles('admin')`; read routes scoped by role

## Tickets

| ID     | Title                     | Depends on     |
| ------ | ------------------------- | -------------- |
| BE-3.1 | Classes CRUD              | BE-1.7         |
| BE-3.2 | Students of a class       | BE-3.1         |
| BE-3.3 | Subjects schema + CRUD    | BE-1.7         |
| BE-3.4 | Assign teacher to subject | BE-3.3         |
| BE-3.5 | Assign subjects to class  | BE-3.1, BE-3.3 |
| BE-3.6 | "My subjects" per role    | BE-3.4, BE-3.5 |

---

## [BE-3.1] Classes CRUD

**API**

- `GET /classes`, `GET /classes/:id`, `POST /classes`, `PATCH /classes/:id`, `DELETE /classes/:id`

**Rules**

- Name unique per year
- `level` required on create (0–13)
- Can't delete a class with students → 409

**Acceptance criteria**

- [ ] Admin manages classes; other roles get 403 on writes

---

## [BE-3.2] Students of a class

**API**

- `GET /classes/:id/students`

**Rules**

- Admin: any class; teacher: only classes that study one of their subjects

**Acceptance criteria**

- [ ] Teacher of an unrelated class → 403

---

## [BE-3.3] Subjects schema + CRUD

**Scope**

- `subjects` table + migration
- `GET /subjects`, `GET /subjects/:id`, `POST /subjects`, `PATCH /subjects/:id`, `DELETE /subjects/:id`

**Rules**

- Name unique; can't delete a subject that has topics → 409

---

## [BE-3.4] Assign teacher to subject

**API**

- `PUT /subjects/:id/teacher` `{ teacherId | null }`

**Rules**

- Target user must be an approved teacher

**Acceptance criteria**

- [ ] Assigning a student/parent → 400

---

## [BE-3.5] Assign subjects to class

**Scope**

- `class_subjects` table + migration
- `PUT /classes/:id/subjects` `{ subjectIds: [] }` (replace set), `GET /classes/:id/subjects`

**Acceptance criteria**

- [ ] Replacing the set adds/removes rows correctly

---

## [BE-3.6] "My subjects" per role

**Goal:** Each role gets the subjects relevant to them.

**API**

- `GET /me/subjects`
    - teacher: own subjects + classes studying each
    - student: subjects of own class
    - parent: per linked child (after BE-6; return empty until then)

---

# [BE-4] Topics

## Goal

Teachers fill their subjects with dated topics; everyone with access can read them.

## Shared context

- Table: `topics` (id, subjectId, title, date)
- Write: subject's teacher (and admin); read: admin, subject's teacher, students of classes studying the subject, their parents

## Tickets

| ID     | Title                          | Depends on |
| ------ | ------------------------------ | ---------- |
| BE-4.1 | Topics schema                  | BE-3.3     |
| BE-4.2 | Create / update / delete topic | BE-4.1     |
| BE-4.3 | List topics of a subject       | BE-4.1     |

---

## [BE-4.1] Topics schema

**Scope**

- `topics` table + migration; index on (subjectId, date)

---

## [BE-4.2] Create / update / delete topic

**API**

- `POST /subjects/:id/topics`, `PATCH /topics/:id`, `DELETE /topics/:id`

**Rules**

- Only the subject's teacher or admin
- Can't delete a topic that has grades → 409

**Acceptance criteria**

- [ ] Teacher of another subject → 403

---

## [BE-4.3] List topics of a subject

**API**

- `GET /subjects/:id/topics?from=&to=` — sorted by date

**Acceptance criteria**

- [ ] Student of a class that doesn't study the subject → 403

---

# [BE-5] Grades

## Goal

Teachers grade students per topic; grades are visible in a class journal and per student.

## Shared context

- Table: `grades` (id, studentId, topicId, teacherId, value 1–100, date, comment)
- Assumption: one grade per student per topic (unique pair) — revisit if needed
- Student must belong to a class that studies the topic's subject
- Introduce a reusable `StudentAccessService` ("can viewer X see student Y?") — used here and in BE-6/BE-7

## Tickets

| ID     | Title                       | Depends on     |
| ------ | --------------------------- | -------------- |
| BE-5.1 | Grades schema               | BE-4.1         |
| BE-5.2 | Student access service      | BE-1.7, BE-3.5 |
| BE-5.3 | Set grade (create / update) | BE-5.1, BE-5.2 |
| BE-5.4 | Class journal               | BE-5.1, BE-5.2 |
| BE-5.5 | Student grades              | BE-5.1, BE-5.2 |

---

## [BE-5.1] Grades schema

**Scope**

- `grades` table + migration; unique (studentId, topicId); indexes for journal and per-student queries

---

## [BE-5.2] Student access service

**Goal:** One place that answers who can see/grade which student.

**Rules**

- admin: everyone
- teacher: students of classes studying their subjects (scoped to those subjects)
- student: self
- parent: linked children (after BE-6)

---

## [BE-5.3] Set grade (create / update)

**API**

- `PUT /topics/:topicId/grades/:studentId` `{ value, date?, comment? }`

**Rules**

- Only the subject's teacher; value 1–100; date defaults to the topic date
- One grade per request — no bulk writes, so a failure affects a single cell only
- No delete: a grade, once set, can only be changed to another value

**Acceptance criteria**

- [ ] Grading a student outside the subject's classes → 403
- [ ] Value 0 or 101 → 400

---

## [BE-5.4] Class journal

**API**

- `GET /classes/:classId/subjects/:subjectId/journal?from=&to=`
- Response: students (rows) × topics (columns) with grades

**Rules**

- Admin or the subject's teacher

---

## [BE-5.5] Student grades

**API**

- `GET /students/:id/grades?subjectId=&from=&to=` — grouped by subject → topics

**Rules**

- Access via `StudentAccessService` (student self, parent of child, teacher for own subjects only, admin)

---

# [BE-6] Parent linking

## Goal

A parent links to their child with an invite code the student generates.

## Shared context

- Tables: `parent_students` (parentId, studentId, unique pair), `invite_codes` (code, studentId, expiresAt, usedAt)
- Parent must be approved to redeem (can't log in otherwise)

## Tickets

| ID     | Title                | Depends on |
| ------ | -------------------- | ---------- |
| BE-6.1 | Linking schema       | BE-1.1     |
| BE-6.2 | Generate invite code | BE-6.1     |
| BE-6.3 | Redeem invite code   | BE-6.2     |
| BE-6.4 | List & manage links  | BE-6.3     |

---

## [BE-6.1] Linking schema

**Scope**

- `parent_students`, `invite_codes` + migration

---

## [BE-6.2] Generate invite code

**API**

- `POST /me/invite-code` (student) → `{ code, expiresAt }`

**Rules**

- Short, human-readable code (e.g. 8 chars); expires in 24h
- Generating a new code invalidates the previous unused one

---

## [BE-6.3] Redeem invite code

**API**

- `POST /me/children` `{ code }` (parent)

**Rules**

- Expired / used / unknown code → 400; already linked → 409
- Code is single-use

**Acceptance criteria**

- [ ] After redeeming, the parent can see the child's grades (BE-5.5)

---

## [BE-6.4] List & manage links

**API**

- `GET /me/children` (parent), `GET /me/parents` (student)
- `GET /admin/users/:id/links`, `DELETE /admin/links/:parentId/:studentId` (admin)

---

# [BE-7] Analytics

## Goal

Grade dynamics and weak/strong topics for students and classes, scoped by role.

## Shared context

- Computed on the fly with SQL aggregates (no stored analytics)
- Thresholds from the shared package (< 60 weak, ≥ 85 strong)
- Access via `StudentAccessService`; admin sees everything

## Tickets

| ID     | Title                      | Depends on |
| ------ | -------------------------- | ---------- |
| BE-7.1 | Student dynamics           | BE-5.5     |
| BE-7.2 | Class dynamics             | BE-5.4     |
| BE-7.3 | Student weak/strong topics | BE-5.5     |
| BE-7.4 | Class weak/strong topics   | BE-5.4     |
| BE-7.5 | Admin overview             | BE-7.2     |

---

## [BE-7.1] Student dynamics

**API**

- `GET /students/:id/analytics/dynamics?subjectId=&period=week|month&from=&to=`
- Response: series of `{ periodStart, average, count }` (per subject when no subjectId)

---

## [BE-7.2] Class dynamics

**API**

- `GET /classes/:id/analytics/dynamics?subjectId=&period=&from=&to=`

**Rules**

- Admin or the subject's teacher

---

## [BE-7.3] Student weak/strong topics

**API**

- `GET /students/:id/analytics/topics?subjectId=`
- Response: topics with average + label `weak | normal | strong`

---

## [BE-7.4] Class weak/strong topics

**API**

- `GET /classes/:id/analytics/topics?subjectId=` — class average per topic + label

---

## [BE-7.5] Admin overview

**API**

- `GET /admin/analytics/overview` — average per class and per subject, counts of weak topics

**Rules**

- `@Roles('admin')`
