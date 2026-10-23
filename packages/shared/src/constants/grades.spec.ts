import { describe, expect, it } from "vitest";

import { GRADE_MAX, GRADE_MIN, STRONG_TOPIC_THRESHOLD, WEAK_TOPIC_THRESHOLD } from "./grades.js";

describe("grade constants", () => {
    it("keeps the thresholds inside the grade range and in order", () => {
        expect(GRADE_MIN).toBeLessThan(WEAK_TOPIC_THRESHOLD);
        expect(WEAK_TOPIC_THRESHOLD).toBeLessThan(STRONG_TOPIC_THRESHOLD);
        expect(STRONG_TOPIC_THRESHOLD).toBeLessThanOrEqual(GRADE_MAX);
    });

    it("uses whole numbers for the grade bounds", () => {
        expect(Number.isInteger(GRADE_MIN)).toBe(true);
        expect(Number.isInteger(GRADE_MAX)).toBe(true);
    });
});
