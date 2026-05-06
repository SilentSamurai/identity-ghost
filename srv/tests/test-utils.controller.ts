import {Body, Controller, Get, HttpCode, Param, Post} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
import {LoginSession} from "../src/entity/login-session.entity";
import {AuthCode} from "../src/entity/auth_code.entity";
import {User} from "../src/entity/user.entity";

/**
 * Test-only controller that exposes internal state manipulation endpoints.
 * Registered in global-setup.ts alongside the AppModule — never included in production builds.
 *
 * These endpoints allow integration tests using SharedTestFixture (HTTP-only,
 * no direct DB access) to set up edge-case scenarios like expired sessions
 * or seeded user records.
 */
@Controller("api/test-utils")
export class TestUtilsController {

    constructor(
        @InjectRepository(LoginSession)
        private readonly loginSessionRepo: Repository<LoginSession>,
        @InjectRepository(AuthCode)
        private readonly authCodeRepo: Repository<AuthCode>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {
    }

    /**
     * Force-expire a login session by setting its expiresAt to the past.
     */
    @Post("sessions/:sid/expire")
    @HttpCode(204)
    async expireSession(@Param("sid") sid: string): Promise<void> {
        await this.loginSessionRepo.update({sid}, {expiresAt: new Date(Date.now() - 1000)});
    }

    /**
     * Look up the sid associated with an auth code.
     */
    @Get("auth-codes/:code/sid")
    async getAuthCodeSid(@Param("code") code: string): Promise<{ sid: string | null }> {
        const authCode = await this.authCodeRepo.findOne({where: {code}});
        return {sid: authCode?.sid ?? null};
    }

    /**
     * Create or update a user record for test seeding.
     * Accepts raw field values (including pre-hashed passwords).
     */
    @Post("users")
    async upsertUser(@Body() body: Partial<User>): Promise<User> {
        const existing = body.email
            ? await this.userRepo.findOne({where: {email: body.email}})
            : null;
        if (existing) {
            Object.assign(existing, body);
            return this.userRepo.save(existing);
        }
        return this.userRepo.save(this.userRepo.create(body));
    }

    /**
     * Look up a user by email, returning internal fields (emailCount, emailCountResetAt).
     */
    @Get("users/by-email/:email")
    async getUserByEmail(@Param("email") email: string): Promise<Partial<User> | null> {
        const user = await this.userRepo.findOne({where: {email}});
        if (!user) return null;
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            emailCount: user.emailCount,
            emailCountResetAt: user.emailCountResetAt,
            verified: user.verified,
            locked: user.locked,
        };
    }

    /**
     * Create a login session for test seeding.
     * Returns the created session with all fields.
     */
    @Post("sessions")
    async createSession(@Body() body: { userId: string; tenantId: string; authTime?: number }): Promise<LoginSession> {
        const sid = crypto.randomUUID();
        const authTime = body.authTime ?? Math.floor(Date.now() / 1000);
        const expiresAt = new Date(Date.now() + 86400000); // 24 hours from now

        const session = this.loginSessionRepo.create({
            sid,
            userId: body.userId,
            tenantId: body.tenantId,
            authTime,
            expiresAt,
            invalidatedAt: null,
        });

        return this.loginSessionRepo.save(session);
    }

    /**
     * List all sessions for a user+tenant pair.
     * Returns sessions with all fields for verification.
     */
    @Get("sessions/user/:userId/tenant/:tenantId")
    async listSessions(
        @Param("userId") userId: string,
        @Param("tenantId") tenantId: string,
    ): Promise<LoginSession[]> {
        return this.loginSessionRepo.find({
            where: {userId, tenantId},
            order: {authTime: "DESC"},
        });
    }

    /**
     * Invalidate all sessions for a user+tenant pair.
     * Delegates to LoginSessionService.invalidateAllSessions.
     */
    @Post("sessions/user/:userId/tenant/:tenantId/invalidate-all")
    @HttpCode(204)
    async invalidateAllSessions(
        @Param("userId") userId: string,
        @Param("tenantId") tenantId: string,
    ): Promise<void> {
        await this.loginSessionRepo.update(
            {userId, tenantId, invalidatedAt: IsNull()},
            {invalidatedAt: new Date()},
        );
    }

    /**
     * Create an auth code for test seeding.
     * Returns the created auth code with all fields.
     */
    @Post("auth-codes")
    async createAuthCode(@Body() body: {
        userId: string;
        tenantId: string;
        clientId: string;
        codeChallenge: string;
        method: string;
        sid?: string;
        requireAuthTime?: boolean;
    }): Promise<AuthCode> {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

        const authCode = this.authCodeRepo.create({
            code,
            codeChallenge: body.codeChallenge,
            method: body.method,
            userId: body.userId,
            tenantId: body.tenantId,
            clientId: body.clientId,
            sid: body.sid || null,
            requireAuthTime: body.requireAuthTime || false,
            used: false,
            expiresAt,
        });

        return this.authCodeRepo.save(authCode);
    }

    /**
     * Force-expire an auth code by setting its expiresAt to the past.
     */
    @Post("auth-codes/:code/expire")
    @HttpCode(204)
    async expireAuthCode(@Param("code") code: string): Promise<void> {
        await this.authCodeRepo.update({code}, {expiresAt: new Date(Date.now() - 60_000)});
    }

    /**
     * Look up an auth code by its code string, returning all fields.
     */
    @Get("auth-codes/:code")
    async getAuthCode(@Param("code") code: string): Promise<AuthCode | null> {
        return this.authCodeRepo.findOne({where: {code}});
    }
}
