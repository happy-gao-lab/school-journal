import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";

import type { Role } from "@school-journal/shared";

import { env } from "../config/env.js";
import { tokenTtl } from "../constants/index.js";

// `sub` is the user id as a string, as the JWT spec requires
export type AccessTokenPayload = {
    sub: string;
    role: Role;
    sessionId: number;
};

// `jti` is the session's token_id: only the latest refresh token of a session is valid
export type RefreshTokenPayload = {
    sub: string;
    sessionId: number;
    jti: string;
};

// A valid signature only proves we signed it; the shape is checked too, so a uuid column is
// never compared with a non-uuid value
const refreshTokenPayloadSchema = z.object({
    sub: z.string(),
    sessionId: z.number().int(),
    jti: z.uuid(),
}) satisfies z.ZodType<RefreshTokenPayload>;

// Signs tokens and verifies refresh tokens; access tokens are verified by the auth guard (BE-1.7)
@Injectable()
export class TokenService {
    constructor(private readonly jwtService: JwtService) {}

    signAccessToken(payload: AccessTokenPayload) {
        return this.jwtService.signAsync(payload, {
            secret: env.JWT_ACCESS_SECRET,
            expiresIn: tokenTtl.ACCESS_SECONDS,
        });
    }

    // `exp` comes from the session, so the token and its session expire at the same moment
    signRefreshToken(payload: RefreshTokenPayload, expiresAt: string) {
        const exp = Math.floor(new Date(expiresAt).getTime() / 1000);

        return this.jwtService.signAsync({ ...payload, exp }, { secret: env.JWT_REFRESH_SECRET });
    }

    // undefined for a bad signature, an expired token or an unexpected payload
    async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | undefined> {
        try {
            const payload: unknown = await this.jwtService.verifyAsync(token, {
                secret: env.JWT_REFRESH_SECRET,
                algorithms: ["HS256"],
            });
            const parsed = refreshTokenPayloadSchema.safeParse(payload);

            return parsed.success ? parsed.data : undefined;
        } catch {
            return undefined;
        }
    }
}
