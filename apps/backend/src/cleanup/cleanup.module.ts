import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { CleanupService } from "./cleanup.service.js";

@Module({
    imports: [AuthModule],
    providers: [CleanupService],
})
export class CleanupModule {}
