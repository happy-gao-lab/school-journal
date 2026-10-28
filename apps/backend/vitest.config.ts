import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/tests/*.spec.ts"],
        // Only satisfies env validation for modules that import it; the DB is mocked or in-memory
        env: {
            DATABASE_URL: "postgresql://user:password@db.test/journal",
            JWT_ACCESS_SECRET: "test-access-secret-at-least-32-chars",
            JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars",
        },
    },
});
