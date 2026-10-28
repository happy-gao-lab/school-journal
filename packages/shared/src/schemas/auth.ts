import { z } from "zod";

import { DB_ID_MAX } from "../constants/db.js";
import {
    EMAIL_MAX_LENGTH,
    PASSWORD_DIGIT_PATTERN,
    PASSWORD_LOWERCASE_PATTERN,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_UPPERCASE_PATTERN,
    PERSON_NAME_LETTER_PATTERN,
    PERSON_NAME_MAX_LENGTH,
    PERSON_NAME_PATTERN,
    PHONE_MAX_LENGTH,
    PHONE_MIN_LENGTH,
    PHONE_PATTERN,
    USERNAME_ALPHANUMERIC_PATTERN,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
    USERNAME_PATTERN,
} from "../constants/users.js";
import { Role } from "../enums/role.js";

const usernameSchema = z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .regex(USERNAME_PATTERN, "Only Latin letters, digits, dot, underscore and hyphen")
    .regex(USERNAME_ALPHANUMERIC_PATTERN, "Must contain a letter or digit");

// bcrypt counts bytes: non-Latin letters and emoji take 2–4 each
const withinPasswordBytes = <TSchema extends z.ZodString>(schema: TSchema) =>
    schema.refine(
        (password) => new TextEncoder().encode(password).length <= PASSWORD_MAX_LENGTH,
        `Too long: at most ${PASSWORD_MAX_LENGTH} bytes`,
    );

// Not trimmed: spaces are a valid part of a password
const passwordSchema = withinPasswordBytes(
    z
        .string()
        .min(PASSWORD_MIN_LENGTH)
        .max(PASSWORD_MAX_LENGTH)
        .regex(PASSWORD_UPPERCASE_PATTERN, "Must contain an uppercase letter")
        .regex(PASSWORD_LOWERCASE_PATTERN, "Must contain a lowercase letter")
        .regex(PASSWORD_DIGIT_PATTERN, "Must contain a digit"),
);

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(EMAIL_MAX_LENGTH));

const phoneSchema = z
    .string()
    .trim()
    .min(PHONE_MIN_LENGTH)
    .max(PHONE_MAX_LENGTH)
    .regex(PHONE_PATTERN, "Must be + followed by digits only, e.g. +380671234567");

// NFC: a letter typed as base + mark (e.g. "\u0456" + U+0308) is stored as the single letter ("\u0457")
const personNameSchema = z
    .string()
    .trim()
    .normalize("NFC")
    .min(1)
    .max(PERSON_NAME_MAX_LENGTH)
    .regex(
        PERSON_NAME_PATTERN,
        "Only English or Ukrainian letters, spaces, hyphens, apostrophes and dots",
    )
    .regex(PERSON_NAME_LETTER_PATTERN, "Must contain a letter");

// Optional text field: missing, null, blank or empty means "not given"
const optionalText = <TSchema extends z.ZodType<unknown, string>>(schema: TSchema) =>
    z
        .string()
        .trim()
        .nullish()
        .transform((value) => value || undefined)
        .pipe(schema.optional());

const commonFields = {
    username: usernameSchema,
    password: passwordSchema,
    firstName: personNameSchema,
    lastName: personNameSchema,
    middleName: optionalText(personNameSchema),
};

// Teachers and parents must be reachable, so email and phone are required
const teacherSchema = z.object({
    role: z.literal(Role.Teacher),
    ...commonFields,
    email: emailSchema,
    phone: phoneSchema,
});

const parentSchema = z.object({
    role: z.literal(Role.Parent),
    ...commonFields,
    email: emailSchema,
    phone: phoneSchema,
});

const studentSchema = z.object({
    role: z.literal(Role.Student),
    ...commonFields,
    email: optionalText(emailSchema),
    phone: optionalText(phoneSchema),
    classId: z.number().int().positive().max(DB_ID_MAX),
});

// POST /auth/register; admin can't self-register, so "admin" fails the role check
export const registerSchema = z.discriminatedUnion("role", [
    teacherSchema,
    studentSchema,
    parentSchema,
]);

export type RegisterInput = z.infer<typeof registerSchema>;

// POST /auth/login; registration rules aren't re-checked, so a rule change never locks anyone out
export const loginSchema = z.object({
    username: z.string().trim().min(1).max(USERNAME_MAX_LENGTH),
    password: withinPasswordBytes(z.string().min(1)),
});

export type LoginInput = z.infer<typeof loginSchema>;
