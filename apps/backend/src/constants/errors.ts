import { messages } from "./messages.js";

export const errors = {
    SOMETHING_WENT_WRONG: "Something went wrong. Please, try again.",
    VALIDATION_FAILED: "Validation failed",
    DATABASE_UNAVAILABLE: "Database is unavailable. Please, try again later.",
    TOO_MANY_REQUESTS: "Too many requests. Please, try again later.",
    USERNAME_TAKEN: "This username is already taken",
    EMAIL_TAKEN: "This email is already registered",
    CLASS_NOT_FOUND: "Class not found in the current school year",
    INVALID_CREDENTIALS: "Wrong username or password",
    ACCOUNT_LOCKED: "Too many failed sign-in attempts. Please, try again later.",
    ACCOUNT_PENDING: messages.REGISTRATION_PENDING,
    ACCOUNT_REJECTED: "Your registration was rejected",
    SESSION_EXPIRED: "Your session has expired. Please, sign in again.",
} as const;
