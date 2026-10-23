import { readFileSync } from "node:fs";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { DOCS_PATH } from "../constants/index.js";

// Resolved from dist/config/ (or src/config/) to the backend package.json
const { version } = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const config = new DocumentBuilder().setTitle("School Journal API").setVersion(version).build();

export const setupSwagger = (app: INestApplication) => {
    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup(DOCS_PATH, app, document, { useGlobalPrefix: true });
};
