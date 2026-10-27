import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { currentSchoolYear, DEFAULT_LOCALE, PublicClass } from "@school-journal/shared";

import { db } from "../db/index.js";
import { classesTable } from "../db/schemas/class.schemas.js";

// Numeric-aware, so "7-A" comes before "10-A"; a fixed locale keeps the order independent of the server
const nameCollator = new Intl.Collator(DEFAULT_LOCALE, { numeric: true });

@Injectable()
export class ClassesService {
    async findPublic(): Promise<PublicClass[]> {
        const classes = await db
            .select({ id: classesTable.id, name: classesTable.name, level: classesTable.level })
            .from(classesTable)
            .where(eq(classesTable.year, currentSchoolYear()));

        return classes
            .toSorted(
                (left, right) =>
                    left.level - right.level || nameCollator.compare(left.name, right.name),
            )
            .map(({ id, name }) => ({ id, name }));
    }
}
