import {Body, Controller, Get, Param, Post, HttpCode} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
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
    ) {}

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
}
