import { BadRequestException, PipeTransform } from "@nestjs/common";
import { z } from "zod";

import { errors } from "../../constants/errors.js";

export type FieldErrors = Record<string, string>;

// Nested paths are joined with dots, object-level issues go under "";
// only the first issue per field is kept
const toFieldErrors = (issues: z.core.$ZodIssue[]): FieldErrors => {
    const fieldErrors: FieldErrors = {};

    for (const issue of issues) {
        const field = issue.path.map(String).join(".");

        fieldErrors[field] ??= issue.message;
    }

    return fieldErrors;
};

// Unknown keys are stripped (zod's default for objects), so extra fields never reach a handler.
// Parses async so schemas with async refinements or transforms work too
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
    unknown,
    Promise<z.infer<TSchema>>
> {
    constructor(private readonly schema: TSchema) {}

    async transform(value: unknown): Promise<z.infer<TSchema>> {
        const result = await this.schema.safeParseAsync(value);

        if (!result.success) {
            throw new BadRequestException({
                message: errors.VALIDATION_FAILED,
                errors: toFieldErrors(result.error.issues),
            });
        }

        return result.data;
    }
}
