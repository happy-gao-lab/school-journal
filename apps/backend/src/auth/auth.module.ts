import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import { TokenService } from "./token.service.js";

@Module({
    // secrets and lifetimes are passed per token by TokenService
    imports: [JwtModule.register({})],
    controllers: [AuthController],
    providers: [AuthService, SessionService, TokenService],
    // the cleanup job deletes stale sessions
    exports: [SessionService],
})
export class AuthModule {}
