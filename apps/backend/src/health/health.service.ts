import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { errors } from "../constants/errors.js";
import { db } from "../db/index.js";

@Injectable()
export class HealthService {
    async check() {
        try {
            await db.execute(sql`select 1`);
        } catch (error) {
            throw new ServiceUnavailableException(errors.DATABASE_UNAVAILABLE, { cause: error });
        }

        return { status: "ok" };
    }
}
