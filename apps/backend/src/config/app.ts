import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { API_PREFIX } from "../constants/index.js";
import { env, isProduction } from "./env.js";
import { setupSwagger } from "./swagger.js";

// Shared by main.ts and the e2e tests, so both run the same app setup
export const configureApp = (app: INestApplication, { docs = !isProduction } = {}) => {
    app.useLogger(app.get(Logger));
    app.use(helmet());
    // the refresh token travels in an httpOnly cookie
    app.use(cookieParser());
    app.setGlobalPrefix(API_PREFIX);
    app.enableCors({ origin: env.CLIENT_URL, credentials: true });

    if (docs) {
        setupSwagger(app);
    }
};
