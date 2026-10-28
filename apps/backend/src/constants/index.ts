export const API_PREFIX = "api";

export const DOCS_PATH = "docs";

// Fail fast instead of hanging when the database can't be reached
export const DB_CONNECTION_TIMEOUT = 5_000;

export const globalThrottler = {
    LIMIT: 100,
    TTL: 60_000,
};

// Stricter limits for auth routes, applied with @Throttle() over the global one
export const authThrottler = {
    // a whole class can register from one school network (shared IP)
    REGISTER_LIMIT: 30,
    REGISTER_TTL: 60 * 60_000,
    // a classroom can sign in from one school network; the per-account lockout stops brute force
    LOGIN_LIMIT: 20,
    LOGIN_TTL: 15 * 60_000,
};

// Failed-attempt lockout: the last allowed wrong password locks the account
export const loginLockout = {
    MAX_FAILED_ATTEMPTS: 5,
    DURATION_MINUTES: 15,
};

export const tokenTtl = {
    ACCESS_SECONDS: 15 * 60,
    // also the lifetime of the session
    REFRESH_SECONDS: 30 * 24 * 60 * 60,
};

// Signing in on one more device signs out the oldest one
export const MAX_ACTIVE_SESSIONS_PER_USER = 10;

// Daily cleanup job: at night, in the schools' time zone
export const cleanupJob = {
    NAME: "cleanup",
    CRON: "0 3 * * *",
    TIME_ZONE: "Europe/Kyiv",
};

// Expired / revoked sessions are kept this long (for debugging), then the cleanup job deletes them
export const SESSION_RETENTION_DAYS = 7;

// Only sent to the auth routes, where refresh and logout read it
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const REFRESH_TOKEN_COOKIE_PATH = `/${API_PREFIX}/auth`;

export const BCRYPT_SALT_ROUNDS = 12;
