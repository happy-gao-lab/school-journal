export const Role = {
    Admin: "admin",
    Teacher: "teacher",
    Student: "student",
    Parent: "parent",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

// Readonly tuple for `z.enum()` and Drizzle `pgEnum()`; order is the Postgres enum order.
export const ROLES = [Role.Admin, Role.Teacher, Role.Student, Role.Parent] as const;
