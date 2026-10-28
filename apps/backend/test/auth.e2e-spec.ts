import { HttpStatus, INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ErrorCode,
    LoginResponse,
    RegisterResponse,
    Role,
    UserStatus,
} from "@school-journal/shared";

import { AppModule } from "../src/app.module.js";
import { AuthService } from "../src/auth/auth.service.js";
import { configureApp } from "../src/config/app.js";
import { errors } from "../src/constants/errors.js";
import {
    authThrottler,
    globalThrottler,
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE_PATH,
} from "../src/constants/index.js";
import { messages } from "../src/constants/messages.js";

// Closing the app ends the pool, so the tests use a fake one
vi.mock("../src/db/index.js", () => ({
    db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
    pool: { on: vi.fn(), end: vi.fn().mockResolvedValue(undefined) },
}));

const registered: RegisterResponse = {
    status: UserStatus.Pending,
    message: messages.REGISTRATION_PENDING,
};

const teacher = {
    role: Role.Teacher,
    username: "ivan.p",
    password: "Secret12",
    firstName: "Ivan",
    lastName: "Petrenko",
    email: "ivan@school.com",
    phone: "+380671234567",
};

// What AuthService.login hands the controller
const signedIn = {
    accessToken: "access.jwt",
    refreshToken: "refresh.jwt",
    refreshExpiresAt: "2026-11-27T15:00:00.000Z",
};

const credentials = { username: "ivan.p", password: "Secret12" };

let app: INestApplication | undefined;

// A fresh app per test, so each one starts with an empty throttler
const createApp = async () => {
    const register = vi.fn().mockResolvedValue(registered);
    const login = vi.fn().mockResolvedValue(signedIn);
    const refresh = vi.fn().mockResolvedValue(signedIn);
    const logout = vi.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AuthService)
        .useValue({ register, login, refresh, logout })
        .compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    const post = (body: object) =>
        request(app?.getHttpServer()).post("/api/auth/register").send(body);

    const postLogin = (body: object) =>
        request(app?.getHttpServer()).post("/api/auth/login").send(body);

    const postRefresh = () => request(app?.getHttpServer()).post("/api/auth/refresh");

    const postLogout = () => request(app?.getHttpServer()).post("/api/auth/logout");

    return { register, post, login, postLogin, refresh, postRefresh, logout, postLogout };
};

describe("auth (e2e)", () => {
    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("POST /api/auth/register validates the body before the service runs", async () => {
        const { register, post } = await createApp();

        const response = await post({ ...teacher, role: Role.Admin });

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toMatchObject({
            message: errors.VALIDATION_FAILED,
            errors: { role: expect.any(String) as unknown },
        });
        expect(register).not.toHaveBeenCalled();
    });

    it("POST /api/auth/register allows the register limit per IP, then answers 429", async () => {
        const { post } = await createApp();

        for (let attempt = 1; attempt <= authThrottler.REGISTER_LIMIT; attempt++) {
            const response = await post(teacher);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(registered);
        }

        const blocked = await post(teacher);

        expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(blocked.body).toMatchObject({ message: errors.TOO_MANY_REQUESTS });
    });

    it("POST /api/auth/login returns only the access token and sets the refresh token cookie", async () => {
        const { postLogin } = await createApp();

        const response = await postLogin(credentials);

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toEqual({
            accessToken: signedIn.accessToken,
        } satisfies LoginResponse);
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=${signedIn.refreshToken}; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(signedIn.refreshExpiresAt).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/login validates the body before the service runs", async () => {
        const { login, postLogin } = await createApp();

        const response = await postLogin({ username: "  ", password: "" });

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toMatchObject({
            message: errors.VALIDATION_FAILED,
            errors: {
                username: expect.any(String) as unknown,
                password: expect.any(String) as unknown,
            },
        });
        expect(login).not.toHaveBeenCalled();
    });

    it("POST /api/auth/login allows the login limit per IP, then answers 429", async () => {
        const { postLogin } = await createApp();

        for (let attempt = 1; attempt <= authThrottler.LOGIN_LIMIT; attempt++) {
            const response = await postLogin(credentials);

            expect(response.status).toBe(HttpStatus.OK);
        }

        const blocked = await postLogin(credentials);

        expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(blocked.body).toMatchObject({ message: errors.TOO_MANY_REQUESTS });
    });

    it("POST /api/auth/refresh passes the cookie to the service, returns only the access token and sets the new cookie", async () => {
        const { refresh, postRefresh } = await createApp();

        const response = await postRefresh().set("Cookie", `${REFRESH_TOKEN_COOKIE}=old.jwt`);

        expect(refresh).toHaveBeenCalledWith("old.jwt");
        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toEqual({
            accessToken: signedIn.accessToken,
        } satisfies LoginResponse);
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=${signedIn.refreshToken}; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(signedIn.refreshExpiresAt).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/refresh ignores a token sent in the body", async () => {
        const { refresh, postRefresh } = await createApp();

        await postRefresh().send({ refreshToken: "old.jwt" });

        expect(refresh).toHaveBeenCalledWith(undefined);
    });

    it("POST /api/auth/refresh answers 401 SESSION_EXPIRED and clears the cookie on the same path", async () => {
        const { refresh, postRefresh } = await createApp();
        refresh.mockRejectedValue(
            new UnauthorizedException({
                message: errors.SESSION_EXPIRED,
                code: ErrorCode.SessionExpired,
            }),
        );

        const response = await postRefresh().set("Cookie", `${REFRESH_TOKEN_COOKIE}=old.jwt`);

        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
        expect(response.body).toMatchObject({
            message: errors.SESSION_EXPIRED,
            code: ErrorCode.SessionExpired,
        });
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/refresh keeps the cookie when the service fails with a non-auth error", async () => {
        const { refresh, postRefresh } = await createApp();
        refresh.mockRejectedValue(new Error("Connection terminated"));

        const response = await postRefresh().set("Cookie", `${REFRESH_TOKEN_COOKIE}=old.jwt`);

        expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("POST /api/auth/logout passes the cookie to the service, answers 204 with an empty body and clears the cookie on the same path", async () => {
        const { logout, postLogout } = await createApp();

        const response = await postLogout().set("Cookie", `${REFRESH_TOKEN_COOKIE}=old.jwt`);

        expect(logout).toHaveBeenCalledWith(["old.jwt"]);
        expect(response.status).toBe(HttpStatus.NO_CONTENT);
        expect(response.text).toBe("");
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/logout ignores a token sent in the body and still clears the cookie", async () => {
        const { logout, postLogout } = await createApp();

        const response = await postLogout().send({ refreshToken: "old.jwt" });

        expect(logout).toHaveBeenCalledWith([]);
        expect(response.status).toBe(HttpStatus.NO_CONTENT);
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/logout passes every refresh token cookie in the request, without repeats or empty values", async () => {
        const { logout, postLogout } = await createApp();

        await postLogout().set(
            "Cookie",
            `${REFRESH_TOKEN_COOKIE}=dead.jwt; other=x; ${REFRESH_TOKEN_COOKIE}=; ${REFRESH_TOKEN_COOKIE}=live.jwt; ${REFRESH_TOKEN_COOKIE}=dead.jwt`,
        );

        expect(logout).toHaveBeenCalledWith(["dead.jwt", "live.jwt"]);
    });

    it("POST /api/auth/logout ignores a broken JSON body and still answers 204", async () => {
        const { logout, postLogout } = await createApp();

        const response = await postLogout()
            .set("Cookie", `${REFRESH_TOKEN_COOKIE}=old.jwt`)
            .set("Content-Type", "application/json")
            .send("{");

        expect(logout).toHaveBeenCalledWith(["old.jwt"]);
        expect(response.status).toBe(HttpStatus.NO_CONTENT);
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });

    it("POST /api/auth/logout is not throttled, so it still clears the cookie past the global limit", async () => {
        const { postLogout } = await createApp();

        for (let sent = 0; sent < globalThrottler.LIMIT; sent++) {
            await postLogout();
        }
        const response = await postLogout();

        expect(response.status).toBe(HttpStatus.NO_CONTENT);
        expect(response.headers["set-cookie"]).toEqual([
            `${REFRESH_TOKEN_COOKIE}=; Path=${REFRESH_TOKEN_COOKIE_PATH}; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
        ]);
    });
});
