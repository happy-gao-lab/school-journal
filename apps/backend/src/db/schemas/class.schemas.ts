import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, smallint, unique, varchar } from "drizzle-orm/pg-core";

import { CLASS_LEVEL_MAX, CLASS_LEVEL_MIN, CLASS_NAME_MAX_LENGTH } from "@school-journal/shared";

import { timestamps } from "./columns.js";
import { usersTable } from "./user.schemas.js";

export const classesTable = pgTable(
    "classes",
    {
        id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
        name: varchar("name", { length: CLASS_NAME_MAX_LENGTH }).notNull(), // e.g. "7-A"
        // school level, orders classes whatever their names: 1 for "1-A", 0 for "K-1" / "Reception"
        level: smallint("level").notNull(),
        year: integer("year").notNull(), // school year start, e.g. 2026
        ...timestamps,
    },
    (table) => [
        unique("classes_name_year_unique").on(table.name, table.year),
        check(
            "classes_level_check",
            sql`${table.level} BETWEEN ${sql.raw(String(CLASS_LEVEL_MIN))} AND ${sql.raw(String(CLASS_LEVEL_MAX))}`,
        ),
    ],
);

export type ClassesTable = typeof classesTable.$inferSelect;
export type CreateClass = typeof classesTable.$inferInsert;
export type UpdateClass = Partial<CreateClass>;

// Current class of each student (one class per student)
export const studentClassesTable = pgTable(
    "student_classes",
    {
        studentId: integer("student_id")
            .primaryKey()
            .references(() => usersTable.id, { onDelete: "cascade" }),
        // restrict: a class that still has students can't be deleted
        classId: integer("class_id")
            .notNull()
            .references(() => classesTable.id, { onDelete: "restrict" }),
        ...timestamps,
    },
    // for students-per-class lookups and the RESTRICT check when a class is deleted
    (table) => [index("student_classes_class_id_idx").on(table.classId)],
);

export type StudentClassesTable = typeof studentClassesTable.$inferSelect;
export type CreateStudentClass = typeof studentClassesTable.$inferInsert;
export type UpdateStudentClass = Partial<CreateStudentClass>;
