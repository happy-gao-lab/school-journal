import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./auth/auth.module.js";
import { ClassesModule } from "./classes/classes.module.js";
import { isProduction, logLevel } from "./config/env.js";
import { errors } from "./constants/errors.js";
import { API_PREFIX, globalThrottler } from "./constants/index.js";
import { DbModule } from "./db/db.module.js";
import { HttpExceptionFilter } from "./filters/http-exception.filter.js";
import { HealthModule } from "./health/health.module.js";

const loggerModule = {
    pinoHttp: {
        level: logLevel,
        transport: isProduction || logLevel === "silent" ? undefined : { target: "pino-pretty" },
        // the refresh token travels in the Cookie / Set-Cookie headers
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        autoLogging: {
            ignore: (req: { url?: string }) => req.url?.split("?")[0] === `/${API_PREFIX}/health`,
        },
    },
};

const throttlerModule = {
    throttlers: [{ ttl: globalThrottler.TTL, limit: globalThrottler.LIMIT }],
    errorMessage: errors.TOO_MANY_REQUESTS,
};

@Module({
    imports: [
        LoggerModule.forRoot(loggerModule),
        ThrottlerModule.forRoot(throttlerModule),
        DbModule,
        HealthModule,
        AuthModule,
        ClassesModule,
    ],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
    ],
})
export class AppModule {}
