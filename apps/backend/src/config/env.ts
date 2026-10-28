import "dotenv/config";

import { z } from "zod";

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
        PORT: z.coerce.number().int().positive().max(65535).default(4000),
        // Compared with the request `Origin` as an exact string, so no path or trailing slash
        CLIENT_URL: z
            .url({ protocol: /^https?$/ })
            .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
                error: "Must be an origin like http://localhost:3000 (no path or trailing slash)",
            })
            .default("http://localhost:3000"),
        // Direct (non-pooler) Neon connection string, also used by drizzle-kit migrations
        DATABASE_URL: z.url({
            protocol: /^postgres(ql)?$/,
            error: "Must be a postgres:// or postgresql:// connection string",
        }),
        // Separate secrets, so a leaked access secret can't forge refresh tokens
        JWT_ACCESS_SECRET: z.string().min(32),
        JWT_REFRESH_SECRET: z.string().min(32),
        // Overrides the level picked from NODE_ENV (production: info, test: silent, otherwise: debug)
        LOG_LEVEL: z
            .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
            .optional(),
    })
    .refine((values) => values.JWT_ACCESS_SECRET !== values.JWT_REFRESH_SECRET, {
        path: ["JWT_REFRESH_SECRET"],
        error: "Must differ from JWT_ACCESS_SECRET",
    });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";

const defaultLogLevels = { production: "info", test: "silent", development: "debug" } as const;

export const logLevel = env.LOG_LEVEL ?? defaultLogLevels[env.NODE_ENV];
