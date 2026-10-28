import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Role, UserStatus } from "@school-journal/shared";

import { SESSION_RETENTION_DAYS } from "../../constants/index.js";
import { sessionsTable } from "../../db/schemas/session.schemas.js";
import { usersTable } from "../../db/schemas/user.schemas.js";
import { createTestDb, type TestDb } from "../../db/tests/test-db.js";
import { SessionService } from "../session.service.js";

// The service reads the db module at call time, so it gets the in-memory database created below
const holder = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("../../db/index.js", () => ({
    get db() {
        return holder.db;
    },
}));

let client: PGlite;
let db: TestDb;

// An hour on either side of the retention cutoff, measured from the database's now()
const pastRetention = sql`now() - make_interval(days => ${SESSION_RETENTION_DAYS}) - interval '1 hour'`;
const withinRetention = sql`now() - make_interval(days => ${SESSION_RETENTION_DAYS}) + interval '1 hour'`;
const inFuture = sql`now() + interval '1 day'`;

const insertUser = async () => {
    const [user] = await db
        .insert(usersTable)
        .values({
            username: "ivan.p",
            passwordHash: "hash",
            firstName: "Ivan",
            lastName: "Petrenko",
            role: Role.Teacher,
            status: UserStatus.Approved,
        })
        .returning({ id: usersTable.id });

    if (!user) {
        throw new Error("Test setup: insert into users returned no row");
    }

    return user.id;
};

const insertSession = async (userId: number, expiresAt: SQL, revokedAt: SQL | null = null) => {
    const [session] = await db
        .insert(sessionsTable)
        .values({ userId, tokenId: randomUUID(), expiresAt, revokedAt })
        .returning({ id: sessionsTable.id });

    if (!session) {
        throw new Error("Test setup: insert into sessions returned no row");
    }

    return session.id;
};

const remainingSessionIds = async () =>
    (await db.select({ id: sessionsTable.id }).from(sessionsTable).orderBy(sessionsTable.id)).map(
        (session) => session.id,
    );

beforeAll(async () => {
    ({ client, db } = await createTestDb());
    holder.db = db;
});

afterAll(async () => {
    await client.close();
});

beforeEach(async () => {
    await db.execute(sql`truncate users restart identity cascade`);
});

describe("SessionService.deleteStale", () => {
    it("deletes sessions expired or revoked more than the retention period ago and returns the count", async () => {
        const userId = await insertUser();
        await insertSession(userId, pastRetention);
        await insertSession(userId, inFuture, pastRetention);

        const deleted = await new SessionService().deleteStale();

        expect(deleted).toBe(2);
        expect(await remainingSessionIds()).toEqual([]);
    });

    it("keeps active sessions and sessions expired or revoked within the retention period", async () => {
        const userId = await insertUser();
        const kept = [
            await insertSession(userId, inFuture),
            await insertSession(userId, withinRetention),
            await insertSession(userId, inFuture, withinRetention),
        ];

        const deleted = await new SessionService().deleteStale();

        expect(deleted).toBe(0);
        expect(await remainingSessionIds()).toEqual(kept);
    });
});
