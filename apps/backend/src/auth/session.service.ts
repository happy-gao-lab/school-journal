import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { MAX_ACTIVE_SESSIONS_PER_USER, tokenTtl } from "../constants/index.js";
import { db } from "../db/index.js";
import { sessionsTable } from "../db/schemas/session.schemas.js";
import { usersTable } from "../db/schemas/user.schemas.js";

@Injectable()
export class SessionService {
    // One session per sign-in; over the cap, the oldest active sessions are revoked
    async create(userId: number) {
        const tokenId = randomUUID();
        // whole seconds, like the refresh token's `exp`, so both expire at the same moment
        const expiresAtSeconds = Math.floor(Date.now() / 1000) + tokenTtl.REFRESH_SECONDS;
        const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();

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
                .where(
                    and(
                        eq(sessionsTable.userId, userId),
                        isNull(sessionsTable.revokedAt),
                        gt(sessionsTable.expiresAt, sql`now()`),
                    ),
                )
                .orderBy(desc(sessionsTable.createdAt), desc(sessionsTable.id))
                .offset(MAX_ACTIVE_SESSIONS_PER_USER);

            await tx
                .update(sessionsTable)
                .set({ revokedAt: sql`now()` })
                .where(inArray(sessionsTable.id, overCap));

            return { id: session.id, tokenId, expiresAt };
        });
    }
}
