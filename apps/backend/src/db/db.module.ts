import { Module, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { pool } from "./index.js";

@Module({})
export class DbModule implements OnModuleInit, OnApplicationShutdown {
    constructor(@InjectPinoLogger(DbModule.name) private readonly logger: PinoLogger) {}

    // An idle client that loses its connection emits "error"; unhandled, it would crash the process
    private readonly handleIdleClientError = (error: Error) => {
        this.logger.error({ err: error }, "Idle database client error");
    };

    onModuleInit() {
        pool.on("error", this.handleIdleClientError);
    }

    async onApplicationShutdown() {
        await pool.end();
    }
}
