import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApp } from "./config/app.js";
import { env } from "./config/env.js";

const bootstrap = async () => {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    configureApp(app);
    app.enableShutdownHooks();

    await app.listen(env.PORT);
};

await bootstrap();
