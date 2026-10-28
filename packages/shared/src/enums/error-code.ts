// Machine-readable `code` in error responses, so the FE can show the right message
export const ErrorCode = {
    InvalidCredentials: "INVALID_CREDENTIALS",
    AccountLocked: "ACCOUNT_LOCKED",
    AccountPending: "ACCOUNT_PENDING",
    AccountRejected: "ACCOUNT_REJECTED",
    // any failed refresh: the FE signs the user out
    SessionExpired: "SESSION_EXPIRED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
