# School Journal — General Project Plan

## Context

An online school journal for tracking student progress. Four roles (admin, teacher, student, parent). Built **block by block**: backend blocks (tables → services → controllers) and frontend blocks are separate tasks. This document is the global map; details get worked out per block during execution.

The app is for **Ukrainian and English schools**: the UI and the project itself are English, and text people type (names, passwords) accepts English and Ukrainian letters.

---

## 1. Roles & capabilities

| Role        | Can do                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**   | Create subjects, classes; assign teacher → subject, subject → class; review registrations (teacher, student, parent): check data, correct mistakes (e.g. student's class), approve/reject. Sees the whole picture: all subjects/topics, all grades per class / per student, all analytics |
| **Teacher** | Fill own subjects with topics; grade students of classes that study their subject; see dynamics per class and per student; see weak/strong topics                                                                                                                                         |
| **Student** | Chooses own class at registration; sees own grades, dynamics, weak/strong topics; generates an invite code for a parent                                                                                                                                                                   |
| **Parent**  | Links to child(ren) via invite code; sees their grades, dynamics, weak/strong topics                                                                                                                                                                                                      |

Assumptions (for now): one teacher per subject; one class per student; a parent may have several children.

## 2. Key concepts

- **Auth:** username + password (students may have no email). Email and phone are **required for teachers and parents**, optional for students. JWT access + refresh tokens with DB sessions (`session.service.ts`, `token.service.ts`, `auth.guard.ts`).
- **Registration approval:** user registers with a chosen role (student also picks a class) → status `pending` → admin reviews, may edit the data, then sets `approved` / `rejected`. Only `approved` users can sign in. First admin is created by a seed script.
- **Authorization:** `RolesGuard` + `@Roles()` decorator on top of `AuthGuard`, plus ownership checks in services (teacher only touches own subjects; parent only sees linked children; student only self; admin — everything).
- **Parent ↔ child link:** student generates a short-lived invite code → parent enters it → link created (the parent account itself is still admin-approved).
- **Topics:** belong to a subject and have a **date** (when the topic is taught).
- **Grades:** scale **1–100**, no grade types for now. Each grade belongs to student + topic (topic → subject), with a date and optional comment.
- **Analytics (computed, not stored):**
    - _Dynamics_ — average grade over time (by week/month) per student or per class, per subject.
    - _Weak / strong spots_ — average per topic; below threshold (e.g. < 60) = weak, above (e.g. ≥ 85) = strong. Thresholds live in shared constants.

## 3. Domain model (high level)

```
users           id, username (unique), passwordHash, email?, firstName, lastName,
                role (admin|teacher|student|parent), status (pending|approved|rejected)
sessions        one row per sign-in: user, current refresh `tokenId`, expiry, revocation
classes         id, name ("7-A"), level (0–13), year
student_classes studentId → classId   (or classId column on a student profile)
subjects        id, name, teacherId → users
class_subjects  classId, subjectId    (which classes study which subject)
topics          id, subjectId, title, date
grades          id, studentId, topicId, teacherId, value(1–100), date, comment
parent_students parentId, studentId
invite_codes    code, studentId, expiresAt, usedAt
```

If multi-teacher subjects come later, `teacherId` moves from `subjects` to `class_subjects`.

## 4. Monorepo structure (pnpm workspaces + Turborepo)

```
school-journal/
├─ apps/
│  ├─ backend/                 NestJS — feature modules (see CLAUDE.md)
│  │  └─ src/
│  │     ├─ main.ts, app.module.ts
│  │     ├─ db/ index.ts, schemas/*.schemas.ts
│  │     ├─ constants/ errors.ts, index.ts
│  │     ├─ filters/ http-exception.filter.ts
│  │     ├─ common/ guards (roles), decorators (@Roles, @CurrentUser)
│  │     └─ <block>/ controller, service, module, dto
│  └─ frontend/                Next.js (App Router)
│     └─ src/
│        ├─ app/               routes only (thin), grouped by role: (auth), admin, teacher, student, parent
│        ├─ components/ pages/, layout/, providers/, ui/ (shadcn), shared/
│        ├─ hooks/             React Query hooks per block (useGrades, useSubjects…)
│        ├─ api/               axios instance + interceptors (token refresh) + per-block requests
│        ├─ constants/, lib/, types/
├─ packages/
│  └─ shared/                  roles/status enums, grade thresholds, zod schemas & inferred types
│                              used by both frontend (RHF + zod) and backend (validation pipe)
├─ turbo.json, pnpm-workspace.yaml
```

Backend tooling: ESM, vitest, oxlint, prettier with sort-imports, drizzle-kit, Neon serverless driver, nestjs-pino, throttler.

## 5. Blocks (execution order)

Every block is a separate task. FE-N depends on BE-N.

### 5.1 BE blocks

- **BE-0 Setup** — monorepo, shared package, NestJS app, Neon + Drizzle config, lint/format, error filter, logger.
- **BE-1 Auth** — register (role-dependent fields; student picks class), login, refresh, logout, me; roles guard.
- **BE-2 Users & approvals** — list pending users, view/edit user data (incl. student's class), approve/reject, list users by role.
- **BE-3 Classes & subjects** — CRUD classes, CRUD subjects, assign teacher to subject, assign subjects to class, list students per class.
- **BE-4 Topics** — teacher CRUD topics (with date) in own subjects; admin read-all.
- **BE-5 Grades** — teacher grades a student per topic, edits/deletes own grades; class journal (students × topics); admin read-all.
- **BE-6 Parent linking** — student generates invite code, parent redeems it, list linked children.
- **BE-7 Analytics** — dynamics (per student / per class), weak/strong topics; scoped by role (admin — all).

### 5.2 FE blocks

- **FE-0 Setup & UI kit** — Next.js app, providers (React Query, theme), axios base, base layout; UI kit: shadcn init, theme tokens (colors, typography, light/dark), base components (buttons, inputs, form fields wired to RHF + zod, table, dialog, toast, card, empty/loading/error states).
- **FE-1 Auth** — login/register pages, auth provider, protected routes, role-based redirect.
- **FE-2 Users & approvals** — admin approvals table with edit form.
- **FE-3 Classes & subjects** — admin management pages.
- **FE-4 Topics** — subject page with topic list.
- **FE-5 Grades** — journal grid.
- **FE-6 Parent linking** — code widget, redeem form, child switcher for parents.
- **FE-7 Analytics** — charts (shadcn charts / recharts) on admin, teacher, student and parent dashboards.

### 5.3 Later

- Student absences (mark absent per topic/lesson, show in journal and analytics)
- Grade types & weights, notifications, school years/terms, multiple teachers per subject, audit log, deploy.

## 6. Conventions to keep across blocks

- Tests are written only on explicit request.
- Errors via central `constants/errors.ts` + global exception filter.
- Shared zod schema = single source of truth for request shape (FE form + BE validation).
- FE: no data fetching in pages directly — always through `hooks/` (React Query) → `api/` (axios).

## Verification

Per block: BE endpoints checked manually against a Neon dev branch with seeded users of each role; FE block verified in the browser against the running backend.
