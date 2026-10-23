import { Controller, Get, HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/config/app.js";
import { env } from "../src/config/env.js";
import { globalThrottler } from "../src/constants/index.js";

// Test-only route that keeps the global throttler
@Controller("throttled")
class ThrottledController {
    @Get()
    get() {
        return { ok: true };
    }
}

let app: INestApplication | undefined;

const createApp = async (options?: Parameters<typeof configureApp>[1]) => {
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [ThrottledController],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app, options);
    await app.init();

    return app.getHttpServer();
};

const hitTimes = async (server: unknown, path: string, times: number) => {
    const statuses: number[] = [];

    for (let index = 0; index < times; index++) {
        const response = await request(server as Parameters<typeof request>[0]).get(path);
        statuses.push(response.status);
    }

    return statuses;
};

describe("app (e2e)", () => {
    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("GET /api/health returns 200 { status: ok }", async () => {
        const server = await createApp();

        const response = await request(server).get("/api/health");

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toEqual({ status: "ok" });
    });

    it("an unknown route returns 404 in the unified error shape", async () => {
        const server = await createApp();

        const response = await request(server).get("/api/nope");

        expect(response.status).toBe(HttpStatus.NOT_FOUND);
        expect(response.body).toEqual({
            statusCode: HttpStatus.NOT_FOUND,
            message: expect.any(String),
        });
    });

    it("malformed JSON returns 400 in the unified error shape", async () => {
        const server = await createApp();

        const response = await request(server)
            .post("/api/health")
            .set("Content-Type", "application/json")
            .send("{bad");

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toEqual({
            statusCode: HttpStatus.BAD_REQUEST,
            message: expect.any(String),
        });
    });

    it("a body over 100 KB returns 413 in the unified error shape", async () => {
        const server = await createApp();

        const response = await request(server)
            .post("/api/health")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ text: "a".repeat(200_000) }));

        expect(response.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(response.body).toEqual({
            statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
            message: "request entity too large",
        });
    });

    it("allows only CLIENT_URL with credentials, whatever the request origin", async () => {
        const server = await createApp();

        const response = await request(server).get("/api/health").set("Origin", "http://evil.test");

        expect(response.headers["access-control-allow-origin"]).toBe(env.CLIENT_URL);
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("sends helmet security headers and no X-Powered-By", async () => {
        const server = await createApp();

        const response = await request(server).get("/api/health");

        expect(response.headers["content-security-policy"]).toBeDefined();
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["x-powered-by"]).toBeUndefined();
    });

    it("does not throttle /api/health", async () => {
        const server = await createApp();

        const statuses = await hitTimes(server, "/api/health", globalThrottler.LIMIT + 1);

        expect(new Set(statuses)).toEqual(new Set([HttpStatus.OK]));
    });

    it("throttles other routes after the global limit with 429 in the unified error shape", async () => {
        const server = await createApp();

        const statuses = await hitTimes(server, "/api/throttled", globalThrottler.LIMIT);
        const response = await request(server).get("/api/throttled");

        expect(new Set(statuses)).toEqual(new Set([HttpStatus.OK]));
        expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(response.body).toEqual({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: expect.any(String),
        });
    });

    it("serves /api/docs outside production", async () => {
        const server = await createApp();

        const response = await request(server).get("/api/docs");

        expect(response.status).toBe(HttpStatus.OK);
    });

    it("does not serve /api/docs when docs are off (production)", async () => {
        const server = await createApp({ docs: false });

        const response = await request(server).get("/api/docs");

        expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
});
