import { afterEach, describe, expect, it, vi } from "vitest";

import { currentSchoolYear } from "./school-year.js";

describe("currentSchoolYear", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("names the school year by the calendar year it starts in", () => {
        expect(currentSchoolYear(new Date("2026-10-15T12:00:00Z"))).toBe(2026);
        expect(currentSchoolYear(new Date("2027-01-15T12:00:00Z"))).toBe(2026);
    });

    it("switches to the new school year at the start of September (UTC)", () => {
        expect(currentSchoolYear(new Date("2026-08-31T23:59:59.999Z"))).toBe(2025);
        expect(currentSchoolYear(new Date("2026-09-01T00:00:00.000Z"))).toBe(2026);
    });

    it("uses the current date when none is given", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2027-03-10T12:00:00Z"));

        expect(currentSchoolYear()).toBe(2026);
    });
});
