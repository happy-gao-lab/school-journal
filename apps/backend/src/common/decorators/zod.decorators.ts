import { Body, Query } from "@nestjs/common";
import { ApiBody, ApiBodyOptions, ApiQuery } from "@nestjs/swagger";
import { z } from "zod";

import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

// Swagger doesn't export its SchemaObject type, so it's taken from the ApiBody options
type OpenApiSchema = Extract<ApiBodyOptions, { schema: unknown }>["schema"];

type OpenApiObjectSchema = {
    properties?: Record<string, OpenApiSchema>;
    required?: string[];
};

// Request docs describe what the client sends, so the input side of transforms is used.
// The openapi-3.0 target produces the same shape Swagger expects, the cast only bridges the types.
// Recursive schemas and schemas with .meta({ id }) produce $refs Swagger can't resolve, so avoid them
const toOpenApi = (schema: z.ZodType) =>
    z.toJSONSchema(schema, {
        io: "input",
        target: "openapi-3.0",
        unrepresentable: "any",
    }) as unknown as OpenApiSchema;

// Swagger decorators are method decorators, so they're applied to the handler
// that the parameter belongs to
const applyToMethod = (
    target: object,
    key: string | symbol | undefined,
    decorator: MethodDecorator,
) => {
    if (key === undefined) {
        return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, key);

    if (descriptor) {
        decorator(target, key, descriptor);
    }
};

// Validates the request body and documents it in Swagger.
// The parameter's type isn't checked against the schema: annotate it with the schema's inferred type
export const ZodBody =
    (schema: z.ZodType): ParameterDecorator =>
    (target, key, index) => {
        Body(new ZodValidationPipe(schema))(target, key, index);
        applyToMethod(target, key, ApiBody({ schema: toOpenApi(schema) }));
    };

// Validates the query string and documents each property as a query parameter.
// Query values are strings, so schemas use z.coerce.* for numbers and booleans
export const ZodQuery =
    (schema: z.ZodObject): ParameterDecorator =>
    (target, key, index) => {
        Query(new ZodValidationPipe(schema))(target, key, index);

        const { properties = {}, required = [] } = toOpenApi(schema) as OpenApiObjectSchema;

        for (const [name, property] of Object.entries(properties)) {
            applyToMethod(
                target,
                key,
                ApiQuery({ name, required: required.includes(name), schema: property }),
            );
        }
    };
