import { describe, expect, it } from "vitest";

import { DB_ID_MAX } from "../constants/db.js";
import {
    EMAIL_MAX_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PHONE_MAX_LENGTH,
    PHONE_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
} from "../constants/users.js";
import { Role } from "../enums/role.js";
import { loginSchema, registerSchema } from "./auth.js";

const common = {
    username: "ivan.p",
    password: "Secret12",
    firstName: "Ivan",
    lastName: "Petrenko",
};

const teacher = { ...common, role: Role.Teacher, email: "ivan@school.com", phone: "+380671234567" };
const parent = { ...teacher, role: Role.Parent };
const student = { ...common, role: Role.Student, classId: 1 };

// "+" and digits up to the given total length
const phoneOfLength = (length: number) => `+${"1".repeat(length - 1)}`;

// Uppercase, lowercase and digit first, so only the length decides
const passwordOfLength = (length: number) => `Aa1${"x".repeat(length - 3)}`;

const parse = (input: object) => registerSchema.safeParse(input);

// Field → messages of the failed parse
const issuesOf = (input: object) => {
    const result = parse(input);

    if (result.success) {
        throw new Error(`Expected ${JSON.stringify(input)} to fail validation`);
    }

    return result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
    }));
};

// Each failed field once, even when it broke several rules
const fieldsOf = (input: object) => [...new Set(issuesOf(input).map((issue) => issue.field))];

const dataOf = (input: object) => {
    const result = parse(input);

    if (!result.success) {
        throw new Error(`Expected valid input, got ${JSON.stringify(result.error.issues)}`);
    }

    return result.data;
};

describe("registerSchema", () => {
    describe("roles", () => {
        it("accepts a teacher, a parent and a student", () => {
            for (const input of [teacher, parent, student]) {
                expect(parse(input).success).toBe(true);
            }
        });

        it("rejects admin and unknown roles", () => {
            expect(fieldsOf({ ...teacher, role: Role.Admin })).toEqual(["role"]);
            expect(fieldsOf({ ...teacher, role: "principal" })).toEqual(["role"]);
        });

        it("strips unknown fields, so a client can't set its own status or id", () => {
            const data = dataOf({ ...teacher, status: "approved", id: 1 });

            expect(data).not.toHaveProperty("status");
            expect(data).not.toHaveProperty("id");
        });
    });

    describe("teacher and parent contacts", () => {
        it.each([Role.Teacher, Role.Parent])("%s needs an email and a phone", (role) => {
            const { email: _email, phone: _phone, ...withoutContacts } = { ...teacher, role };

            expect(fieldsOf(withoutContacts)).toEqual(["email", "phone"]);
            expect(fieldsOf({ ...teacher, role, email: "" })).toEqual(["email"]);
            expect(fieldsOf({ ...teacher, role, phone: null })).toEqual(["phone"]);
        });
    });

    describe("student", () => {
        it("doesn't need an email or a phone", () => {
            expect(dataOf(student)).toEqual(student);
        });

        it.each(["", "   ", null])(
            "treats %j email, phone and middle name as not given",
            (value) => {
                const data = dataOf({ ...student, email: value, phone: value, middleName: value });

                expect(data).toEqual(student);
            },
        );

        it("checks an email or phone that is given", () => {
            expect(fieldsOf({ ...student, email: "not-an-email", phone: "123" })).toEqual([
                "email",
                "phone",
            ]);
        });

        it("needs a class id that is a positive integer", () => {
            const { classId: _classId, ...withoutClass } = student;

            expect(fieldsOf(withoutClass)).toEqual(["classId"]);

            for (const classId of [0, -1, 1.5, "1"]) {
                expect(fieldsOf({ ...student, classId })).toEqual(["classId"]);
            }
        });

        it("limits the class id to what the database integer column holds", () => {
            expect(parse({ ...student, classId: DB_ID_MAX }).success).toBe(true);
            expect(fieldsOf({ ...student, classId: DB_ID_MAX + 1 })).toEqual(["classId"]);
        });
    });

    describe("normalising", () => {
        it("trims the username and names, and trims and lowercases the email", () => {
            const data = dataOf({
                ...teacher,
                username: "  Ivan.P  ",
                firstName: " Ivan ",
                lastName: " Petrenko ",
                middleName: " Olehovych ",
                email: "  Ivan@School.COM ",
                phone: " +380671234567 ",
            });

            expect(data).toMatchObject({
                username: "Ivan.P",
                firstName: "Ivan",
                lastName: "Petrenko",
                middleName: "Olehovych",
                email: "ivan@school.com",
                phone: "+380671234567",
            });
        });

        it("keeps spaces around the password", () => {
            expect(dataOf({ ...teacher, password: " Secret12 " }).password).toBe(" Secret12 ");
        });

        it("rejects blank first and last names", () => {
            expect(fieldsOf({ ...teacher, firstName: "  ", lastName: "" })).toEqual([
                "firstName",
                "lastName",
            ]);
        });

        it("allows English and Ukrainian names with spaces, hyphens, apostrophes and dots", () => {
            const names = [
                "Ivan",
                "\u0406\u0433\u043e\u0440", // "Ihor" in Ukrainian
                "\u0490\u0430\u043d\u043d\u0430", // starts with the Ukrainian letter U+0490
                "\u0407\u0436\u0430\u043a\u0435\u0432\u0438\u0447", // starts with U+0407
                "\u0404\u0432\u0433\u0435\u043d", // starts with U+0404
                "\u041c\u0430\u0440\u02bc\u044f\u043d\u0430", // Ukrainian apostrophe U+02BC
                "\u041c\u0430\u0440'\u044f\u043d\u0430", // typed with the ASCII apostrophe
                "D\u2019Angelo", // typographic apostrophe
                "O'Neil",
                "Jean-Luc",
                "Anne Marie",
                "St. John",
            ];

            for (const name of names) {
                expect(dataOf({ ...teacher, firstName: name }).firstName).toBe(name);
            }
        });

        it("stores a letter typed as base + mark like the single letter", () => {
            // U+0406 + combining diaeresis U+0308 → U+0407
            expect(
                dataOf({ ...teacher, firstName: "\u0406\u0308\u0436\u0430\u043a" }).firstName,
            ).toBe("\u0407\u0436\u0430\u043a");
        });

        it("rejects other alphabets, digits, symbols, emoji and invisible or control characters", () => {
            const names = [
                "\u042d\u043c\u043c\u0430", // Russian-only letter U+042D
                "\u0424\u0451\u0434\u043e\u0440", // Russian-only letter U+0451
                "M\u00fcller", // German umlaut
                "\u674e", // CJK
                "Ivan2",
                "Ivan!",
                "Ivan \u{1F600}", // emoji
                "Iv\u0000an", // NUL: Postgres can't store it
                "Iv\nan",
                "Iv\u200Ban", // zero-width space
            ];

            for (const name of names) {
                // a name with no supported letter at all also fails the letter rule
                expect(issuesOf({ ...teacher, firstName: name })).toContainEqual({
                    field: "firstName",
                    message:
                        "Only English or Ukrainian letters, spaces, hyphens, apostrophes and dots",
                });
            }
        });

        it("needs at least one letter in a name", () => {
            for (const name of ["-", "'", ". -"]) {
                expect(issuesOf({ ...teacher, firstName: name })).toEqual([
                    { field: "firstName", message: "Must contain a letter" },
                ]);
            }

            expect(fieldsOf({ ...student, middleName: "-" })).toEqual(["middleName"]);
        });
    });

    describe("username", () => {
        it("accepts the min and max length and rejects one character outside", () => {
            expect(parse({ ...teacher, username: "a".repeat(USERNAME_MIN_LENGTH) }).success).toBe(
                true,
            );
            expect(parse({ ...teacher, username: "a".repeat(USERNAME_MAX_LENGTH) }).success).toBe(
                true,
            );
            expect(fieldsOf({ ...teacher, username: "a".repeat(USERNAME_MIN_LENGTH - 1) })).toEqual(
                ["username"],
            );
            expect(fieldsOf({ ...teacher, username: "a".repeat(USERNAME_MAX_LENGTH + 1) })).toEqual(
                ["username"],
            );
        });

        it("counts the length after trimming", () => {
            expect(fieldsOf({ ...teacher, username: "  ab  " })).toEqual(["username"]);
        });

        it("allows Latin letters, digits, dot, underscore and hyphen only", () => {
            expect(parse({ ...teacher, username: "Ivan_P-2.0" }).success).toBe(true);

            for (const username of ["ivan p", "ivan@p", "\u0456\u0432\u0430\u043d"]) {
                expect(fieldsOf({ ...teacher, username })).toEqual(["username"]);
            }
        });

        it("needs at least one letter or digit", () => {
            expect(parse({ ...teacher, username: "a.." }).success).toBe(true);
            expect(parse({ ...teacher, username: "_7_" }).success).toBe(true);

            for (const username of ["...", "-_-"]) {
                expect(issuesOf({ ...teacher, username })).toEqual([
                    { field: "username", message: "Must contain a letter or digit" },
                ]);
            }
        });
    });

    describe("password", () => {
        it("needs at least the min length", () => {
            expect(
                parse({ ...teacher, password: passwordOfLength(PASSWORD_MIN_LENGTH) }).success,
            ).toBe(true);
            expect(
                fieldsOf({ ...teacher, password: passwordOfLength(PASSWORD_MIN_LENGTH - 1) }),
            ).toEqual(["password"]);
        });

        it("needs an uppercase letter, a lowercase letter and a digit", () => {
            const messages = (password: string) =>
                issuesOf({ ...teacher, password }).map((issue) => issue.message);

            expect(messages("secret12")).toEqual(["Must contain an uppercase letter"]);
            expect(messages("SECRET12")).toEqual(["Must contain a lowercase letter"]);
            expect(messages("SecretPw")).toEqual(["Must contain a digit"]);
        });

        it("counts Ukrainian letters for the uppercase and lowercase rules", () => {
            // "Parol12" written in Ukrainian
            const password = "\u041f\u0430\u0440\u043e\u043b\u044c12";

            expect(dataOf({ ...teacher, password }).password).toBe(password);
            expect(fieldsOf({ ...teacher, password: password.toLowerCase() })).toEqual([
                "password",
            ]);
        });

        it("accepts the max length of latin characters and rejects one more", () => {
            expect(
                parse({ ...teacher, password: passwordOfLength(PASSWORD_MAX_LENGTH) }).success,
            ).toBe(true);
            expect(
                fieldsOf({ ...teacher, password: passwordOfLength(PASSWORD_MAX_LENGTH + 1) }),
            ).toEqual(["password"]);
        });

        it("limits bytes, not characters, since bcrypt reads only the first bytes", () => {
            // a Ukrainian letter takes 2 bytes: 3 + 1 + 34 * 2 = 72 bytes in 38 characters
            const atLimit = `Aa1b${"\u0457".repeat(34)}`;
            const overLimit = `${atLimit}\u0457`;

            expect(new TextEncoder().encode(atLimit)).toHaveLength(PASSWORD_MAX_LENGTH);
            expect(parse({ ...teacher, password: atLimit }).success).toBe(true);
            expect(issuesOf({ ...teacher, password: overLimit })).toEqual([
                { field: "password", message: `Too long: at most ${PASSWORD_MAX_LENGTH} bytes` },
            ]);
        });
    });

    describe("phone", () => {
        it("accepts the min and max length and rejects one character outside", () => {
            expect(parse({ ...teacher, phone: phoneOfLength(PHONE_MIN_LENGTH) }).success).toBe(
                true,
            );
            expect(parse({ ...teacher, phone: phoneOfLength(PHONE_MAX_LENGTH) }).success).toBe(
                true,
            );
            expect(fieldsOf({ ...teacher, phone: phoneOfLength(PHONE_MIN_LENGTH - 1) })).toEqual([
                "phone",
            ]);
            expect(fieldsOf({ ...teacher, phone: phoneOfLength(PHONE_MAX_LENGTH + 1) })).toEqual([
                "phone",
            ]);
        });

        it("allows only + followed by digits", () => {
            for (const phone of [
                "380671234567",
                "+380 67 123 45 67",
                "+38(067)1234567",
                "+380-67-1234567",
                "+38067123456a",
            ]) {
                expect(fieldsOf({ ...teacher, phone })).toEqual(["phone"]);
            }
        });
    });

    describe("email", () => {
        it("rejects an invalid email", () => {
            expect(fieldsOf({ ...teacher, email: "ivan@" })).toEqual(["email"]);
        });

        // A valid address of the given total length
        const emailOfLength = (length: number) => {
            const domain = "@school.com";

            return `${"a".repeat(length - domain.length)}${domain}`;
        };

        it("accepts the max length and rejects one character more", () => {
            const atLimit = emailOfLength(EMAIL_MAX_LENGTH);
            const overLimit = emailOfLength(EMAIL_MAX_LENGTH + 1);

            expect(atLimit).toHaveLength(EMAIL_MAX_LENGTH);
            expect(overLimit).toHaveLength(EMAIL_MAX_LENGTH + 1);
            expect(parse({ ...teacher, email: atLimit }).success).toBe(true);
            expect(fieldsOf({ ...teacher, email: overLimit })).toEqual(["email"]);
        });
    });
});

describe("loginSchema", () => {
    const login = { username: "ivan.p", password: "Secret12" };

    const loginDataOf = (input: object) => {
        const result = loginSchema.safeParse(input);

        if (!result.success) {
            throw new Error(`Expected valid input, got ${JSON.stringify(result.error.issues)}`);
        }

        return result.data;
    };

    // Each failed field once, even when it broke several rules
    const loginFieldsOf = (input: object) => {
        const result = loginSchema.safeParse(input);

        if (result.success) {
            throw new Error(`Expected ${JSON.stringify(input)} to fail validation`);
        }

        return [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    };

    it("trims the username and keeps spaces around the password", () => {
        expect(loginDataOf({ username: "  ivan.p  ", password: " Secret12 " })).toEqual({
            username: "ivan.p",
            password: " Secret12 ",
        });
    });

    it("doesn't apply the registration rules, so a rule change never locks anyone out", () => {
        expect(loginDataOf({ username: "ab", password: "x" })).toEqual({
            username: "ab",
            password: "x",
        });
    });

    it("rejects a missing, empty or blank username and a missing or empty password", () => {
        expect(loginFieldsOf({})).toEqual(["username", "password"]);
        expect(loginFieldsOf({ username: "", password: "" })).toEqual(["username", "password"]);
        expect(loginFieldsOf({ ...login, username: "   " })).toEqual(["username"]);
        expect(loginFieldsOf({ ...login, password: 12_345_678 })).toEqual(["password"]);
    });

    it("rejects a username longer than any registered one", () => {
        expect(
            loginSchema.safeParse({ ...login, username: "a".repeat(USERNAME_MAX_LENGTH) }).success,
        ).toBe(true);
        expect(loginFieldsOf({ ...login, username: "a".repeat(USERNAME_MAX_LENGTH + 1) })).toEqual([
            "username",
        ]);
    });

    it("limits the password to the bytes bcrypt reads", () => {
        // a Ukrainian letter takes 2 bytes: 36 * 2 = 72 bytes
        const atLimit = "\u0457".repeat(PASSWORD_MAX_LENGTH / 2);

        expect(
            loginSchema.safeParse({ ...login, password: "x".repeat(PASSWORD_MAX_LENGTH) }).success,
        ).toBe(true);
        expect(loginSchema.safeParse({ ...login, password: atLimit }).success).toBe(true);
        expect(loginFieldsOf({ ...login, password: "x".repeat(PASSWORD_MAX_LENGTH + 1) })).toEqual([
            "password",
        ]);
        expect(loginFieldsOf({ ...login, password: `${atLimit}x` })).toEqual(["password"]);
    });

    it("strips unknown fields", () => {
        expect(loginDataOf({ ...login, role: Role.Admin })).toEqual(login);
    });
});
