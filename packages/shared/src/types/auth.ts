import type { UserStatus } from "../enums/user-status.js";

// Response of POST /auth/register: no tokens, the account waits for admin approval
export type RegisterResponse = {
    status: typeof UserStatus.Pending;
    message: string;
};
