import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A local .env must not leak into the tests
vi.mock("dotenv/config", () => ({}));

const ENV_KEYS = ["NODE_ENV", "PORT", "CLIENT_URL", "LOG_LEVEL"] as const;

type EnvInput = Partial<Record<(typeof ENV_KEYS)[number], string>>;

// env.ts validates on import, so each call loads a fresh copy of the module
const loadEnv = async (values: EnvInput) => {
    for (const key of ENV_KEYS) {
        vi.stubEnv(key, values[key]);
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
        });
    });

    it("reads PORT as a number", async () => {
        const { env } = await loadEnv({ PORT: "5000" });

        expect(env.PORT).toBe(5000);
    });

    it.each(["abc", "0", "-1", "1.5"])("rejects PORT=%s", async (port) => {
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
