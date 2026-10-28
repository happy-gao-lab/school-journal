import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm";
import { Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { ErrorCode } from "@school-journal/shared";

import { FieldErrors } from "../common/pipes/zod-validation.pipe.js";
import { errors } from "../constants/errors.js";
import { loggableDbErrorOf, pgErrorOf } from "../utils/db.js";

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

// Log-only messages: the client still gets SOMETHING_WENT_WRONG
export const logMessages = {
    UNHANDLED_EXCEPTION: "Unhandled exception",
    DATABASE_QUERY_FAILED: "Database query failed",
    DATABASE_UNAVAILABLE: "Database unavailable",
} as const;

// Postgres reports query errors with a 5-character SQLSTATE code; connection errors
// (refused, timeout, DNS) come from the driver or Node without one.
// Class 08 (connection exception) and 57P (server shutting down) mean the DB itself is unreachable
const SQLSTATE = /^[0-9A-Z]{5}$/;
const UNAVAILABLE_SQLSTATE = /^(08|57P)/;

const logMessageFor = (exception: unknown) => {
    const pgError = pgErrorOf(exception);

    if (!pgError) {
        return logMessages.UNHANDLED_EXCEPTION;
    }

    const { code } = pgError;
    const isQueryError =
        typeof code === "string" && SQLSTATE.test(code) && !UNAVAILABLE_SQLSTATE.test(code);

    return isQueryError ? logMessages.DATABASE_QUERY_FAILED : logMessages.DATABASE_UNAVAILABLE;
};

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

    // Machine-readable code (ErrorCode from shared) for errors the FE handles specially
    private extractCode(exception: HttpException): ErrorCode | undefined {
        const response = exception.getResponse();

        if (typeof response === "string") {
            return undefined;
        }

        return (response as { code?: ErrorCode }).code;
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
                code: this.extractCode(exception),
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
        const logPayload =
            exception instanceof DrizzleQueryError
                ? { dbError: loggableDbErrorOf(exception) }
                : { err: exception };

        this.logger.error(logPayload, logMessageFor(exception));

        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errors.SOMETHING_WENT_WRONG,
        });
    }
}
