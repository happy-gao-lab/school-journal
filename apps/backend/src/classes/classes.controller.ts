import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { ClassesService } from "./classes.service.js";

@ApiTags("classes")
@Controller("classes")
export class ClassesController {
    constructor(private readonly classesService: ClassesService) {}

    // No auth: the registration form lists classes before the user has an account
    @Get("public")
    findPublic() {
        return this.classesService.findPublic();
    }
}
