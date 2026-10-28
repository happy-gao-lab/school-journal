import { Controller, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import {
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiResponse,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { ErrorCode, loginSchema, registerSchema } from "@school-journal/shared";
import type { LoginInput, LoginResponse, RegisterInput } from "@school-journal/shared";

import { ZodBody } from "../common/decorators/zod.decorators.js";
import { isProduction } from "../config/env.js";
import {
    authThrottler,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE_PATH,
} from "../constants/index.js";
import { AuthService } from "./auth.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // A person registers once, so a few attempts per IP are enough and slow down spam
    @Throttle({
        default: { limit: authThrottler.REGISTER_LIMIT, ttl: authThrottler.REGISTER_TTL },
    })
    @Post("register")
    register(@ZodBody(registerSchema) data: RegisterInput) {
        return this.authService.register(data);
    }

    // The refresh token goes into an httpOnly cookie, out of reach of page scripts
    @Throttle({ default: { limit: authThrottler.LOGIN_LIMIT, ttl: authThrottler.LOGIN_TTL } })
    @ApiOkResponse({
        description: `{ accessToken }; the refresh token is set as the httpOnly "${REFRESH_TOKEN_COOKIE}" cookie`,
    })
    @ApiUnauthorizedResponse({ description: `code: ${ErrorCode.InvalidCredentials}` })
    @ApiForbiddenResponse({
        description: `code: ${ErrorCode.AccountPending} or ${ErrorCode.AccountRejected}`,
    })
    @ApiResponse({ status: HttpStatus.LOCKED, description: `code: ${ErrorCode.AccountLocked}` })
    @ApiTooManyRequestsResponse({ description: "Too many sign-in requests from this IP" })
    @HttpCode(HttpStatus.OK)
    @Post("login")
    async login(
        @ZodBody(loginSchema) data: LoginInput,
        @Res({ passthrough: true }) response: Response,
    ): Promise<LoginResponse> {
        const { accessToken, refreshToken, refreshExpiresAt } = await this.authService.login(data);

        response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: REFRESH_TOKEN_COOKIE_PATH,
            expires: new Date(refreshExpiresAt),
        });

        return { accessToken };
    }
}
