import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle", import.meta.url));

// In-memory Postgres (PGlite) with the committed migrations applied: the same SQL that runs on Neon
export const createTestDb = async () => {
    const client = new PGlite();
    const db = drizzle({ client });

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    return { client, db };
};

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
