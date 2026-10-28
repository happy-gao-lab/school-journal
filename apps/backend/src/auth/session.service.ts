import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { UserStatus } from "@school-journal/shared";

import {
    MAX_ACTIVE_SESSIONS_PER_USER,
    SESSION_RETENTION_DAYS,
    tokenTtl,
} from "../constants/index.js";
import { db } from "../db/index.js";
import { sessionsTable } from "../db/schemas/session.schemas.js";
import { usersTable } from "../db/schemas/user.schemas.js";

// Whole seconds, like the refresh token's `exp`, so both expire at the same moment
const newExpiresAt = () => {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + tokenTtl.REFRESH_SECONDS;

    return new Date(expiresAtSeconds * 1000).toISOString();
};

const isActive = and(isNull(sessionsTable.revokedAt), gt(sessionsTable.expiresAt, sql`now()`));

@Injectable()
export class SessionService {
    // One session per sign-in; over the cap, the oldest active sessions are revoked
    async create(userId: number) {
        const tokenId = randomUUID();
        const expiresAt = newExpiresAt();

        return db.transaction(async (tx) => {
            // locks the user row, so concurrent sign-ins of one user count sessions one at a time
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, userId))
                .for("update");

            const [session] = await tx
                .insert(sessionsTable)
                .values({ userId, tokenId, expiresAt })
                .returning({ id: sessionsTable.id });

            if (!session) {
                throw new Error(`Insert into sessions returned no row for user ${userId}`);
            }

            // the new session is the newest, so it is always kept
            const overCap = tx
                .select({ id: sessionsTable.id })
                .from(sessionsTable)
                .where(and(eq(sessionsTable.userId, userId), isActive))
                .orderBy(desc(sessionsTable.createdAt), desc(sessionsTable.id))
                .offset(MAX_ACTIVE_SESSIONS_PER_USER);

            await tx
                .update(sessionsTable)
                .set({ revokedAt: sql`now()` })
                .where(inArray(sessionsTable.id, overCap));

            return { id: session.id, tokenId, expiresAt };
        });
    }

    // Gives an active session of an approved user a new token id and a new expiry (sliding);
    // matching on the current token id in one update means only one of two refreshes with the
    // same token can win. Returns undefined when nothing matched
    async rotate(sessionId: number, tokenId: string) {
        const newTokenId = randomUUID();
        const expiresAt = newExpiresAt();

        const [session] = await db
            .update(sessionsTable)
            .set({ tokenId: newTokenId, expiresAt })
            .from(usersTable)
            .where(
                and(
                    eq(sessionsTable.id, sessionId),
                    eq(sessionsTable.tokenId, tokenId),
                    isActive,
                    eq(usersTable.id, sessionsTable.userId),
                    eq(usersTable.status, UserStatus.Approved),
                ),
            )
            .returning({ userId: sessionsTable.userId, role: usersTable.role });

        return session && { ...session, id: sessionId, tokenId: newTokenId, expiresAt };
    }

    // Returns whether the session was active until now
    async revoke(sessionId: number) {
        const revoked = await db
            .update(sessionsTable)
            .set({ revokedAt: sql`now()` })
            .where(and(eq(sessionsTable.id, sessionId), isActive))
            .returning({ id: sessionsTable.id });

        return revoked.length > 0;
    }

    // Deletes sessions that expired or were revoked more than the retention period ago;
    // returns how many were deleted
    async deleteStale() {
        const cutoff = sql`now() - make_interval(days => ${SESSION_RETENTION_DAYS})`;

        const deleted = await db
            .delete(sessionsTable)
            .where(or(lt(sessionsTable.expiresAt, cutoff), lt(sessionsTable.revokedAt, cutoff)))
            .returning({ id: sessionsTable.id });

        return deleted.length;
    }
}
