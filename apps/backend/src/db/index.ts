import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { env } from "../config/env.js";
import { DB_CONNECTION_TIMEOUT } from "../constants/index.js";

// WebSocket pool (Node 24 has a global WebSocket): supports interactive transactions, unlike neon-http
export const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT,
});

export const db = drizzle({ client: pool });
