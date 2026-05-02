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
import {Permission} from "../auth/auth.decorator";

@Injectable()
export class UsersService implements OnModuleInit {
    private readonly cronLogger = new Logger("CRON");

    constructor(
        @InjectRepository(User) private usersRepository: Repository<User>,
        private readonly configService: Environment,
    ) {
    }

    async onModuleInit() {
    }

    /**
     * Create a user.
     */
    async create(
        permission: Permission,
        password: string,
        email: string,
        name: string,
    ): Promise<User> {
        // Check read policy and if email is already taken
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.USER,
            {email},
        );
        if (await this.usersRepository.findOne({where: {email}})) {
            throw new ConflictException('Email is already being used');
        }

        // Check create policy
        permission.isAuthorized(
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
        permission: Permission,
        email: string,
        name: string,
    ) {
        permission.isAuthorized(
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

        permission.isAuthorized(
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
    async getAll(permission: Permission): Promise<User[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.USER,
        );
        return await this.usersRepository.find();
    }

    /**
     * Get all the not verified users.
     * Roles relation is not returned.
     */
    async findByNotVerified(permission: Permission): Promise<User[]> {
        permission.isAuthorized(
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
    async findById(permission: Permission, id: string): Promise<User> {
        permission.isAuthorized(
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
    async findByEmail(permission: Permission, email: string): Promise<User> {
        permission.isAuthorized(
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
        permission: Permission,
        tenant: Tenant,
    ): Promise<User[]> {
        permission.isAuthorized(
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

    async findByRole(permission: Permission, role: Role): Promise<User[]> {
        permission.isAuthorized(
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
        permission: Permission,
        userId: string,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.USER,
            {id: userId},
        );
        return this.usersRepository.existsBy({
            id: userId,
        });
    }

    async existByEmail(
        permission: Permission,
        email: string,
    ): Promise<boolean> {
        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        name: string,
        email: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);

        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        email: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);

        const valid: boolean = await argon2.verify(user.password, password);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        newEmail: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);
        user.email = newEmail;

        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);
        user.password = await argon2.hash(password);

        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);
        const valid: boolean = await argon2.verify(
            user.password,
            currentPassword,
        );
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }
        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        name: string = "",
    ): Promise<User> {
        const user: User = await this.findById(permission, id);
        user.name = name;
        permission.isAuthorized(
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
        permission: Permission,
        id: string,
        verified: boolean,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);

        permission.isAuthorized(
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
    async lockUser(permission: Permission, id: string): Promise<User> {
        const user = await this.findById(permission, id);
        permission.isAuthorized(Action.Update, SubjectEnum.USER, {id});
        if (user.email === this.configService.get("SUPER_ADMIN_EMAIL")) {
            throw new ForbiddenException("Cannot lock the super-admin account");
        }
        user.locked = true;
        return this.usersRepository.save(user);
    }

    /**
     * Unlock the user account.
     */
    async unlockUser(permission: Permission, id: string): Promise<User> {
        const user = await this.findById(permission, id);
        permission.isAuthorized(Action.Update, SubjectEnum.USER, {id});
        user.locked = false;
        return this.usersRepository.save(user);
    }

    /**
     * Delete the user.
     */
    async delete(permission: Permission, id: string): Promise<User> {
        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.USER,
            {id: id},
        );
        const user: User = await this.findById(permission, id);
        if (user.email === this.configService.get("SUPER_ADMIN_EMAIL")) {
            throw new UnauthorizedException("cannot delete super secure");
        }
        return await this.usersRepository.remove(user);
    }

    /**
     * Delete the user if the password is verified.
     */
    async deleteSecure(
        permission: Permission,
        id: string,
        password: string,
    ): Promise<User> {
        const user: User = await this.findById(permission, id);
        permission.isAuthorized(
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
        permission: Permission,
        tenant: Tenant,
    ): Promise<number> {
        permission.isAuthorized(
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
        permission: Permission,
        email: string,
        password: string,
    ): Promise<User> {
        permission.isAuthorized(
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
