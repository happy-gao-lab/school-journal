import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

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

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();

        if (exception instanceof HttpException && exception.getStatus() < 500) {
            const statusCode = exception.getStatus();

            response.status(statusCode).json({
                statusCode,
                message: this.extractMessage(exception),
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

        // 5xx and unknown errors are logged, their details never reach the client
        this.logger.error({ err: exception }, "Unhandled exception");

        const statusCode =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        response.status(statusCode).json({
            statusCode,
            message: errors.SOMETHING_WENT_WRONG,
        });
    }
}
