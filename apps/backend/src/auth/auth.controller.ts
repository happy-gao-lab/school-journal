import {
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from "@nestjs/common";
import {
    ApiForbiddenResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiResponse,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";

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

// Same attributes when setting and clearing, or the browser keeps the old cookie
const refreshCookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: REFRESH_TOKEN_COOKIE_PATH,
};

const setRefreshCookie = (response: Response, token: string, expiresAt: string) => {
    response.cookie(REFRESH_TOKEN_COOKIE, token, {
        ...refreshCookieOptions,
        expires: new Date(expiresAt),
    });
};

const clearRefreshCookie = (response: Response) => {
    response.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);
};

const refreshCookieOf = (request: Request) => {
    const cookie: unknown = request.cookies?.[REFRESH_TOKEN_COOKIE];

    return typeof cookie === "string" ? cookie : undefined;
};

// The value of one `name=value` pair of the Cookie header if it is a non-empty refresh token
const refreshTokenOfPair = (pair: string) => {
    const separator = pair.indexOf("=");

    if (separator === -1 || pair.slice(0, separator).trim() !== REFRESH_TOKEN_COOKIE) {
        return [];
    }

    const value = pair.slice(separator + 1).trim();

    return value ? [value] : [];
};

// Every refresh token in the Cookie header, without repeats; cookie-parser keeps only the first
// one when the browser sends several cookies of the same name
const refreshCookiesOf = (request: Request) => [
    ...new Set((request.headers.cookie ?? "").split(";").flatMap(refreshTokenOfPair)),
];

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

        setRefreshCookie(response, refreshToken, refreshExpiresAt);

        return { accessToken };
    }

    // Reads only the cookie; a failed refresh clears it, so the browser stops sending a dead token
    @ApiOkResponse({
        description: `{ accessToken }; a new refresh token replaces the httpOnly "${REFRESH_TOKEN_COOKIE}" cookie`,
    })
    @ApiUnauthorizedResponse({
        description: `code: ${ErrorCode.SessionExpired}; the cookie is cleared`,
    })
    @ApiTooManyRequestsResponse({ description: "Too many requests from this IP" })
    @HttpCode(HttpStatus.OK)
    @Post("refresh")
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<LoginResponse> {
        try {
            const { accessToken, refreshToken, refreshExpiresAt } = await this.authService.refresh(
                refreshCookieOf(request),
            );

            setRefreshCookie(response, refreshToken, refreshExpiresAt);

            return { accessToken };
        } catch (error) {
            // other errors (e.g. the database is down) leave the cookie for a retry
            if (error instanceof UnauthorizedException) {
                clearRefreshCookie(response);
            }

            throw error;
        }
    }

    // Found by the refresh cookie, not the access token, so it works after the access token expired;
    // a missing or dead token, or a failed revoke, is still a success: the user is always signed out.
    // Not throttled, so a 429 never keeps the cookie; its body is never parsed (see configureApp)
    @SkipThrottle()
    @ApiNoContentResponse({
        description: `The session is ended and the "${REFRESH_TOKEN_COOKIE}" cookie is cleared`,
    })
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("logout")
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        await this.authService.logout(refreshCookiesOf(request));

        clearRefreshCookie(response);
    }
}
