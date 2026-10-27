// Max length of a class name such as "7-A": DB column size and zod limit use the same value.
export const CLASS_NAME_MAX_LENGTH = 20;

// School level of a class (0 = kindergarten / reception … 13 = UK Year 13): orders classes
// whatever naming the school uses ("1-A", "K-1", "Year 7", "CP").
export const CLASS_LEVEL_MIN = 0;
export const CLASS_LEVEL_MAX = 13;

// Month (1–12) the school year starts in; the school year is named by the calendar year it starts.
export const SCHOOL_YEAR_START_MONTH = 9;
