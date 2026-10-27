import { Logger } from "@nestjs/common";

import { currentSchoolYear } from "@school-journal/shared";

import { isProduction } from "../config/env.js";
import { db, pool } from "./index.js";
import { classesTable, CreateClass } from "./schemas/class.schemas.js";

// A standalone script, outside the Nest app and its pino logger
const logger = new Logger("Seed");

// Sample classes for development: levels 1–11, two classes each ("1-A" … "11-B")
const SAMPLE_CLASS_LEVELS = 11;
const SAMPLE_CLASS_LETTERS = ["A", "B"];

// Idempotent: classes whose name already exists for the school year are skipped
const seedSampleClasses = async () => {
    const year = currentSchoolYear();
    const classes: CreateClass[] = Array.from(
        { length: SAMPLE_CLASS_LEVELS },
        (_, index) => index + 1,
    ).flatMap((level) =>
        SAMPLE_CLASS_LETTERS.map((letter) => ({ name: `${level}-${letter}`, level, year })),
    );

    const inserted = await db
        .insert(classesTable)
        .values(classes)
        .onConflictDoNothing()
        .returning({ id: classesTable.id });

    logger.log(
        `Sample classes for ${year}: ${inserted.length} created, ${classes.length - inserted.length} already existed`,
    );
};

// Sample data is opt-in (`pnpm db:seed --samples`), so a plain run against a production
// DATABASE_URL never adds it, even when NODE_ENV is left at its development default
const withSamples = process.argv.includes("--samples");

const seed = async () => {
    if (!withSamples) {
        return;
    }

    // Real classes are created by the admin in production
    if (isProduction) {
        logger.warn("Sample classes skipped in production");
        return;
    }

    await seedSampleClasses();
};

try {
    await seed();
} finally {
    await pool.end();
}
