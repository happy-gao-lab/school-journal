import { sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";

import {
    EMAIL_MAX_LENGTH,
    PERSON_NAME_MAX_LENGTH,
    PHONE_MAX_LENGTH,
    ROLES,
    USER_STATUSES,
    USERNAME_MAX_LENGTH,
    UserStatus,
} from "@school-journal/shared";

import { timestamps, timestamptz } from "./columns.js";

// Exported so services can tell which unique index a 23505 violation came from
export const USERNAME_UNIQUE_INDEX = "users_username_lower_unique";
export const EMAIL_UNIQUE_INDEX = "users_email_lower_unique";

export const roleEnum = pgEnum("role", ROLES);
export const userStatusEnum = pgEnum("user_status", USER_STATUSES);

// One table for all roles; role-dependent rules (required email / phone / class) live in zod and services
export const usersTable = pgTable(
    "users",
    {
        id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
        username: varchar("username", { length: USERNAME_MAX_LENGTH }).notNull(),
        passwordHash: varchar("password_hash", { length: 255 }).notNull(),
        email: varchar("email", { length: EMAIL_MAX_LENGTH }),
        phone: varchar("phone", { length: PHONE_MAX_LENGTH }),
        firstName: varchar("first_name", { length: PERSON_NAME_MAX_LENGTH }).notNull(),
        lastName: varchar("last_name", { length: PERSON_NAME_MAX_LENGTH }).notNull(),
        middleName: varchar("middle_name", { length: PERSON_NAME_MAX_LENGTH }),
        role: roleEnum("role").notNull(),
        status: userStatusEnum("status").notNull().default(UserStatus.Pending),
        rejectionReason: text("rejection_reason"),
        // starts the retention timer after which a rejected user is deleted
        rejectedAt: timestamptz("rejected_at"),
        failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
        lockedUntil: timestamptz("locked_until"),
        ...timestamps,
    },
    (table) => [
        // case-insensitive uniqueness: "Ivan" and "ivan" conflict; several NULL emails are allowed
        uniqueIndex(USERNAME_UNIQUE_INDEX).on(sql`lower(${table.username})`),
        uniqueIndex(EMAIL_UNIQUE_INDEX).on(sql`lower(${table.email})`),
        index("users_role_status_idx").on(table.role, table.status),
        // rejected_at is set exactly for rejected users, so the cleanup job never misses one
        check(
            "users_rejected_at_status_check",
            sql`(${table.status} = ${sql.raw(`'${UserStatus.Rejected}'`)}) = (${table.rejectedAt} IS NOT NULL)`,
        ),
    ],
);

export type UsersTable = typeof usersTable.$inferSelect;
export type CreateUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<CreateUser>;
