import type { UserStatus } from "../enums/user-status.js";

// Response of POST /auth/register: no tokens, the account waits for admin approval
export type RegisterResponse = {
    status: typeof UserStatus.Pending;
    message: string;
};

// Response of POST /auth/login and POST /auth/refresh; the refresh token is set as an httpOnly
// cookie, not returned here
export type LoginResponse = {
    accessToken: string;
};
