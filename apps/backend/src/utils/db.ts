import { DrizzleQueryError } from "drizzle-orm";

// Postgres error fields the driver puts on the cause of a failed query
export type PgError = {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
};

// Undefined for anything that isn't a failed Drizzle query
export const pgErrorOf = (error: unknown): PgError | undefined =>
    error instanceof DrizzleQueryError ? ((error.cause as PgError | undefined) ?? {}) : undefined;

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

// The query error's message and `params` carry the bound values (password hashes, emails, phones),
// and so does the cause's `detail` ("Key (email)=(…)"), so only the value-free fields are logged
export const loggableDbErrorOf = (error: DrizzleQueryError) => {
    const { code, constraint, message } = (error.cause as PgError | undefined) ?? {};

    return { query: error.query, code, constraint, message };
};
