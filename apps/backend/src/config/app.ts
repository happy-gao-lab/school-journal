import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { API_PREFIX, LOGOUT_PATH } from "../constants/index.js";
import { env, isProduction } from "./env.js";
import { setupSwagger } from "./swagger.js";

// Logout reads only the cookie; without a content type the body parsers (registered by Nest on
// init, after configureApp) skip the body, so a broken one can't turn logout into a 400
const skipLogoutBody = (request: Request, _response: Response, next: NextFunction) => {
    delete request.headers["content-type"];
    next();
};

// Shared by main.ts and the e2e tests, so both run the same app setup
export const configureApp = (app: INestApplication, { docs = !isProduction } = {}) => {
    app.useLogger(app.get(Logger));
    app.use(helmet());
    // the refresh token travels in an httpOnly cookie
    app.use(cookieParser());
    app.use(LOGOUT_PATH, skipLogoutBody);
    app.setGlobalPrefix(API_PREFIX);
    app.enableCors({ origin: env.CLIENT_URL, credentials: true });

    if (docs) {
        setupSwagger(app);
    }
};
