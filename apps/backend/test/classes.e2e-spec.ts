import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicClass } from "@school-journal/shared";

import { AppModule } from "../src/app.module.js";
import { ClassesService } from "../src/classes/classes.service.js";
import { configureApp } from "../src/config/app.js";

// Closing the app ends the pool, so the tests use a fake one
vi.mock("../src/db/index.js", () => ({
    db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
    pool: { on: vi.fn(), end: vi.fn().mockResolvedValue(undefined) },
}));

const classes: PublicClass[] = [
    { id: 1, name: "1-A" },
    { id: 2, name: "10-A" },
];

let app: INestApplication | undefined;

describe("classes (e2e)", () => {
    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("GET /api/classes/public answers without an Authorization header", async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(ClassesService)
            .useValue({ findPublic: vi.fn().mockResolvedValue(classes) })
            .compile();
        app = moduleRef.createNestApplication({ bufferLogs: true });
        configureApp(app);
        await app.init();

        const response = await request(app.getHttpServer()).get("/api/classes/public");

        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toEqual(classes);
    });
});
