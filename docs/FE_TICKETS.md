# School Journal — Frontend Tickets

Global context: [PLAN.md](PLAN.md). Backend tickets: [BE_TICKETS.md](BE_TICKETS.md).
Tests are written only on explicit request.

ID pattern: `FE-<block>.<n>`. Status is tracked in Jira (project `SJ`).

Stack: Next.js (App Router), axios, React Query, shadcn/ui, Tailwind, React Hook Form + zod (schemas from `@school-journal/shared`).

Conventions

- `src/app/` — routes only (thin), grouped by role: `(auth)`, `admin`, `teacher`, `student`, `parent`
- `src/components/` — `pages/` (page-level components), `layout/`, `providers/`, `ui/` (shadcn + UI kit), `shared/`
- `src/hooks/` — React Query hooks per block; `src/api/` — axios requests per block
- No data fetching directly in pages — always `hooks/` → `api/`

---

# [FE-0] Setup & UI kit

## Goal

Running Next.js app in the monorepo with providers, API layer, app shell and a UI kit every later block builds on.

## Tickets

| ID     | Title                   | Depends on     |
| ------ | ----------------------- | -------------- |
| FE-0.1 | Next.js app init        | BE-0.1         |
| FE-0.2 | Theme & design tokens   | FE-0.1         |
| FE-0.3 | UI kit: base components | FE-0.2         |
| FE-0.4 | UI kit: form components | FE-0.3, BE-0.2 |
| FE-0.5 | Providers               | FE-0.1         |
| FE-0.6 | API layer               | FE-0.5         |
| FE-0.7 | App shell layout        | FE-0.3         |

---

## [FE-0.1] Next.js app init

**Block:** FE-0 · **Depends on:** BE-0.1

**Scope**

- `apps/frontend` (App Router, TypeScript, Tailwind), `src/` folder structure from Conventions
- Path aliases, env (`NEXT_PUBLIC_API_URL`), lint/format wired into turbo
- Imports from `@school-journal/shared` work

**Acceptance criteria**

- [ ] `pnpm --filter frontend dev` shows a start page

---

## [FE-0.2] Theme & design tokens

**Block:** FE-0 · **Depends on:** FE-0.1

**Scope**

- shadcn init; color tokens (incl. semantic: success / warning / danger for grades), typography, radius, spacing
- Light / dark theme + toggle
- Grade color scale helper (weak / normal / strong from shared thresholds)

**Acceptance criteria**

- [ ] Switching theme updates all tokens; no hard-coded colors in components

---

## [FE-0.3] UI kit: base components

**Block:** FE-0 · **Depends on:** FE-0.2

**Scope**

- shadcn: button, input, select, textarea, checkbox, date picker, card, badge, dialog, alert dialog, dropdown, tabs, table, skeleton, toast (sonner), tooltip
- Own components in `ui/`: `DataTable` (sorting, pagination slot), `PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `ConfirmDialog`, `GradeBadge`
- A dev-only `/ui-kit` page showing all components

**Acceptance criteria**

- [ ] Every component looks right in light and dark themes and at phone width

---

## [FE-0.4] UI kit: form components

**Block:** FE-0 · **Depends on:** FE-0.3, BE-0.2

**Scope**

- RHF + zod resolver wrappers: `Form`, `TextField`, `PasswordField`, `SelectField`, `DateField`, `TextareaField`
- Mapping of backend field errors (BE-0.5 shape) onto form fields

**Acceptance criteria**

- [ ] A sample form validates on the client with a shared schema and shows server field errors

---

## [FE-0.5] Providers

**Block:** FE-0 · **Depends on:** FE-0.1

**Scope**

- `components/providers/`: QueryClient (sane defaults, devtools in dev), theme, toaster
- Single `AppProviders` used in the root layout

---

## [FE-0.6] API layer

**Block:** FE-0 · **Depends on:** FE-0.5

**Scope**

- `api/client.ts` axios instance (base URL, JSON, timeout)
- Error normalization into one `ApiError` type (code, message, field errors)
- Global error toast for unexpected errors; query keys convention (`constants/query-keys.ts`)
- Auth interceptors come in FE-1.1

---

## [FE-0.7] App shell layout

**Block:** FE-0 · **Depends on:** FE-0.3

**Scope**

- `components/layout/`: sidebar, header (user menu, theme toggle), content area, mobile drawer
- Role-based navigation config in `constants/navigation.ts`
- Separate minimal layout for `(auth)` pages

**Acceptance criteria**

- [ ] Shell works at phone width (sidebar becomes a drawer)

---

# [FE-1] Auth

## Goal

Users register, sign in, stay signed in and only reach pages for their role.

## Shared context

- Access token in memory; refresh token storage decided in FE-1.1 (prefer httpOnly cookie — needs BE agreement)
- Login error codes from BE-1.4: pending, rejected, locked, wrong credentials

## Tickets

| ID     | Title                            | Depends on             |
| ------ | -------------------------------- | ---------------------- |
| FE-1.1 | Token handling & interceptors    | FE-0.6, BE-1.5         |
| FE-1.2 | Auth provider & `useMe`          | FE-1.1, BE-1.7         |
| FE-1.3 | Registration page                | FE-0.4, BE-1.2, BE-1.3 |
| FE-1.4 | Login page                       | FE-1.2, BE-1.4         |
| FE-1.5 | Logout                           | FE-1.2, BE-1.6         |
| FE-1.6 | Route protection & role redirect | FE-1.2                 |

---

## [FE-1.1] Token handling & interceptors

**Block:** FE-1 · **Depends on:** FE-0.6, BE-1.5

**Scope**

- Request interceptor adds `Authorization: Bearer`
- On 401: single in-flight refresh, queue other requests, retry; on refresh failure → sign out and redirect to login

**Acceptance criteria**

- [ ] Several parallel requests with an expired token trigger exactly one refresh

---

## [FE-1.2] Auth provider & `useMe`

**Block:** FE-1 · **Depends on:** FE-1.1, BE-1.7

**Scope**

- `AuthProvider` with current user, role, status (`loading | authenticated | guest`)
- `useMe`, `useAuth` hooks; session restore on page reload

---

## [FE-1.3] Registration page

**Block:** FE-1 · **Depends on:** FE-0.4, BE-1.2, BE-1.3

**Screen:** `/register`

**Scope**

- Role picker (teacher / student / parent) switches the form fields
- Email and phone required for teacher and parent, optional for student
- Student picks a class (public classes list)
- Success screen: "Your account is waiting for admin approval"

**Acceptance criteria**

- [ ] Shared zod schema validates on the client; 409 shows "username/email taken" on the field

---

## [FE-1.4] Login page

**Block:** FE-1 · **Depends on:** FE-1.2, BE-1.4

**Screen:** `/login`

**Scope**

- Username + password form
- Distinct messages for pending, rejected, locked, wrong credentials
- After login → redirect to the role's home

---

## [FE-1.5] Logout

**Block:** FE-1 · **Depends on:** FE-1.2, BE-1.6

**Scope**

- Logout in the header user menu; clears tokens and the React Query cache; redirects to `/login`

---

## [FE-1.6] Route protection & role redirect

**Block:** FE-1 · **Depends on:** FE-1.2

**Scope**

- Guard for `admin`, `teacher`, `student`, `parent` route groups
- Guest → `/login`; wrong role → own home; signed-in user on `/login` → own home
- `/` redirects by role

---

# [FE-2] Users & approvals (admin)

## Goal

Admin reviews registrations, corrects data, approves or rejects, and browses all users.

## Tickets

| ID     | Title                    | Depends on             |
| ------ | ------------------------ | ---------------------- |
| FE-2.1 | Users list page          | FE-1.6, BE-2.1         |
| FE-2.2 | Pending approvals view   | FE-2.1                 |
| FE-2.3 | User details & edit form | FE-2.1, BE-2.2, BE-2.3 |
| FE-2.4 | Approve / reject actions | FE-2.3, BE-2.4         |

---

## [FE-2.1] Users list page

**Block:** FE-2 · **Depends on:** FE-1.6, BE-2.1

**Screen:** `/admin/users`

**Scope**

- Table with role / status / class filters, search, pagination
- Filters kept in URL query params

---

## [FE-2.2] Pending approvals view

**Block:** FE-2 · **Depends on:** FE-2.1

**Screen:** `/admin/approvals`

**Scope**

- Users list pre-filtered to `pending`
- Pending count badge in the admin sidebar

---

## [FE-2.3] User details & edit form

**Block:** FE-2 · **Depends on:** FE-2.1, BE-2.2, BE-2.3

**Screen:** `/admin/users/[id]`

**Scope**

- Profile view; edit form for names, email, student's class
- Same role-dependent email rule as registration

---

## [FE-2.4] Approve / reject actions

**Block:** FE-2 · **Depends on:** FE-2.3, BE-2.4

**Scope**

- Approve / Reject buttons on details page and in the approvals list
- Reject asks for an optional reason in a confirm dialog
- Lists and badge update after the action (query invalidation)

---

# [FE-3] Classes & subjects

## Goal

Admin manages classes and subjects and wires them together; teachers and students see "my subjects".

## Tickets

| ID     | Title                     | Depends on             |
| ------ | ------------------------- | ---------------------- |
| FE-3.1 | Classes list & CRUD       | FE-1.6, BE-3.1         |
| FE-3.2 | Class details page        | FE-3.1, BE-3.2, BE-3.5 |
| FE-3.3 | Subjects list & CRUD      | FE-1.6, BE-3.3         |
| FE-3.4 | Assign teacher to subject | FE-3.3, BE-3.4         |
| FE-3.5 | "My subjects" page        | FE-1.6, BE-3.6         |

---

## [FE-3.1] Classes list & CRUD

**Block:** FE-3 · **Depends on:** FE-1.6, BE-3.1

**Screen:** `/admin/classes`

**Scope**

- Table; create / edit in a dialog; delete with confirm (shows the 409 "class has students" message)

---

## [FE-3.2] Class details page

**Block:** FE-3 · **Depends on:** FE-3.1, BE-3.2, BE-3.5

**Screen:** `/admin/classes/[id]`

**Scope**

- Students of the class (link to user details)
- Subjects of the class — multi-select to change the set

---

## [FE-3.3] Subjects list & CRUD

**Block:** FE-3 · **Depends on:** FE-1.6, BE-3.3

**Screen:** `/admin/subjects`

**Scope**

- Table with assigned teacher; create / edit dialog; delete with confirm

---

## [FE-3.4] Assign teacher to subject

**Block:** FE-3 · **Depends on:** FE-3.3, BE-3.4

**Scope**

- Teacher select (approved teachers only) in the subject row / edit dialog; "unassign" option

---

## [FE-3.5] "My subjects" page

**Block:** FE-3 · **Depends on:** FE-1.6, BE-3.6

**Screens:** `/teacher/subjects`, `/student/subjects`

**Scope**

- Teacher: own subjects with the classes studying each
- Student: subjects of own class
- Cards link to the subject page (FE-4.1)

---

# [FE-4] Topics

## Goal

Teachers manage dated topics of their subjects; others see them read-only.

## Tickets

| ID     | Title                        | Depends on     |
| ------ | ---------------------------- | -------------- |
| FE-4.1 | Subject page with topics     | FE-3.5, BE-4.3 |
| FE-4.2 | Topic create / edit / delete | FE-4.1, BE-4.2 |

---

## [FE-4.1] Subject page with topics

**Block:** FE-4 · **Depends on:** FE-3.5, BE-4.3

**Screen:** `/<role>/subjects/[id]`

**Scope**

- Topic list sorted by date, date range filter
- Read-only for admin (view), students and parents

---

## [FE-4.2] Topic create / edit / delete

**Block:** FE-4 · **Depends on:** FE-4.1, BE-4.2

**Scope**

- Teacher only: add / edit topic (title, date) in a dialog; delete with confirm
- Delete blocked message when the topic has grades (409)

---

# [FE-5] Grades

## Goal

Teachers grade students in a journal grid; students, parents and admin see grades per student.

## Shared context

- Grades are saved one cell at a time — no bulk save, no delete (a grade can only be changed)
- Value 1–100, colored by weak / normal / strong (FE-0.2 helper)

## Tickets

| ID     | Title               | Depends on     |
| ------ | ------------------- | -------------- |
| FE-5.1 | Journal grid        | FE-4.1, BE-5.4 |
| FE-5.2 | Grade cell editing  | FE-5.1, BE-5.3 |
| FE-5.3 | Student grades page | FE-1.6, BE-5.5 |

---

## [FE-5.1] Journal grid

**Block:** FE-5 · **Depends on:** FE-4.1, BE-5.4

**Screens:** `/teacher/journal`, `/admin/journal`

**Scope**

- Class + subject picker (teacher: only own combinations), date range
- Grid: students (rows, sticky) × topics (columns, by date), horizontal scroll inside the grid
- Read-only mode for admin

---

## [FE-5.2] Grade cell editing

**Block:** FE-5 · **Depends on:** FE-5.1, BE-5.3

**Scope**

- Click a cell → input (1–100) + optional comment
- Each cell saves on its own; states: saving / saved / error with retry
- Optimistic update with rollback of that cell only on failure
- Keyboard navigation between cells (Enter / arrows)

**Acceptance criteria**

- [ ] A failed save affects only its cell; other cells keep their values
- [ ] Values outside 1–100 can't be submitted

---

## [FE-5.3] Student grades page

**Block:** FE-5 · **Depends on:** FE-1.6, BE-5.5

**Screens:** `/student/grades`, `/parent/grades` (selected child), `/admin/users/[id]/grades`, teacher view of a student

**Scope**

- One shared component: grades grouped by subject → topics, subject and date filters
- Comments shown on hover / tap

---

# [FE-6] Parent linking

## Goal

Student shares an invite code; parent redeems it and switches between children.

## Tickets

| ID     | Title                       | Depends on     |
| ------ | --------------------------- | -------------- |
| FE-6.1 | Invite code widget          | FE-1.6, BE-6.2 |
| FE-6.2 | Redeem code form            | FE-1.6, BE-6.3 |
| FE-6.3 | Child switcher              | FE-6.2, BE-6.4 |
| FE-6.4 | Links in admin user details | FE-2.3, BE-6.4 |

---

## [FE-6.1] Invite code widget

**Block:** FE-6 · **Depends on:** FE-1.6, BE-6.2

**Scope**

- Student: generate code, copy button, expiry countdown, list of linked parents

---

## [FE-6.2] Redeem code form

**Block:** FE-6 · **Depends on:** FE-1.6, BE-6.3

**Scope**

- Parent: enter code; clear messages for expired / used / unknown / already linked
- Shown as the parent's empty state when no child is linked yet

---

## [FE-6.3] Child switcher

**Block:** FE-6 · **Depends on:** FE-6.2, BE-6.4

**Scope**

- Child selector in the parent header; selected child kept in the URL (`?child=`) and remembered locally
- All parent pages read the selected child

---

## [FE-6.4] Links in admin user details

**Block:** FE-6 · **Depends on:** FE-2.3, BE-6.4

**Scope**

- Admin sees parents/children of a user; unlink with confirm

---

# [FE-7] Analytics

## Goal

Charts for grade dynamics and weak/strong topics on every role's dashboard.

## Tickets

| ID     | Title                     | Depends on             |
| ------ | ------------------------- | ---------------------- |
| FE-7.1 | Chart kit                 | FE-0.3                 |
| FE-7.2 | Student dashboard         | FE-7.1, BE-7.1, BE-7.3 |
| FE-7.3 | Parent dashboard          | FE-7.2, FE-6.3         |
| FE-7.4 | Teacher class analytics   | FE-7.1, BE-7.2, BE-7.4 |
| FE-7.5 | Teacher student analytics | FE-7.2                 |
| FE-7.6 | Admin overview dashboard  | FE-7.1, BE-7.5         |

---

## [FE-7.1] Chart kit

**Block:** FE-7 · **Depends on:** FE-0.3

**Scope**

- shadcn charts (recharts) setup with theme tokens
- `DynamicsChart` (line, per period, optional per-subject series), `TopicStrengthList` (weak / strong groups), `PeriodPicker` (week / month), `StatCard`

---

## [FE-7.2] Student dashboard

**Block:** FE-7 · **Depends on:** FE-7.1, BE-7.1, BE-7.3

**Screen:** `/student`

**Scope**

- Dynamics chart (subject filter), weak / strong topics, recent grades
- Built as a reusable `StudentAnalytics` component (used by FE-7.3, FE-7.5)

---

## [FE-7.3] Parent dashboard

**Block:** FE-7 · **Depends on:** FE-7.2, FE-6.3

**Screen:** `/parent`

**Scope**

- `StudentAnalytics` for the selected child

---

## [FE-7.4] Teacher class analytics

**Block:** FE-7 · **Depends on:** FE-7.1, BE-7.2, BE-7.4

**Screen:** `/teacher/analytics`

**Scope**

- Class + subject picker; class dynamics; class weak / strong topics; student list sorted by average (link to FE-7.5)

---

## [FE-7.5] Teacher student analytics

**Block:** FE-7 · **Depends on:** FE-7.2

**Screen:** `/teacher/students/[id]`

**Scope**

- `StudentAnalytics` scoped to the teacher's subjects

---

## [FE-7.6] Admin overview dashboard

**Block:** FE-7 · **Depends on:** FE-7.1, BE-7.5

**Screen:** `/admin`

**Scope**

- Averages per class and per subject, weak topics count, pending approvals count; drill-down links to class / student analytics
