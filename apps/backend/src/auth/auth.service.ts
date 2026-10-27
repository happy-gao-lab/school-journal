import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { hash } from "bcrypt";
import { and, eq, or, sql } from "drizzle-orm";

import {
    currentSchoolYear,
    RegisterInput,
    RegisterResponse,
    Role,
    UserStatus,
} from "@school-journal/shared";

import { errors } from "../constants/errors.js";
import { BCRYPT_SALT_ROUNDS } from "../constants/index.js";
import { messages } from "../constants/messages.js";
import { db } from "../db/index.js";
import { classesTable, studentClassesTable } from "../db/schemas/class.schemas.js";
import {
    EMAIL_UNIQUE_INDEX,
    USERNAME_UNIQUE_INDEX,
    usersTable,
} from "../db/schemas/user.schemas.js";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorOf } from "../utils/db.js";

// Same shape as validation errors, so the form can show the message under the field
const fieldError = <TException extends new (body: object) => Error>(
    Exception: TException,
    field: string,
    message: string,
) => new Exception({ message, errors: { [field]: message } });

const usernameTaken = () => fieldError(ConflictException, "username", errors.USERNAME_TAKEN);
const emailTaken = () => fieldError(ConflictException, "email", errors.EMAIL_TAKEN);
const classNotFound = () => fieldError(BadRequestException, "classId", errors.CLASS_NOT_FOUND);

// Maps a constraint violation from a concurrent request to the error the up-front checks give
const conflictOf = (error: unknown) => {
    const pgError = pgErrorOf(error);

    if (pgError?.code === PG_FOREIGN_KEY_VIOLATION) {
        // the class was deleted after the check
        return classNotFound();
    }

    if (pgError?.code !== PG_UNIQUE_VIOLATION) {
        return undefined;
    }

    if (pgError.constraint === USERNAME_UNIQUE_INDEX) {
        return usernameTaken();
    }

    if (pgError.constraint === EMAIL_UNIQUE_INDEX) {
        return emailTaken();
    }

    return undefined;
};

@Injectable()
export class AuthService {
    // Username wins when both are taken; the schema already lowercased the email
    private async assertAvailable(username: string, email: string | undefined) {
        const usernameMatches = sql`lower(${usersTable.username}) = lower(${username})`;

        // at most one user per unique index can match
        const existing = await db
            .select({ username: usersTable.username })
            .from(usersTable)
            .where(
                email === undefined
                    ? usernameMatches
                    : or(usernameMatches, sql`lower(${usersTable.email}) = ${email}`),
            )
            .limit(2);

        if (existing.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
            throw usernameTaken();
        }

        if (existing.length > 0) {
            throw emailTaken();
        }
    }

    // Students can only join a class of the current school year
    private async assertCurrentClass(classId: number) {
        const [schoolClass] = await db
            .select({ id: classesTable.id })
            .from(classesTable)
            .where(and(eq(classesTable.id, classId), eq(classesTable.year, currentSchoolYear())));

        if (!schoolClass) {
            throw classNotFound();
        }
    }

    async register(data: RegisterInput): Promise<RegisterResponse> {
        await this.assertAvailable(data.username, data.email);

        if (data.role === Role.Student) {
            await this.assertCurrentClass(data.classId);
        }

        const passwordHash = await hash(data.password, BCRYPT_SALT_ROUNDS);

        try {
            await db.transaction(async (tx) => {
                const [user] = await tx
                    .insert(usersTable)
                    .values({
                        username: data.username,
                        passwordHash,
                        email: data.email,
                        phone: data.phone,
                        firstName: data.firstName,
                        lastName: data.lastName,
                        middleName: data.middleName,
                        role: data.role,
                    })
                    .returning({ id: usersTable.id });

                // throwing inside the transaction rolls it back
                if (!user) {
                    throw new Error(`Insert into users returned no row for "${data.username}"`);
                }

                if (data.role === Role.Student) {
                    await tx
                        .insert(studentClassesTable)
                        .values({ studentId: user.id, classId: data.classId });
                }
            });
        } catch (error) {
            throw conflictOf(error) ?? error;
        }

        return { status: UserStatus.Pending, message: messages.REGISTRATION_PENDING };
    }
}
