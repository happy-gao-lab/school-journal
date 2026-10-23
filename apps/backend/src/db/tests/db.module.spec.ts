import { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DbModule } from "../db.module.js";
import { pool } from "../index.js";

const { end } = vi.hoisted(() => ({ end: vi.fn() }));

// A real EventEmitter, so an "error" event without a listener throws like the real pool
vi.mock("../index.js", async () => {
    const { EventEmitter } = await import("node:events");

    return { pool: Object.assign(new EventEmitter(), { end }) };
});

const createModule = () => {
    const logger = { error: vi.fn() };

    return { dbModule: new DbModule(logger as unknown as PinoLogger), logError: logger.error };
};

describe("DbModule", () => {
    beforeEach(() => {
        pool.removeAllListeners();
        end.mockReset();
    });

    it("logs an idle client error instead of crashing the process", () => {
        const { dbModule, logError } = createModule();
        const error = new Error("Connection terminated unexpectedly");

        dbModule.onModuleInit();

        expect(() => pool.emit("error", error)).not.toThrow();
        expect(logError).toHaveBeenCalledWith({ err: error }, "Idle database client error");
    });

    it("ends the pool on application shutdown", async () => {
        const { dbModule } = createModule();

        await dbModule.onApplicationShutdown();

        expect(end).toHaveBeenCalledOnce();
    });
});
