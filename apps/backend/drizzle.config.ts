import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

if (!url) {
    throw new Error("DATABASE_URL is not set (see apps/backend/.env.example)");
}

// Columns are named explicitly in the schemas (snake_case), so no casing option here
export default defineConfig({
    dialect: "postgresql",
    schema: "./src/db/schemas/*.schemas.ts",
    out: "./drizzle",
    dbCredentials: { url },
});
