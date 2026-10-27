import {
    ArgumentsHost,
    BadRequestException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";

import { errors } from "../../constants/errors.js";
import { HttpExceptionFilter, logMessages } from "../http-exception.filter.js";

// Runs the filter against a fake response and returns what it sent and logged
const runFilter = (exception: unknown) => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
        switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const logger = { error: vi.fn() };

    new HttpExceptionFilter(logger as unknown as PinoLogger).catch(exception, host);

    return { status, json, logError: logger.error };
};

const httpError = (status: number, message: string, expose: boolean) =>
    Object.assign(new Error(message), { status, expose });

// What Drizzle throws when a query fails, with the driver error as the cause
const queryError = (cause: Error) => new DrizzleQueryError("select 1", [], cause);

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

// What the filter logs for a failed query: the SQL and the cause's code and message, no bound values
const dbErrorLog = (exception: DrizzleQueryError) => {
    const { code, message } = exception.cause as { code?: string; message: string };

    return { dbError: { query: "select 1", code, constraint: undefined, message } };
};

const genericResponse = {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: errors.SOMETHING_WENT_WRONG,
};

describe("HttpExceptionFilter", () => {
    it("returns a 4xx HttpException with its status and message, without logging", () => {
        const { status, json, logError } = runFilter(new NotFoundException("Nope"));

        expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(json).toHaveBeenCalledWith({ statusCode: HttpStatus.NOT_FOUND, message: "Nope" });
        expect(logError).not.toHaveBeenCalled();
    });

    it("joins an array message into one string", () => {
        const { json } = runFilter(new BadRequestException(["a is bad", "b is bad"]));

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.BAD_REQUEST,
            message: "a is bad, b is bad",
        });
    });

    it("passes the field errors of a validation exception through", () => {
        const fieldErrors = { name: "Too short", "address.city": "Required" };

        const { json } = runFilter(
            new BadRequestException({ message: errors.VALIDATION_FAILED, errors: fieldErrors }),
        );

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.BAD_REQUEST,
            message: errors.VALIDATION_FAILED,
            errors: fieldErrors,
        });
    });

    it("falls back to the exception message when the response object has none", () => {
        const { json } = runFilter(new HttpException({ reason: "x" }, HttpStatus.CONFLICT));

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.CONFLICT,
            message: "Http Exception",
        });
    });

    it("keeps the message of a 5xx HttpException and logs it", () => {
        const exception = new InternalServerErrorException("Database is unavailable");
        const { status, json, logError } = runFilter(exception);

        expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Database is unavailable",
        });
        expect(logError).toHaveBeenCalledWith({ err: exception }, "Server error");
    });

    it("returns 500 with the generic message for an unknown Error and logs it", () => {
        const exception = new Error("boom");
        const { json, logError } = runFilter(exception);

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errors.SOMETHING_WENT_WRONG,
        });
        expect(logError).toHaveBeenCalledWith({ err: exception }, logMessages.UNHANDLED_EXCEPTION);
    });

    it("logs a failed connection as database unavailable, with the generic response", () => {
        const refused = queryError(withCode("connect ECONNREFUSED 127.0.0.1:5432", "ECONNREFUSED"));
        const noCode = queryError(new Error(""));

        for (const exception of [refused, noCode]) {
            const { json, logError } = runFilter(exception);

            expect(json).toHaveBeenCalledWith(genericResponse);
            expect(logError).toHaveBeenCalledWith(
                dbErrorLog(exception),
                logMessages.DATABASE_UNAVAILABLE,
            );
        }
    });

    it("logs Postgres connection and shutdown codes as database unavailable", () => {
        for (const code of ["08006", "57P01"]) {
            const exception = queryError(withCode("server gone", code));

            expect(runFilter(exception).logError).toHaveBeenCalledWith(
                dbErrorLog(exception),
                logMessages.DATABASE_UNAVAILABLE,
            );
        }
    });

    it("logs an error Postgres reports for the query as a failed query, with the generic response", () => {
        const exception = queryError(withCode('relation "nope" does not exist', "42P01"));
        const { json, logError } = runFilter(exception);

        expect(json).toHaveBeenCalledWith(genericResponse);
        expect(logError).toHaveBeenCalledWith(
            dbErrorLog(exception),
            logMessages.DATABASE_QUERY_FAILED,
        );
    });

    it("never logs the values bound to a failed query", () => {
        const cause = Object.assign(new Error('null value in column "phone"'), {
            code: "23502",
            constraint: "users_phone_check",
            detail: "Failing row contains (Ivan.P, $2b$12$secret-hash, ivan@school.com)",
        });
        const exception = new DrizzleQueryError(
            "insert into users (username, password_hash, email) values ($1, $2, $3)",
            ["Ivan.P", "$2b$12$secret-hash", "ivan@school.com"],
            cause,
        );

        const { logError } = runFilter(exception);
        const logged = JSON.stringify(logError.mock.calls);

        expect(logError).toHaveBeenCalledWith(
            {
                dbError: {
                    query: exception.query,
                    code: "23502",
                    constraint: "users_phone_check",
                    message: cause.message,
                },
            },
            logMessages.DATABASE_QUERY_FAILED,
        );

        for (const value of ["Ivan.P", "$2b$12$secret-hash", "ivan@school.com"]) {
            expect(logged).not.toContain(value);
        }
    });

    it("keeps the status and message of an exposed middleware 4xx error, without logging", () => {
        const { status, json, logError } = runFilter(
            httpError(HttpStatus.PAYLOAD_TOO_LARGE, "request entity too large", true),
        );

        expect(status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
            message: "request entity too large",
        });
        expect(logError).not.toHaveBeenCalled();
    });

    it("treats a middleware 4xx error that is not exposed as unknown", () => {
        const { json, logError } = runFilter(httpError(HttpStatus.BAD_REQUEST, "secret", false));

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errors.SOMETHING_WENT_WRONG,
        });
        expect(logError).toHaveBeenCalledOnce();
    });

    it("returns 500 with the generic message for a thrown non-Error value", () => {
        const { json } = runFilter("just a string");

        expect(json).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errors.SOMETHING_WENT_WRONG,
        });
    });
});
