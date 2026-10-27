import type { PGlite } from "@electric-sql/pglite";
import { BadRequestException, ConflictException, HttpException } from "@nestjs/common";
import { compare } from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterInput, Role, UserStatus } from "@school-journal/shared";

import { errors } from "../../constants/errors.js";
import { messages } from "../../constants/messages.js";
import { classesTable, studentClassesTable } from "../../db/schemas/class.schemas.js";
import { usersTable } from "../../db/schemas/user.schemas.js";
import { createTestDb, type TestDb } from "../../db/tests/test-db.js";
import { AuthService } from "../auth.service.js";

// The service reads the db module at call time, so it gets the in-memory database created below
const holder = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("../../db/index.js", () => ({
    get db() {
        return holder.db;
    },
}));

// The lowest bcrypt cost keeps the hashing fast; the cost itself isn't under test
vi.mock("../../constants/index.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../constants/index.js")>()),
    BCRYPT_SALT_ROUNDS: 4,
}));

let client: PGlite;
let db: TestDb;

// The date is fixed in the 2026 school year
const SCHOOL_YEAR = 2026;

type TeacherInput = Extract<RegisterInput, { role: typeof Role.Teacher }>;
type StudentInput = Extract<RegisterInput, { role: typeof Role.Student }>;

const teacher = (overrides: Partial<TeacherInput> = {}): TeacherInput => ({
    role: Role.Teacher,
    username: "Ivan.P",
    password: "Secret12",
    firstName: "Ivan",
    lastName: "Petrenko",
    email: "ivan@school.com",
    phone: "+380671234567",
    ...overrides,
});

const student = (classId: number, overrides: Partial<StudentInput> = {}): StudentInput => ({
    role: Role.Student,
    username: "olena",
    password: "Secret12",
    firstName: "Olena",
    lastName: "Koval",
    classId,
    ...overrides,
});

const insertClass = async (year = SCHOOL_YEAR) => {
    const [created] = await db
        .insert(classesTable)
        .values({ name: "7-A", level: 7, year })
        .returning();

    if (!created) {
        throw new Error(`Test setup: insert into classes returned no row for year ${year}`);
    }

    return created.id;
};

const allUsers = () => db.select().from(usersTable);

// The status, message and field errors the client gets from a thrown exception
const rejectionOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        if (error instanceof HttpException) {
            return { type: error.constructor, body: error.getResponse() };
        }

        throw error;
    }

    throw new Error("Expected the registration to be rejected");
};

// Skips one of the service's up-front checks, as if a concurrent request changed the data after it
const skipCheck = (name: "assertAvailable" | "assertCurrentClass") =>
    vi
        .spyOn(AuthService.prototype as unknown as Record<typeof name, () => Promise<void>>, name)
        .mockResolvedValue(undefined);

beforeAll(async () => {
    ({ client, db } = await createTestDb());
    holder.db = db;
});

afterAll(async () => {
    await client.close();
});

beforeEach(async () => {
    await db.execute(sql`truncate users, classes restart identity cascade`);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("AuthService.register", () => {
    describe("creating the account", () => {
        it("creates a pending user and answers with the status and message only", async () => {
            await expect(new AuthService().register(teacher())).resolves.toEqual({
                status: UserStatus.Pending,
                message: messages.REGISTRATION_PENDING,
            });

            const [user] = await allUsers();

            expect(user).toMatchObject({
                username: "Ivan.P",
                email: "ivan@school.com",
                phone: "+380671234567",
                role: Role.Teacher,
                status: UserStatus.Pending,
            });
        });

        it("stores a bcrypt hash of the password, not the password", async () => {
            await new AuthService().register(teacher({ password: "Secret12" }));

            const [user] = await allUsers();

            if (!user) {
                throw new Error("Expected the user to be created");
            }

            expect(user.passwordHash).not.toContain("Secret12");
            await expect(compare("Secret12", user.passwordHash)).resolves.toBe(true);
            await expect(compare("Secret13", user.passwordHash)).resolves.toBe(false);
        });

        it("puts a student into the chosen class", async () => {
            const classId = await insertClass();

            await new AuthService().register(student(classId));

            const [user] = await allUsers();

            await expect(db.select().from(studentClassesTable)).resolves.toMatchObject([
                { studentId: user?.id, classId },
            ]);
        });

        it("lets several students register without an email", async () => {
            const classId = await insertClass();
            const service = new AuthService();

            await service.register(student(classId, { username: "olena" }));
            await service.register(student(classId, { username: "petro" }));

            await expect(allUsers()).resolves.toHaveLength(2);
        });
    });

    describe("duplicates", () => {
        it("rejects a username that differs only by case", async () => {
            const service = new AuthService();
            await service.register(teacher({ username: "Ivan.P" }));

            await expect(
                rejectionOf(
                    service.register(teacher({ username: "ivan.p", email: "other@school.com" })),
                ),
            ).resolves.toEqual({
                type: ConflictException,
                body: {
                    message: errors.USERNAME_TAKEN,
                    errors: { username: errors.USERNAME_TAKEN },
                },
            });
            await expect(allUsers()).resolves.toHaveLength(1);
        });

        it("rejects an email that differs only by case", async () => {
            const service = new AuthService();
            await service.register(teacher({ email: "ivan@school.com" }));

            // the schema lowercases emails, but the stored one is compared case-insensitively too
            await db.update(usersTable).set({ email: "Ivan@School.com" });

            await expect(
                rejectionOf(
                    service.register(teacher({ username: "other", email: "ivan@school.com" })),
                ),
            ).resolves.toEqual({
                type: ConflictException,
                body: { message: errors.EMAIL_TAKEN, errors: { email: errors.EMAIL_TAKEN } },
            });
        });

        it("reports the username when both the username and the email are taken", async () => {
            const service = new AuthService();
            await service.register(teacher({ username: "first", email: "first@school.com" }));
            await service.register(teacher({ username: "second", email: "second@school.com" }));

            const rejection = await rejectionOf(
                service.register(teacher({ username: "second", email: "first@school.com" })),
            );

            expect(rejection.body).toMatchObject({ message: errors.USERNAME_TAKEN });
        });

        it.each([
            ["username", { email: "other@school.com" }, errors.USERNAME_TAKEN],
            ["email", { username: "other" }, errors.EMAIL_TAKEN],
        ] as const)(
            "maps a %s taken by a concurrent request (unique violation) to the same 409",
            async (field, overrides, message) => {
                const service = new AuthService();
                await service.register(teacher());
                skipCheck("assertAvailable");

                await expect(rejectionOf(service.register(teacher(overrides)))).resolves.toEqual({
                    type: ConflictException,
                    body: { message, errors: { [field]: message } },
                });
                await expect(allUsers()).resolves.toHaveLength(1);
            },
        );
    });

    describe("student class", () => {
        const classNotFound = {
            type: BadRequestException,
            body: {
                message: errors.CLASS_NOT_FOUND,
                errors: { classId: errors.CLASS_NOT_FOUND },
            },
        };

        it("rejects an unknown class and creates no user", async () => {
            await expect(rejectionOf(new AuthService().register(student(999)))).resolves.toEqual(
                classNotFound,
            );
            await expect(allUsers()).resolves.toHaveLength(0);
        });

        it("rejects a class of the previous school year", async () => {
            const classId = await insertClass(SCHOOL_YEAR - 1);

            await expect(
                rejectionOf(new AuthService().register(student(classId))),
            ).resolves.toEqual(classNotFound);
        });

        it("rejects a class deleted after the check and rolls back the user", async () => {
            const classId = await insertClass();
            skipCheck("assertCurrentClass");
            await db.delete(classesTable).where(eq(classesTable.id, classId));

            await expect(
                rejectionOf(new AuthService().register(student(classId))),
            ).resolves.toEqual(classNotFound);
            await expect(allUsers()).resolves.toHaveLength(0);
        });
    });
});
