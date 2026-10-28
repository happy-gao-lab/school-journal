import { randomUUID } from "node:crypto";
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { compare, hash } from "bcrypt";
import { and, eq, gt, isNotNull, or, sql } from "drizzle-orm";

import {
    currentSchoolYear,
    ErrorCode,
    LoginInput,
    RegisterInput,
    RegisterResponse,
    Role,
    UserStatus,
} from "@school-journal/shared";

import { errors } from "../constants/errors.js";
import { BCRYPT_SALT_ROUNDS, loginLockout } from "../constants/index.js";
import { messages } from "../constants/messages.js";
import { db } from "../db/index.js";
import { classesTable, studentClassesTable } from "../db/schemas/class.schemas.js";
import {
    EMAIL_UNIQUE_INDEX,
    USERNAME_UNIQUE_INDEX,
    usersTable,
} from "../db/schemas/user.schemas.js";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorOf } from "../utils/db.js";
import { SessionService } from "./session.service.js";
import { TokenService } from "./token.service.js";

// Same shape as validation errors, so the form can show the message under the field
const fieldError = <TException extends new (body: object) => Error>(
    Exception: TException,
    field: string,
    message: string,
) => new Exception({ message, errors: { [field]: message } });

const usernameTaken = () => fieldError(ConflictException, "username", errors.USERNAME_TAKEN);
const emailTaken = () => fieldError(ConflictException, "email", errors.EMAIL_TAKEN);
const classNotFound = () => fieldError(BadRequestException, "classId", errors.CLASS_NOT_FOUND);

// Compared in SQL, so the lock doesn't depend on the server clock; an expired lock counts as none
const isLocked = sql<boolean>`coalesce(${usersTable.lockedUntil} > now(), false)`;

const invalidCredentials = () =>
    new UnauthorizedException({
        message: errors.INVALID_CREDENTIALS,
        code: ErrorCode.InvalidCredentials,
    });

const accountLocked = () =>
    new HttpException(
        { message: errors.ACCOUNT_LOCKED, code: ErrorCode.AccountLocked },
        HttpStatus.LOCKED,
    );

// Only approved users sign in; the other statuses get their own code
const notApproved = {
    [UserStatus.Pending]: () =>
        new ForbiddenException({ message: errors.ACCOUNT_PENDING, code: ErrorCode.AccountPending }),
    [UserStatus.Rejected]: () =>
        new ForbiddenException({
            message: errors.ACCOUNT_REJECTED,
            code: ErrorCode.AccountRejected,
        }),
};

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
    // Compared against when the username is unknown, so the response takes as long as a wrong password;
    // created up front, so the first such request isn't slower either
    private readonly dummyHash = hash(randomUUID(), BCRYPT_SALT_ROUNDS);

    constructor(
        private readonly tokenService: TokenService,
        private readonly sessionService: SessionService,
    ) {}

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

    // Counts a wrong password; the last allowed one locks the account and starts the count over.
    // One atomic update, so concurrent attempts can't skip the lock; an account a concurrent attempt
    // has just locked is left as it is. Returns whether the account is locked now
    private async registerFailedAttempt(userId: number) {
        const attempts = sql`${usersTable.failedLoginAttempts} + 1`;
        const reachesLimit = sql`${attempts} >= ${loginLockout.MAX_FAILED_ATTEMPTS}`;

        const [user] = await db
            .update(usersTable)
            .set({
                failedLoginAttempts: sql`case when ${isLocked} then ${usersTable.failedLoginAttempts} when ${reachesLimit} then 0 else ${attempts} end`,
                lockedUntil: sql`case when ${isLocked} then ${usersTable.lockedUntil} when ${reachesLimit} then now() + make_interval(mins => ${loginLockout.DURATION_MINUTES}) else ${usersTable.lockedUntil} end`,
            })
            .where(eq(usersTable.id, userId))
            .returning({ isLocked });

        // no row: the user was deleted meanwhile, so it's just wrong credentials
        return user?.isLocked ?? false;
    }

    async login(data: LoginInput) {
        const [user] = await db
            .select({
                id: usersTable.id,
                passwordHash: usersTable.passwordHash,
                role: usersTable.role,
                status: usersTable.status,
                isLocked,
            })
            .from(usersTable)
            .where(sql`lower(${usersTable.username}) = lower(${data.username})`);

        if (!user) {
            await compare(data.password, await this.dummyHash);

            throw invalidCredentials();
        }

        // locked even for the right password, so guessing can't go on during the lock
        if (user.isLocked) {
            throw accountLocked();
        }

        if (!(await compare(data.password, user.passwordHash))) {
            throw (await this.registerFailedAttempt(user.id))
                ? accountLocked()
                : invalidCredentials();
        }

        // checked after the password, so only its owner learns the status
        if (user.status !== UserStatus.Approved) {
            throw notApproved[user.status]();
        }

        // skipped when there is nothing to reset, so a plain sign-in doesn't touch updated_at
        await db
            .update(usersTable)
            .set({ failedLoginAttempts: 0, lockedUntil: null })
            .where(
                and(
                    eq(usersTable.id, user.id),
                    or(gt(usersTable.failedLoginAttempts, 0), isNotNull(usersTable.lockedUntil)),
                ),
            );

        const session = await this.sessionService.create(user.id);
        const sub = String(user.id);

        const [accessToken, refreshToken] = await Promise.all([
            this.tokenService.signAccessToken({ sub, role: user.role, sessionId: session.id }),
            this.tokenService.signRefreshToken(
                { sub, sessionId: session.id, jti: session.tokenId },
                session.expiresAt,
            ),
        ]);

        return { accessToken, refreshToken, refreshExpiresAt: session.expiresAt };
    }
}
