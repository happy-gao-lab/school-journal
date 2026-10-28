import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { SessionService } from "../auth/session.service.js";
import { cleanupJob } from "../constants/index.js";

export const cleanupLogMessages = {
    DONE: "Cleanup done",
    FAILED: "Cleanup failed",
};

// Deletes data that is no longer needed; safe to run on several instances at once
@Injectable()
export class CleanupService {
    constructor(
        private readonly sessionService: SessionService,
        @InjectPinoLogger(CleanupService.name) private readonly logger: PinoLogger,
    ) {}

    @Cron(cleanupJob.CRON, { name: cleanupJob.NAME, timeZone: cleanupJob.TIME_ZONE })
    async run() {
        try {
            const sessions = await this.sessionService.deleteStale();

            this.logger.info({ sessions }, cleanupLogMessages.DONE);
        } catch (error) {
            // the next run tries again
            this.logger.error({ err: error }, cleanupLogMessages.FAILED);
        }
    }
}
