import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterResponse, Role, UserStatus } from "@school-journal/shared";

import { AppModule } from "../src/app.module.js";
import { AuthService } from "../src/auth/auth.service.js";
import { configureApp } from "../src/config/app.js";
import { errors } from "../src/constants/errors.js";
import { authThrottler } from "../src/constants/index.js";
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

let app: INestApplication | undefined;

// A fresh app per test, so each one starts with an empty throttler
const createApp = async () => {
    const register = vi.fn().mockResolvedValue(registered);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AuthService)
        .useValue({ register })
        .compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    const post = (body: object) =>
        request(app?.getHttpServer()).post("/api/auth/register").send(body);

    return { register, post };
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
});
