import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { FieldErrors } from "../common/pipes/zod-validation.pipe.js";
import { errors } from "../constants/errors.js";

type ClientError = { status: number; message: string };

// Express middleware (e.g. body-parser) throws http-errors with a public 4xx `status`
const isClientError = (exception: unknown): exception is ClientError =>
    exception instanceof Error &&
    "status" in exception &&
    typeof exception.status === "number" &&
    exception.status >= 400 &&
    exception.status < 500 &&
    "expose" in exception &&
    exception.expose === true;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(@InjectPinoLogger(HttpExceptionFilter.name) private readonly logger: PinoLogger) {}

    // Nest puts either a string or an object with a string / string[] message into the response
    private extractMessage(exception: HttpException): string {
        const response = exception.getResponse();

        if (typeof response === "string") {
            return response;
        }

        const { message } = response as { message?: string | string[] };

        if (Array.isArray(message)) {
            return message.join(", ");
        }

        return message ?? exception.message;
    }

    // Validation errors (field → message) from the zod pipe
    private extractFieldErrors(exception: HttpException): FieldErrors | undefined {
        const response = exception.getResponse();

        if (typeof response === "string") {
            return undefined;
        }

        return (response as { errors?: FieldErrors }).errors;
    }

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        // Thrown on purpose by our code, so the message (from errors.ts) is safe to send;
        // 5xx are still logged with their cause
        if (exception instanceof HttpException) {
            const statusCode = exception.getStatus();

            if (statusCode >= 500) {
                this.logger.error({ err: exception }, "Server error");
            }

            response.status(statusCode).json({
                statusCode,
                message: this.extractMessage(exception),
                errors: this.extractFieldErrors(exception),
            });

            return;
        }

        if (isClientError(exception)) {
            response.status(exception.status).json({
                statusCode: exception.status,
                message: exception.message,
            });

            return;
        }

        // Unknown errors are logged, their details never reach the client
        this.logger.error({ err: exception }, "Unhandled exception");

        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errors.SOMETHING_WENT_WRONG,
        });
    }
}
