// Max lengths of user fields: DB column sizes and zod limits use the same values.
export const USERNAME_MAX_LENGTH = 32;
export const EMAIL_MAX_LENGTH = 255;
export const PHONE_MAX_LENGTH = 20;
// First, last and middle name.
export const PERSON_NAME_MAX_LENGTH = 100;

// Supported alphabets: English (A–Z) and Ukrainian (33 letters), written as escapes.
// Ukrainian uppercase: U+0410–U+0429, U+042C, U+042E, U+042F, plus U+0404, U+0406, U+0407, U+0490;
// lowercase is the matching set. The Russian-only U+042A, U+042B, U+042D and U+0401 are left out.
const UPPERCASE_LETTERS = "A-Z\\u0410-\\u0429\\u042C\\u042E\\u042F\\u0404\\u0406\\u0407\\u0490";
const LOWERCASE_LETTERS = "a-z\\u0430-\\u0449\\u044C\\u044E\\u044F\\u0454\\u0456\\u0457\\u0491";
const LETTERS = `${UPPERCASE_LETTERS}${LOWERCASE_LETTERS}`;
// Apostrophes in English and Ukrainian names: ', U+2019 (typographic) and U+02BC (the Ukrainian standard).
const APOSTROPHES = "'\\u2019\\u02BC";

export const USERNAME_MIN_LENGTH = 3;
// Latin letters, digits, dot, underscore and hyphen, with at least one letter or digit.
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const USERNAME_ALPHANUMERIC_PATTERN = /[a-zA-Z0-9]/;

// bcrypt only reads the first 72 bytes of a password, so longer ones are rejected.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
// Each pattern must match somewhere in the password.
// English or Ukrainian letters count for the uppercase and lowercase rules.
export const PASSWORD_UPPERCASE_PATTERN = new RegExp(`[${UPPERCASE_LETTERS}]`);
export const PASSWORD_LOWERCASE_PATTERN = new RegExp(`[${LOWERCASE_LETTERS}]`);
export const PASSWORD_DIGIT_PATTERN = /\d/;

// "+" then digits only, e.g. "+380671234567"; PHONE_MIN_LENGTH … PHONE_MAX_LENGTH characters in total.
export const PHONE_MIN_LENGTH = 7;
export const PHONE_PATTERN = /^\+\d+$/;

// Names: English or Ukrainian letters, spaces, hyphens, apostrophes and dots ("St. John"), with at
// least one letter. Digits, other alphabets, emoji and invisible or control characters are rejected.
export const PERSON_NAME_PATTERN = new RegExp(`^[${LETTERS} ${APOSTROPHES}.-]+$`);
export const PERSON_NAME_LETTER_PATTERN = new RegExp(`[${LETTERS}]`);
