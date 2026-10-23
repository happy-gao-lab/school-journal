import { Controller, Get, HttpStatus, INestApplication, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { GRADE_MAX, GRADE_MIN, ROLES } from "@school-journal/shared";

import { AppModule } from "../src/app.module.js";
import { ZodBody, ZodQuery } from "../src/common/decorators/zod.decorators.js";
import { configureApp } from "../src/config/app.js";
import { errors } from "../src/constants/errors.js";

// The DB isn't used by these routes; the mock keeps the app from opening a real pool
vi.mock("../src/db/index.js", () => ({
    db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
    pool: { on: vi.fn(), end: vi.fn().mockResolvedValue(undefined) },
}));

// Test-only schemas built from the shared package, the way feature schemas will be
const gradeBody = z.object({
    grade: z.number().int().min(GRADE_MIN).max(GRADE_MAX),
    role: z.enum(ROLES),
    comment: z.string().optional(),
});

const listQuery = z.object({
    page: z.coerce.number().int().min(1),
    q: z.string().optional(),
});

// Test-only routes validated with the zod decorators; they return what the handler received
@Controller("validation")
class ValidationController {
    @Post()
    create(@ZodBody(gradeBody) body: z.infer<typeof gradeBody>) {
        return { received: body };
    }

    @Get()
    list(@ZodQuery(listQuery) query: z.infer<typeof listQuery>) {
        return { received: query, pageType: typeof query.page };
    }
}

let app: INestApplication;
let server: Parameters<typeof request>[0];

const validBody = { grade: GRADE_MIN, role: ROLES[0] };

describe("zod validation (e2e)", () => {
    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
            controllers: [ValidationController],
        }).compile();

        app = moduleRef.createNestApplication({ bufferLogs: true });
        configureApp(app, { docs: true });
        await app.init();
        server = app.getHttpServer();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([
        ["below the minimum grade", { grade: GRADE_MIN - 1 }, "grade"],
        ["above the maximum grade", { grade: GRADE_MAX + 1 }, "grade"],
        ["a fractional grade", { grade: 1.5 }, "grade"],
        ["a grade sent as a string", { grade: String(GRADE_MAX) }, "grade"],
        ["an unknown role", { role: "superadmin" }, "role"],
    ])("rejects %s with 400 and a field error", async (_, override, field) => {
        const response = await request(server)
            .post("/api/validation")
            .send({ ...validBody, ...override });

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toEqual({
            statusCode: HttpStatus.BAD_REQUEST,
            message: errors.VALIDATION_FAILED,
            errors: { [field]: expect.any(String) },
        });
    });

    it("passes a valid body to the handler with unknown keys stripped", async () => {
        const response = await request(server)
            .post("/api/validation")
            .send({ grade: GRADE_MAX, role: ROLES[1], comment: "ok", status: "approved" });

        expect(response.status).toBe(HttpStatus.CREATED);
        expect(response.body).toEqual({
            received: { grade: GRADE_MAX, role: ROLES[1], comment: "ok" },
        });
    });

    it("rejects an empty object with 400 and an error for each required field", async () => {
        const response = await request(server).post("/api/validation").send({});

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toEqual({
            statusCode: HttpStatus.BAD_REQUEST,
            message: errors.VALIDATION_FAILED,
            errors: { grade: expect.any(String), role: expect.any(String) },
        });
    });

    it.each([
        ["a missing body", undefined],
        ["a JSON array", [validBody]],
    ])('rejects %s with 400 and an error under ""', async (_, body) => {
        const response = await request(server).post("/api/validation").send(body);

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toEqual({
            statusCode: HttpStatus.BAD_REQUEST,
            message: errors.VALIDATION_FAILED,
            errors: { "": expect.any(String) },
        });
    });

    it("coerces query values before they reach the handler", async () => {
        const response = await request(server).get("/api/validation?page=2&q=math");

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toEqual({ received: { page: 2, q: "math" }, pageType: "number" });
    });

    it.each([
        ["a non-numeric page", "?page=zero"],
        ["a missing page", ""],
    ])("rejects %s with 400 on the page field", async (_, search) => {
        const response = await request(server).get(`/api/validation${search}`);

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(response.body).toEqual({
            statusCode: HttpStatus.BAD_REQUEST,
            message: errors.VALIDATION_FAILED,
            errors: { page: expect.any(String) },
        });
    });

    it("documents the body schema as the request body in /api/docs", async () => {
        const response = await request(server).get("/api/docs-json");
        const requestBody = response.body.paths["/api/validation"].post.requestBody;

        expect(requestBody.content["application/json"].schema).toEqual({
            type: "object",
            properties: {
                grade: { type: "integer", minimum: GRADE_MIN, maximum: GRADE_MAX },
                role: { type: "string", enum: [...ROLES] },
                comment: { type: "string" },
            },
            required: ["grade", "role"],
        });
    });

    it("documents each query property as a query parameter with its required flag", async () => {
        const response = await request(server).get("/api/docs-json");
        const { parameters } = response.body.paths["/api/validation"].get;

        expect(parameters).toEqual([
            expect.objectContaining({ name: "page", in: "query", required: true }),
            expect.objectContaining({ name: "q", in: "query", required: false }),
        ]);
    });
});
