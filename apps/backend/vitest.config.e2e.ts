import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.e2e-spec.ts"],
        // The DB module is mocked in the e2e tests; this only satisfies env validation
        env: { DATABASE_URL: "postgresql://user:password@db.test/journal" },
    },
});
