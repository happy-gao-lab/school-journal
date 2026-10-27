import { Module } from "@nestjs/common";

import { ClassesController } from "./classes.controller.js";
import { ClassesService } from "./classes.service.js";

@Module({
    controllers: [ClassesController],
    providers: [ClassesService],
})
export class ClassesModule {}
