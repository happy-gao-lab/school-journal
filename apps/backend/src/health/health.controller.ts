import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { HealthService } from "./health.service.js";

@SkipThrottle()
@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    check() {
        return this.healthService.check();
    }
}
