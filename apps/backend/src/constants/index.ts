export const API_PREFIX = "api";

export const DOCS_PATH = "docs";

// Fail fast instead of hanging when the database can't be reached
export const DB_CONNECTION_TIMEOUT = 5_000;

export const globalThrottler = {
    LIMIT: 100,
    TTL: 60_000,
};
