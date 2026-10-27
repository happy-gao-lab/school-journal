import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

// timestamptz: stores an exact moment, so comparisons with now() don't depend on the server time zone
export const timestamptz = (name: string) =>
    timestamp(name, { mode: "string", withTimezone: true });

export const timestamps = {
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
        .notNull()
        .defaultNow()
        .$onUpdate(() => sql`now()`),
};
