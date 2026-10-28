import { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";

import type { SessionService } from "../../auth/session.service.js";
import { cleanupLogMessages, CleanupService } from "../cleanup.service.js";

const createService = (deleteStale: () => Promise<number>) => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const service = new CleanupService(
        { deleteStale } as unknown as SessionService,
        logger as unknown as PinoLogger,
    );

    return { service, logger };
};

describe("CleanupService.run", () => {
    it("logs how many sessions were deleted", async () => {
        const { service, logger } = createService(vi.fn().mockResolvedValue(3));

        await service.run();

        expect(logger.info).toHaveBeenCalledWith({ sessions: 3 }, cleanupLogMessages.DONE);
    });

    it("logs a failed delete and doesn't throw, so the scheduler keeps running", async () => {
        const error = new Error("Connection terminated");
        const { service, logger } = createService(vi.fn().mockRejectedValue(error));

        await expect(service.run()).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith({ err: error }, cleanupLogMessages.FAILED);
    });
});
