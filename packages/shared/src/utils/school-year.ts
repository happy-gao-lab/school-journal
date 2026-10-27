import { SCHOOL_YEAR_START_MONTH } from "../constants/classes.js";

// Start year of the school year that `date` falls in: October 2026 → 2026, March 2027 → 2026.
// Counted in UTC, so the backend and every browser agree whatever their time zone
export const currentSchoolYear = (date = new Date()) => {
    const year = date.getUTCFullYear();

    return date.getUTCMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? year : year - 1;
};
