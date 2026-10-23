import { HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errors } from "../../constants/errors.js";
import { HealthService } from "../health.service.js";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../../db/index.js", () => ({ db: { execute } }));

describe("HealthService", () => {
    beforeEach(() => {
        execute.mockReset();
    });

    it("returns { status: ok } when the database answers", async () => {
        execute.mockResolvedValue({ rows: [] });

        await expect(new HealthService().check()).resolves.toEqual({ status: "ok" });
    });

    it("throws 503 with DATABASE_UNAVAILABLE and keeps the DB error as the cause", async () => {
        const dbError = new Error("connection refused");
        execute.mockRejectedValue(dbError);

        const error = await new HealthService().check().then(
            () => undefined,
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getStatus()).toBe(
            HttpStatus.SERVICE_UNAVAILABLE,
        );
        expect(error).toMatchObject({ message: errors.DATABASE_UNAVAILABLE, cause: dbError });
    });
});
