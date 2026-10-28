import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A local .env must not leak into the tests
vi.mock("dotenv/config", () => ({}));

const ENV_KEYS = [
    "NODE_ENV",
    "PORT",
    "CLIENT_URL",
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "LOG_LEVEL",
] as const;

const DATABASE_URL = "postgresql://user:password@db.test/journal";
const JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars";
const JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-chars";

type EnvInput = Partial<Record<(typeof ENV_KEYS)[number], string>>;

// env.ts validates on import, so each call loads a fresh copy of the module;
// DATABASE_URL and the JWT secrets are required, so they get valid values unless the test sets them
const loadEnv = async (values: EnvInput) => {
    const input: EnvInput = { DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ...values };

    for (const key of ENV_KEYS) {
        vi.stubEnv(key, input[key]);
    }

    vi.resetModules();

    return import("../env.js");
};

describe("env", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses the defaults when nothing is set", async () => {
        const { env } = await loadEnv({});

        expect(env).toEqual({
            NODE_ENV: "development",
            PORT: 4000,
            CLIENT_URL: "http://localhost:3000",
            DATABASE_URL,
            JWT_ACCESS_SECRET,
            JWT_REFRESH_SECRET,
        });
    });

    it("reads PORT as a number", async () => {
        const { env } = await loadEnv({ PORT: "5000" });

        expect(env.PORT).toBe(5000);
    });

    it.each(["abc", "0", "-1", "1.5", "65536"])("rejects PORT=%s", async (port) => {
        await expect(loadEnv({ PORT: port })).rejects.toThrow(/PORT/);
    });

    it.each([
        "http://localhost:3000/",
        "http://localhost:3000/app",
        "ftp://localhost:3000",
        "not-a-url",
    ])("rejects CLIENT_URL=%s", async (clientUrl) => {
        await expect(loadEnv({ CLIENT_URL: clientUrl })).rejects.toThrow(/CLIENT_URL/);
    });

    it("accepts an https origin as CLIENT_URL", async () => {
        const { env } = await loadEnv({ CLIENT_URL: "https://journal.test" });

        expect(env.CLIENT_URL).toBe("https://journal.test");
    });

    it("rejects a missing DATABASE_URL", async () => {
        await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
    });

    it.each(["mysql://user@db.test/journal", "https://db.test", "not-a-url"])(
        "rejects DATABASE_URL=%s",
        async (databaseUrl) => {
            await expect(loadEnv({ DATABASE_URL: databaseUrl })).rejects.toThrow(/DATABASE_URL/);
        },
    );

    it.each(["postgres://user@db.test/journal", "postgresql://user@db.test/journal"])(
        "accepts DATABASE_URL=%s",
        async (databaseUrl) => {
            const { env } = await loadEnv({ DATABASE_URL: databaseUrl });

            expect(env.DATABASE_URL).toBe(databaseUrl);
        },
    );

    it.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const)(
        "rejects a missing or too short %s and accepts 32 characters",
        async (key) => {
            const atMin = (key === "JWT_ACCESS_SECRET" ? "a" : "r").repeat(32);

            await expect(loadEnv({ [key]: undefined })).rejects.toThrow(new RegExp(key));
            await expect(loadEnv({ [key]: atMin.slice(1) })).rejects.toThrow(new RegExp(key));

            const { env } = await loadEnv({ [key]: atMin });
            expect(env[key]).toBe(atMin);
        },
    );

    it("rejects the same secret for access and refresh tokens", async () => {
        const secret = "s".repeat(32);

        await expect(
            loadEnv({ JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: secret }),
        ).rejects.toThrow(/JWT_REFRESH_SECRET/);
    });

    it("rejects an unknown NODE_ENV", async () => {
        await expect(loadEnv({ NODE_ENV: "staging" })).rejects.toThrow(/NODE_ENV/);
    });

    it.each([
        ["production", true],
        ["development", false],
        ["test", false],
    ])("isProduction is %s → %s", async (nodeEnv, expected) => {
        const { isProduction } = await loadEnv({ NODE_ENV: nodeEnv });

        expect(isProduction).toBe(expected);
    });

    it.each([
        ["production", "info"],
        ["test", "silent"],
        ["development", "debug"],
    ])("logLevel defaults to %s → %s", async (nodeEnv, expected) => {
        const { logLevel } = await loadEnv({ NODE_ENV: nodeEnv });

        expect(logLevel).toBe(expected);
    });

    it("LOG_LEVEL overrides the default log level", async () => {
        const { logLevel } = await loadEnv({ NODE_ENV: "test", LOG_LEVEL: "debug" });

        expect(logLevel).toBe("debug");
    });

    it("rejects an unknown LOG_LEVEL", async () => {
        await expect(loadEnv({ LOG_LEVEL: "verbose" })).rejects.toThrow(/LOG_LEVEL/);
    });
});
