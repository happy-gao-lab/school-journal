import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errors } from "../../../constants/errors.js";
import { ZodValidationPipe } from "../zod-validation.pipe.js";

const userSchema = z.object({
    name: z.string().min(2),
    age: z.coerce.number().int(),
    address: z.object({ city: z.string() }),
});

// Runs the pipe and returns the response of the BadRequestException it throws
const validationError = async (schema: z.ZodType, value: unknown) => {
    const error: unknown = await new ZodValidationPipe(schema)
        .transform(value)
        .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);

    return (error as BadRequestException).getResponse();
};

describe("ZodValidationPipe", () => {
    it("returns the parsed value with coerced types and unknown keys stripped", async () => {
        const result = await new ZodValidationPipe(userSchema).transform({
            name: "Ann",
            age: "12",
            address: { city: "Kyiv" },
            role: "admin",
        });

        expect(result).toEqual({ name: "Ann", age: 12, address: { city: "Kyiv" } });
    });

    it("throws a BadRequestException with VALIDATION_FAILED and a field → message map", async () => {
        const response = await validationError(userSchema, {
            name: "A",
            age: "x",
            address: { city: "Kyiv" },
        });

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { name: expect.any(String), age: expect.any(String) },
        });
    });

    it("joins nested field paths with dots", async () => {
        const response = await validationError(userSchema, { name: "Ann", age: 1, address: {} });

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { "address.city": expect.any(String) },
        });
    });

    it("keeps only the first issue per field", async () => {
        const schema = z.object({
            code: z.string().min(5, "Too short").regex(/\d/, "Needs a digit"),
        });

        const response = await validationError(schema, { code: "ab" });

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { code: "Too short" },
        });
    });

    it('puts object-level issues under the "" key', async () => {
        const schema = z
            .object({ password: z.string(), confirm: z.string() })
            .refine((value) => value.password === value.confirm, "Passwords differ");

        const response = await validationError(schema, { password: "a", confirm: "b" });

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { "": "Passwords differ" },
        });
    });

    it.each([
        ["an array", [1]],
        ["undefined", undefined],
    ])('puts a non-object input (%s) under the "" key', async (_, value) => {
        const response = await validationError(userSchema, value);

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { "": expect.any(String) },
        });
    });

    it("rejects a failing async refinement with field errors instead of crashing", async () => {
        const schema = z.object({
            username: z.string().refine(async (value) => value !== "taken", "Username is taken"),
        });

        const response = await validationError(schema, { username: "taken" });

        expect(response).toEqual({
            message: errors.VALIDATION_FAILED,
            errors: { username: "Username is taken" },
        });
    });
});
