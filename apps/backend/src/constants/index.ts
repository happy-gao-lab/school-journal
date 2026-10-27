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
};

export const BCRYPT_SALT_ROUNDS = 12;
