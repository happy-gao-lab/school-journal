// Largest value of a Postgres `integer` column, the type of every id; zod limits ids to it
// so an oversized id is a 400, not a database error.
export const DB_ID_MAX = 2_147_483_647;
