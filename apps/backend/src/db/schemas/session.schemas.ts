import { index, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns.js";
import { usersTable } from "./user.schemas.js";

// One row per sign-in
export const sessionsTable = pgTable(
    "sessions",
    {
        id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
        userId: integer("user_id")
            .notNull()
            .references(() => usersTable.id, { onDelete: "cascade" }),
        // id of the refresh token that is currently valid for this session
        tokenId: uuid("token_id").notNull(),
        expiresAt: timestamptz("expires_at").notNull(),
        revokedAt: timestamptz("revoked_at"),
        createdAt: timestamptz("created_at").notNull().defaultNow(),
    },
    (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export type SessionsTable = typeof sessionsTable.$inferSelect;
export type CreateSession = typeof sessionsTable.$inferInsert;
export type UpdateSession = Partial<CreateSession>;
