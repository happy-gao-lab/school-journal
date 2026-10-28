import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcrypt";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode, RegisterInput, Role, UserStatus } from "@school-journal/shared";

import { env } from "../../config/env.js";
import { errors } from "../../constants/errors.js";
import { loginLockout, MAX_ACTIVE_SESSIONS_PER_USER, tokenTtl } from "../../constants/index.js";
import { messages } from "../../constants/messages.js";
import { classesTable, studentClassesTable } from "../../db/schemas/class.schemas.js";
import { sessionsTable } from "../../db/schemas/session.schemas.js";
import { usersTable, type CreateUser } from "../../db/schemas/user.schemas.js";
import { createTestDb, type TestDb } from "../../db/tests/test-db.js";
import { AuthService } from "../auth.service.js";
import { SessionService } from "../session.service.js";
import type { AccessTokenPayload, RefreshTokenPayload } from "../token.service.js";
import { TokenService } from "../token.service.js";

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

const jwtService = new JwtService();

const createService = () => new AuthService(new TokenService(jwtService), new SessionService());

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

    throw new Error("Expected the call to be rejected");
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
            await expect(createService().register(teacher())).resolves.toEqual({
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
            await createService().register(teacher({ password: "Secret12" }));

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

            await createService().register(student(classId));

            const [user] = await allUsers();

            await expect(db.select().from(studentClassesTable)).resolves.toMatchObject([
                { studentId: user?.id, classId },
            ]);
        });

        it("lets several students register without an email", async () => {
            const classId = await insertClass();
            const service = createService();

            await service.register(student(classId, { username: "olena" }));
            await service.register(student(classId, { username: "petro" }));

            await expect(allUsers()).resolves.toHaveLength(2);
        });
    });

    describe("duplicates", () => {
        it("rejects a username that differs only by case", async () => {
            const service = createService();
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
            const service = createService();
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
            const service = createService();
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
                const service = createService();
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
            await expect(rejectionOf(createService().register(student(999)))).resolves.toEqual(
                classNotFound,
            );
            await expect(allUsers()).resolves.toHaveLength(0);
        });

        it("rejects a class of the previous school year", async () => {
            const classId = await insertClass(SCHOOL_YEAR - 1);

            await expect(rejectionOf(createService().register(student(classId)))).resolves.toEqual(
                classNotFound,
            );
        });

        it("rejects a class deleted after the check and rolls back the user", async () => {
            const classId = await insertClass();
            skipCheck("assertCurrentClass");
            await db.delete(classesTable).where(eq(classesTable.id, classId));

            await expect(rejectionOf(createService().register(student(classId)))).resolves.toEqual(
                classNotFound,
            );
            await expect(allUsers()).resolves.toHaveLength(0);
        });
    });
});

describe("AuthService.login", () => {
    const PASSWORD = "Secret12";

    // Inserted directly, so each test picks the status and lockout state it needs
    const insertUser = async (overrides: Partial<CreateUser> = {}) => {
        const [user] = await db
            .insert(usersTable)
            .values({
                username: "Ivan.P",
                passwordHash: await hash(PASSWORD, 4),
                firstName: "Ivan",
                lastName: "Petrenko",
                role: Role.Teacher,
                status: UserStatus.Approved,
                ...overrides,
            })
            .returning();

        if (!user) {
            throw new Error("Test setup: insert into users returned no row");
        }

        return user;
    };

    const userById = async (id: number) => {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));

        if (!user) {
            throw new Error(`Test setup: user ${id} not found`);
        }

        return user;
    };

    const sessionsOf = (userId: number) =>
        db
            .select()
            .from(sessionsTable)
            .where(eq(sessionsTable.userId, userId))
            .orderBy(sessionsTable.id);

    const activeSessionIdsOf = async (userId: number) =>
        (
            await db
                .select({ id: sessionsTable.id })
                .from(sessionsTable)
                .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)))
                .orderBy(sessionsTable.id)
        ).map((session) => session.id);

    const login = (username = "ivan.p", password = PASSWORD) =>
        createService().login({ username, password });

    const failLogins = async (count: number) => {
        for (let attempt = 0; attempt < count; attempt += 1) {
            await rejectionOf(login("ivan.p", "Wrong123"));
        }
    };

    const invalidCredentials = {
        type: UnauthorizedException,
        body: { message: errors.INVALID_CREDENTIALS, code: ErrorCode.InvalidCredentials },
    };

    const accountLocked = {
        type: HttpException,
        body: { message: errors.ACCOUNT_LOCKED, code: ErrorCode.AccountLocked },
    };

    // Seconds from the database's now() to the lock end
    const lockSecondsLeft = async (userId: number) => {
        const result = await db.execute<{ seconds: number }>(
            sql`select extract(epoch from ${usersTable.lockedUntil} - now())::float as seconds from ${usersTable} where ${usersTable.id} = ${userId}`,
        );
        const [row] = result.rows;

        if (!row) {
            throw new Error(`Test setup: user ${userId} not found`);
        }

        return row.seconds;
    };

    const expireLock = (userId: number) =>
        db
            .update(usersTable)
            .set({ lockedUntil: sql`now() - interval '1 minute'` })
            .where(eq(usersTable.id, userId));

    describe("signing in", () => {
        it("gives an approved user tokens tied to a new session", async () => {
            const user = await insertUser();

            const result = await login();

            const [session, ...others] = await sessionsOf(user.id);
            expect(others).toHaveLength(0);

            if (!session) {
                throw new Error("Expected a session row");
            }

            const refresh = await jwtService.verifyAsync<RefreshTokenPayload & { exp: number }>(
                result.refreshToken,
                { secret: env.JWT_REFRESH_SECRET },
            );

            expect(refresh).toMatchObject({
                sub: String(user.id),
                sessionId: session.id,
                jti: session.tokenId,
            });
            expect(session.revokedAt).toBeNull();
            // the token, the session and the cookie expire at the same moment
            expect(new Date(refresh.exp * 1000).toISOString()).toBe(result.refreshExpiresAt);
            expect(new Date(session.expiresAt).toISOString()).toBe(result.refreshExpiresAt);
        });

        it("puts the user, role and session into a 15-minute access token", async () => {
            const user = await insertUser();

            const { accessToken } = await login();

            const [session] = await sessionsOf(user.id);
            const access = await jwtService.verifyAsync<
                AccessTokenPayload & { iat: number; exp: number }
            >(accessToken, { secret: env.JWT_ACCESS_SECRET });

            expect(access).toMatchObject({
                sub: String(user.id),
                role: Role.Teacher,
                sessionId: session?.id,
            });
            expect(access.exp - access.iat).toBe(tokenTtl.ACCESS_SECONDS);
        });

        it("makes the refresh token last 30 days", async () => {
            await insertUser();

            const { refreshToken } = await login();

            const refresh = await jwtService.verifyAsync<{ exp: number }>(refreshToken, {
                secret: env.JWT_REFRESH_SECRET,
            });

            expect(refresh.exp - Math.floor(Date.now() / 1000)).toBe(tokenTtl.REFRESH_SECONDS);
        });

        it("signs each token with its own secret", async () => {
            await insertUser();

            const { accessToken, refreshToken } = await login();

            await expect(
                jwtService.verifyAsync(accessToken, { secret: env.JWT_REFRESH_SECRET }),
            ).rejects.toThrow();
            await expect(
                jwtService.verifyAsync(refreshToken, { secret: env.JWT_ACCESS_SECRET }),
            ).rejects.toThrow();
        });

        it("finds the username ignoring case", async () => {
            await insertUser({ username: "Ivan.P" });

            await expect(login("IVAN.p")).resolves.toHaveProperty("accessToken");
        });

        it("doesn't touch updated_at when there is nothing to reset", async () => {
            const user = await insertUser({ updatedAt: "2026-01-01T00:00:00Z" });

            await login();

            expect(new Date((await userById(user.id)).updatedAt).toISOString()).toBe(
                "2026-01-01T00:00:00.000Z",
            );
        });
    });

    describe("wrong credentials and statuses", () => {
        it("answers an unknown username like a wrong password and creates no session", async () => {
            const user = await insertUser();

            await expect(rejectionOf(login("nobody"))).resolves.toEqual(invalidCredentials);
            await expect(rejectionOf(login("ivan.p", "Wrong123"))).resolves.toEqual(
                invalidCredentials,
            );
            await expect(sessionsOf(user.id)).resolves.toHaveLength(0);
        });

        it("counts a wrong password", async () => {
            const user = await insertUser();

            await failLogins(1);

            expect((await userById(user.id)).failedLoginAttempts).toBe(1);
        });

        it.each([
            [UserStatus.Pending, ErrorCode.AccountPending, errors.ACCOUNT_PENDING],
            [UserStatus.Rejected, ErrorCode.AccountRejected, errors.ACCOUNT_REJECTED],
        ])("doesn't let a %s user in with the right password", async (status, code, message) => {
            const user = await insertUser({
                status,
                rejectedAt: status === UserStatus.Rejected ? new Date().toISOString() : null,
            });

            await expect(rejectionOf(login())).resolves.toEqual({
                type: ForbiddenException,
                body: { message, code },
            });
            await expect(sessionsOf(user.id)).resolves.toHaveLength(0);
        });

        it.each([UserStatus.Pending, UserStatus.Rejected])(
            "doesn't reveal the %s status to a wrong password",
            async (status) => {
                await insertUser({
                    status,
                    rejectedAt: status === UserStatus.Rejected ? new Date().toISOString() : null,
                });

                await expect(rejectionOf(login("ivan.p", "Wrong123"))).resolves.toEqual(
                    invalidCredentials,
                );
            },
        );
    });

    describe("lockout", () => {
        it("locks the account on the last allowed wrong password and starts the count over", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS - 1);

            const locking = await rejectionOf(login("ivan.p", "Wrong123"));

            expect(locking).toEqual(accountLocked);
            expect((await userById(user.id)).failedLoginAttempts).toBe(0);

            const secondsLeft = await lockSecondsLeft(user.id);
            expect(secondsLeft).toBeGreaterThan(loginLockout.DURATION_MINUTES * 60 - 60);
            expect(secondsLeft).toBeLessThanOrEqual(loginLockout.DURATION_MINUTES * 60);
        });

        it("answers 423 for a locked account even with the right password", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS);

            await expect(rejectionOf(login())).resolves.toEqual(accountLocked);
            await expect(sessionsOf(user.id)).resolves.toHaveLength(0);
        });

        it("uses the Locked status code", async () => {
            await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS);

            await expect(login()).rejects.toSatisfy(
                (error: unknown) =>
                    error instanceof HttpException && error.getStatus() === HttpStatus.LOCKED,
            );
        });

        it("doesn't move the lock or count wrong passwords during it", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS);
            const locked = await userById(user.id);

            await failLogins(3);

            const after = await userById(user.id);
            expect(after.lockedUntil).toBe(locked.lockedUntil);
            expect(after.failedLoginAttempts).toBe(0);
        });

        it("lets the right password in once the lock expires and clears it", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS);
            await expireLock(user.id);

            await expect(login()).resolves.toHaveProperty("accessToken");

            expect((await userById(user.id)).lockedUntil).toBeNull();
        });

        it("treats a wrong password after an expired lock as a plain failed attempt", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS);
            await expireLock(user.id);

            await expect(rejectionOf(login("ivan.p", "Wrong123"))).resolves.toEqual(
                invalidCredentials,
            );
            expect((await userById(user.id)).failedLoginAttempts).toBe(1);
        });

        it("resets the count after a successful sign-in", async () => {
            const user = await insertUser();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS - 1);

            await login();
            await failLogins(loginLockout.MAX_FAILED_ATTEMPTS - 1);

            const after = await userById(user.id);
            expect(after.failedLoginAttempts).toBe(loginLockout.MAX_FAILED_ATTEMPTS - 1);
            expect(after.lockedUntil).toBeNull();
        });
    });

    describe("active sessions cap", () => {
        const loginTimes = async (count: number) => {
            for (let attempt = 0; attempt < count; attempt += 1) {
                await login();
            }
        };

        it("revokes only the oldest active session on the sign-in over the cap", async () => {
            const user = await insertUser();
            await loginTimes(MAX_ACTIVE_SESSIONS_PER_USER);
            const [oldest, ...rest] = await activeSessionIdsOf(user.id);

            await login();

            const active = await activeSessionIdsOf(user.id);
            expect(active).toHaveLength(MAX_ACTIVE_SESSIONS_PER_USER);
            expect(active).not.toContain(oldest);
            expect(active.slice(0, rest.length)).toEqual(rest);
        });

        it("doesn't count expired or revoked sessions", async () => {
            const user = await insertUser();
            await db.insert(sessionsTable).values([
                {
                    userId: user.id,
                    tokenId: randomUUID(),
                    expiresAt: sql`now() - interval '1 day'`,
                },
                {
                    userId: user.id,
                    tokenId: randomUUID(),
                    expiresAt: sql`now() + interval '1 day'`,
                    revokedAt: sql`now()`,
                },
            ]);

            await loginTimes(MAX_ACTIVE_SESSIONS_PER_USER);

            const sessions = await sessionsOf(user.id);
            const fresh = sessions.slice(2);
            expect(fresh.every((session) => session.revokedAt === null)).toBe(true);
            expect(fresh).toHaveLength(MAX_ACTIVE_SESSIONS_PER_USER);
        });

        it("leaves other users' sessions alone", async () => {
            const user = await insertUser();
            const other = await insertUser({ username: "olena.k" });
            await login("olena.k");

            await loginTimes(MAX_ACTIVE_SESSIONS_PER_USER + 1);

            await expect(activeSessionIdsOf(other.id)).resolves.toHaveLength(1);
            await expect(activeSessionIdsOf(user.id)).resolves.toHaveLength(
                MAX_ACTIVE_SESSIONS_PER_USER,
            );
        });
    });
});
