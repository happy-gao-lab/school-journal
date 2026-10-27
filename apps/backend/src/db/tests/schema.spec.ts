import { readdirSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
    CLASS_LEVEL_MAX,
    CLASS_LEVEL_MIN,
    Role,
    USERNAME_MAX_LENGTH,
    UserStatus,
} from "@school-journal/shared";

import { classesTable, studentClassesTable } from "../schemas/class.schemas.js";
import { sessionsTable } from "../schemas/session.schemas.js";
import { usersTable, type CreateUser } from "../schemas/user.schemas.js";
import { createTestDb, MIGRATIONS_FOLDER, type TestDb } from "./test-db.js";

let client: PGlite;
let db: TestDb;

const userValues = (overrides: Partial<CreateUser> = {}): CreateUser => ({
    username: "ivan",
    passwordHash: "hash",
    firstName: "Ivan",
    lastName: "Petrenko",
    role: Role.Student,
    ...overrides,
});

const insertUser = async (overrides: Partial<CreateUser> = {}) => {
    const [user] = await db.insert(usersTable).values(userValues(overrides)).returning();

    return user!;
};

const insertClass = async (name = "7-A", year = 2026) => {
    const [created] = await db.insert(classesTable).values({ name, level: 7, year }).returning();

    return created!;
};

// Drizzle wraps the driver error; the Postgres constraint name sits on its cause
const expectConstraint = (query: Promise<unknown>, constraint: string) =>
    expect(query).rejects.toMatchObject({ cause: { constraint } });

const countRows = async (table: string) => {
    const { rows } = await client.query<{ count: number }>(
        `select count(*)::int as count from ${table}`,
    );

    return rows[0]!.count;
};

beforeAll(async () => {
    ({ client, db } = await createTestDb());
});

afterAll(async () => {
    await client.close();
});

beforeEach(async () => {
    await db.execute(sql`truncate users, classes restart identity cascade`);
});

describe("migrations", () => {
    it("apply on an empty database, and running them again changes nothing", async () => {
        const migrationCount = readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true }).filter(
            (entry) => entry.isDirectory(),
        ).length;

        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

        expect(await countRows("drizzle.__drizzle_migrations")).toBe(migrationCount);
        const { rows } = await client.query<{ table_name: string }>(
            "select table_name from information_schema.tables where table_schema = 'public' order by 1",
        );
        expect(rows.map((row) => row.table_name)).toEqual([
            "classes",
            "sessions",
            "student_classes",
            "users",
        ]);
    });
});

describe("users", () => {
    it("stores a new user as pending with no failed attempts and both timestamps", async () => {
        const user = await insertUser();

        expect(user).toMatchObject({ status: UserStatus.Pending, failedLoginAttempts: 0 });
        expect(user.createdAt).toEqual(expect.any(String));
        expect(user.updatedAt).toEqual(expect.any(String));
    });

    it("rejects a username that differs only by case", async () => {
        await insertUser({ username: "ivan" });

        await expectConstraint(insertUser({ username: "Ivan" }), "users_username_lower_unique");
    });

    it("rejects an email that differs only by case", async () => {
        await insertUser({ username: "ivan", email: "A@x.com" });

        await expectConstraint(
            insertUser({ username: "petro", email: "a@x.com" }),
            "users_email_lower_unique",
        );
    });

    it("allows several users without an email", async () => {
        await insertUser({ username: "ivan" });
        await insertUser({ username: "petro" });

        expect(await countRows("users")).toBe(2);
    });

    it("rejects a rejected user without rejected_at", async () => {
        await expectConstraint(
            insertUser({ status: UserStatus.Rejected }),
            "users_rejected_at_status_check",
        );
    });

    it("rejects rejected_at on a user who isn't rejected", async () => {
        await expectConstraint(
            insertUser({ status: UserStatus.Pending, rejectedAt: new Date().toISOString() }),
            "users_rejected_at_status_check",
        );
    });

    it("stores a rejected user with rejected_at", async () => {
        const user = await insertUser({
            status: UserStatus.Rejected,
            rejectedAt: new Date().toISOString(),
        });

        expect(user.status).toBe(UserStatus.Rejected);
    });

    it("stores a username of exactly the max length and rejects a longer one", async () => {
        await insertUser({ username: "a".repeat(USERNAME_MAX_LENGTH) });

        await expect(
            insertUser({ username: "b".repeat(USERNAME_MAX_LENGTH + 1) }),
        ).rejects.toMatchObject({
            cause: { code: "22001" }, // string_data_right_truncation
        });
    });

    it("refreshes updated_at on an update through Drizzle", async () => {
        const past = "2000-01-01T00:00:00Z";
        const user = await insertUser({ updatedAt: past });

        const [updated] = await db
            .update(usersTable)
            .set({ firstName: "Ivanko" })
            .where(eq(usersTable.id, user.id))
            .returning();

        expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(new Date(past).getTime());
    });
});

describe("classes and student_classes", () => {
    it("rejects the same class name in the same school year but allows it in another", async () => {
        await insertClass("7-A", 2026);

        await expectConstraint(insertClass("7-A", 2026), "classes_name_year_unique");
        await expect(insertClass("7-A", 2027)).resolves.toMatchObject({ name: "7-A", year: 2027 });
    });

    it("accepts a level of exactly the min and the max", async () => {
        await expect(
            db.insert(classesTable).values({ name: "K-1", level: CLASS_LEVEL_MIN, year: 2026 }),
        ).resolves.toBeDefined();
        await expect(
            db.insert(classesTable).values({ name: "13-A", level: CLASS_LEVEL_MAX, year: 2026 }),
        ).resolves.toBeDefined();
    });

    it("rejects a level below the min or above the max", async () => {
        await expectConstraint(
            db.insert(classesTable).values({ name: "X-1", level: CLASS_LEVEL_MIN - 1, year: 2026 }),
            "classes_level_check",
        );
        await expectConstraint(
            db.insert(classesTable).values({ name: "X-2", level: CLASS_LEVEL_MAX + 1, year: 2026 }),
            "classes_level_check",
        );
    });

    it("refuses to delete a class that still has a student", async () => {
        const student = await insertUser();
        const schoolClass = await insertClass();
        await db
            .insert(studentClassesTable)
            .values({ studentId: student.id, classId: schoolClass.id });

        await expectConstraint(
            db.delete(classesTable).where(eq(classesTable.id, schoolClass.id)),
            "student_classes_class_id_classes_id_fkey",
        );
    });

    it("keeps one class per student", async () => {
        const student = await insertUser();
        const first = await insertClass("7-A");
        const second = await insertClass("7-B");
        await db.insert(studentClassesTable).values({ studentId: student.id, classId: first.id });

        await expectConstraint(
            db.insert(studentClassesTable).values({ studentId: student.id, classId: second.id }),
            "student_classes_pkey",
        );
    });
});

describe("deleting a user", () => {
    it("also deletes their sessions and class row", async () => {
        const student = await insertUser();
        const schoolClass = await insertClass();
        await db
            .insert(studentClassesTable)
            .values({ studentId: student.id, classId: schoolClass.id });
        await db.insert(sessionsTable).values({
            userId: student.id,
            tokenId: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });

        await db.delete(usersTable).where(eq(usersTable.id, student.id));

        expect(await countRows("sessions")).toBe(0);
        expect(await countRows("student_classes")).toBe(0);
        expect(await countRows("classes")).toBe(1);
    });
});
