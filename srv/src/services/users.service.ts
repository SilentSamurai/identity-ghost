import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
    UnauthorizedException
} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {User} from "../entity/user.entity";
import {Environment} from "../config/environment.service";
import * as argon2 from "argon2";
import {Role} from "../entity/role.entity";
import {Tenant} from "src/entity/tenant.entity";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {SecurityService} from "../casl/security.service";
import {AuthContext} from "../casl/contexts";

@Injectable()
export class UsersService implements OnModuleInit {
    private readonly cronLogger = new Logger("CRON");

    constructor(
        @InjectRepository(User) private usersRepository: Repository<User>,
        private readonly configService: Environment,
        private readonly securityService: SecurityService,
    ) {
    }

    async onModuleInit() {
    }

    /**
     * Create a user.
     */
    async create(
        authContext: AuthContext,
        password: string,
        email: string,
        name: string,
    ): Promise<User> {
        // Check read policy and if email is already taken
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {email},
        );
        if (await this.usersRepository.findOne({where: {email}})) {
            throw new ConflictException('Email is already being used');
        }

        // Check create policy
        this.securityService.isAuthorized(
            authContext,
            Action.Create,
            SubjectEnum.USER,
        );

        // Create and save the new user
        const user: User = this.usersRepository.create({
            email,
            password: await argon2.hash(password),
            name,
        });

        return this.usersRepository.save(user);
    }

    async createShadowUser(
        authContext: AuthContext,
        email: string,
        name: string,
    ) {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {email: email},
        );

        const emailTaken: User = await this.usersRepository.findOne({
            where: {email},
        });
        if (emailTaken) {
            throw new ConflictException('Email is already being used');
        }

        this.securityService.isAuthorized(
            authContext,
            Action.Create,
            SubjectEnum.USER,
        );

        const user: User = this.usersRepository.create({
            email: email,
            password: await argon2.hash("sKQ%X8@yoHcvLvDpEQG19dVAzpdqt3"),
            name: name,
        });

        return this.usersRepository.save(user);
    }

    /**
     * Get all the users.
     */
    async getAll(authContext: AuthContext): Promise<User[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
        );
        return await this.usersRepository.find();
    }

    /**
     * Get all the not verified users.
     * Roles relation is not returned.
     */
    async findByNotVerified(authContext: AuthContext): Promise<User[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
        );
        return await this.usersRepository
            .createQueryBuilder("user")
            .select("*")
            .where("verified = false")
            .execute();
    }

    /**
     * Get a user by id.
     */
    async findById(authContext: AuthContext, id: string): Promise<User> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {id: id},
        );
        const user: User = await this.usersRepository.findOne({
            where: {id: id},
        });
        if (user === null) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    /**
     * Get a user by email.
     */
    async findByEmail(authContext: AuthContext, email: string): Promise<User> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {email: email},
        );
        const user: User = await this.usersRepository.findOne({
            where: {email},
        });
        if (user === null) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    async findByTenant(
        authContext: AuthContext,
        tenant: Tenant,
    ): Promise<User[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
        );
        const users: User[] = await this.usersRepository.find({
            where: {
                tenants: {id: tenant.id},
            },
        });
        return users;
    }

    async findByRole(authContext: AuthContext, role: Role): Promise<User[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
        );
        const users: User[] = await this.usersRepository.find({
            where: {
                roles: {id: role.id},
            },
        });
        return users;
    }

    async existById(
        authContext: AuthContext,
        userId: string,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {id: userId},
        );
        return this.usersRepository.existsBy({
            id: userId,
        });
    }

    async existByEmail(
        authContext: AuthContext,
        email: string,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {email: email},
        );
        return this.usersRepository.existsBy({
            email: email,
        });
    }

    /**
     * Update the user.
     */
    async update(
        authContext: AuthContext,
        id: string,
        name: string,
        email: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);

        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {email: email},
        );

        if (email !== null) {
            const emailTaken = await this.usersRepository.findOne({
                where: {email},
            });
            if (emailTaken) {
                throw new ConflictException('Email is already being used');
            }
            user.email = email;
        }
        user.name = name || user.name;

        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's username if the password is verified.
     */
    async updateEmailSecure(
        authContext: AuthContext,
        id: string,
        email: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);

        const valid: boolean = await argon2.verify(user.password, password);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {email: email},
        );

        const emailTaken = await this.usersRepository.findOne({
            where: {email},
        });
        if (emailTaken) {
            throw new ConflictException('Email is already being used');
        }

        user.email = email;

        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's email.
     */
    async updateEmail(
        authContext: AuthContext,
        id: string,
        newEmail: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);
        user.email = newEmail;

        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {id: id},
        );

        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's password.
     */
    async updatePassword(
        authContext: AuthContext,
        id: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);
        user.password = await argon2.hash(password);

        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {id: id},
        );

        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's password if the password is verified.
     */
    async updatePasswordSecure(
        authContext: AuthContext,
        id: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);
        const valid: boolean = await argon2.verify(
            user.password,
            currentPassword,
        );
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {id: id},
        );

        user.password = await argon2.hash(newPassword);
        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's name.
     */
    async updateName(
        authContext: AuthContext,
        id: string,
        name: string = "",
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);
        user.name = name;
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {id: id},
        );
        return await this.usersRepository.save(user);
    }

    /**
     * Update the user's verified field.
     */
    async updateVerified(
        authContext: AuthContext,
        id: string,
        verified: boolean,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);

        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.USER,
            {id: id},
        );

        user.verified = verified;
        return await this.usersRepository.save(user);
    }

    /**
     * Lock the user account.
     */
    async lockUser(authContext: AuthContext, id: string): Promise<User> {
        const user = await this.findById(authContext, id);
        this.securityService.isAuthorized(authContext, Action.Update, SubjectEnum.USER, {id});
        if (user.email === this.configService.get("SUPER_ADMIN_EMAIL")) {
            throw new ForbiddenException("Cannot lock the super-admin account");
        }
        user.locked = true;
        return this.usersRepository.save(user);
    }

    /**
     * Unlock the user account.
     */
    async unlockUser(authContext: AuthContext, id: string): Promise<User> {
        const user = await this.findById(authContext, id);
        this.securityService.isAuthorized(authContext, Action.Update, SubjectEnum.USER, {id});
        user.locked = false;
        return this.usersRepository.save(user);
    }

    /**
     * Delete the user.
     */
    async delete(authContext: AuthContext, id: string): Promise<User> {
        this.securityService.isAuthorized(
            authContext,
            Action.Delete,
            SubjectEnum.USER,
            {id: id},
        );
        const user: User = await this.findById(authContext, id);
        if (user.email === this.configService.get("SUPER_ADMIN_EMAIL")) {
            throw new UnauthorizedException("cannot delete super secure");
        }
        return await this.usersRepository.remove(user);
    }

    /**
     * Delete the user if the password is verified.
     */
    async deleteSecure(
        authContext: AuthContext,
        id: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(authContext, id);
        this.securityService.isAuthorized(
            authContext,
            Action.Delete,
            SubjectEnum.USER,
            {id: id},
        );
        const valid: boolean = await argon2.verify(user.password, password);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return await this.usersRepository.remove(user);
    }

    /**
     * Delete the expired not verified users.
     */
    // @Cron('0 1 * * * *') // Every hour, at the start of the 1st minute.
    // async deleteExpiredNotVerifiedUsers() {
    //     this.cronLogger.log('Delete expired not verified users');
    //
    //     const now: Date = new Date();
    //     const expirationTime: any = this.configService.get('TOKEN_VERIFICATION_EXPIRATION_TIME');
    //
    //     const users: User[] = await this.findByNotVerified();
    //     for (let i = 0; i < users.length; i++) {
    //         const user: User = users[i];
    //         const createDate: Date = new Date(user.createdAt);
    //         const expirationDate: Date = new Date(createDate.getTime() + ms(expirationTime));
    //
    //         if (now > expirationDate) {
    //             try {
    //                 this.delete(user.id);
    //                 this.cronLogger.log('User ' + user.email + ' deleted');
    //             } catch (exception) {
    //             }
    //         }
    //     }
    // }

    async countByTenant(
        authContext: AuthContext,
        tenant: Tenant,
    ): Promise<number> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
        );

        return this.usersRepository.count({
            where: {
                tenants: {id: tenant.id},
            },
        });
    }

    async findByEmailSecure(
        authContext: AuthContext,
        email: string,
        password: string,
    ): Promise<User> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.USER,
            {email: email},
        );
        const user: User = await this.usersRepository.findOne({
            where: {email},
        });
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const valid: boolean = await argon2.verify(user.password, password);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return user;
    }
}
