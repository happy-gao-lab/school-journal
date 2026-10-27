import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { classesTable } from "../../db/schemas/class.schemas.js";
import { createTestDb, type TestDb } from "../../db/tests/test-db.js";
import { ClassesService } from "../classes.service.js";

// The service reads the db module at call time, so it gets the in-memory database created below
const holder = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("../../db/index.js", () => ({
    get db() {
        return holder.db;
    },
}));

let client: PGlite;
let db: TestDb;

const insertClass = (name: string, level: number, year = 2026) =>
    db.insert(classesTable).values({ name, level, year });

// Only Date is faked: PGlite needs real timers
const setToday = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
};

beforeAll(async () => {
    ({ client, db } = await createTestDb());
    holder.db = db;
});

afterAll(async () => {
    await client.close();
});

beforeEach(async () => {
    await db.execute(sql`truncate classes restart identity cascade`);
    setToday("2026-10-15T12:00:00Z");
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ClassesService.findPublic", () => {
    it("returns the current school year's classes as { id, name } only", async () => {
        await insertClass("7-A", 7);

        await expect(new ClassesService().findPublic()).resolves.toEqual([{ id: 1, name: "7-A" }]);
    });

    it("sorts by level, then by name with numbers compared as numbers", async () => {
        await insertClass("10-A", 10);
        await insertClass("2-A", 2);
        await insertClass("K-10", 0);
        await insertClass("K-2", 0);
        await insertClass("1-B", 1);
        await insertClass("1-A", 1);

        const classes = await new ClassesService().findPublic();

        expect(classes.map((schoolClass) => schoolClass.name)).toEqual([
            "K-2",
            "K-10",
            "1-A",
            "1-B",
            "2-A",
            "10-A",
        ]);
    });

    it("leaves out classes of the previous and next school years", async () => {
        await insertClass("7-A", 7, 2025);
        await insertClass("7-B", 7, 2026);
        await insertClass("7-C", 7, 2027);

        const classes = await new ClassesService().findPublic();

        expect(classes.map((schoolClass) => schoolClass.name)).toEqual(["7-B"]);
    });

    it("still returns the previous school year's classes in August", async () => {
        setToday("2027-08-15T12:00:00Z");
        await insertClass("7-A", 7, 2026);
        await insertClass("8-A", 8, 2027);

        const classes = await new ClassesService().findPublic();

        expect(classes.map((schoolClass) => schoolClass.name)).toEqual(["7-A"]);
    });

    it("returns an empty list when the school year has no classes", async () => {
        await insertClass("7-A", 7, 2025);

        await expect(new ClassesService().findPublic()).resolves.toEqual([]);
    });
});
