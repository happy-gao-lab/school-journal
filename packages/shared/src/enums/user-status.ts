export const UserStatus = {
    Pending: "pending",
    Approved: "approved",
    Rejected: "rejected",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// Readonly tuple for `z.enum()` and Drizzle `pgEnum()`; order is the Postgres enum order.
export const USER_STATUSES = [
    UserStatus.Pending,
    UserStatus.Approved,
    UserStatus.Rejected,
] as const;
