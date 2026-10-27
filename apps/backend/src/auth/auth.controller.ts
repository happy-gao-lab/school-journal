import { Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { registerSchema } from "@school-journal/shared";
import type { RegisterInput } from "@school-journal/shared";

import { ZodBody } from "../common/decorators/zod.decorators.js";
import { authThrottler } from "../constants/index.js";
import { AuthService } from "./auth.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // A person registers once, so a few attempts per IP are enough and slow down spam
    @Throttle({
        default: { limit: authThrottler.REGISTER_LIMIT, ttl: authThrottler.REGISTER_TTL },
    })
    @Post("register")
    register(@ZodBody(registerSchema) data: RegisterInput) {
        return this.authService.register(data);
    }
}
