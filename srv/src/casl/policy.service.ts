import {Injectable, Logger, NotFoundException} from "@nestjs/common";
import {Role} from "../entity/role.entity";
import {Environment} from "../config/environment.service";
import {Policy} from "../entity/authorization.entity";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Action, Effect} from "./actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {CacheService} from "./cache.service";
import {Tenant} from "../entity/tenant.entity";
import {Permission} from "../auth/auth.decorator";

@Injectable()
export class PolicyService {
    private logger = new Logger("PolicyService");

    constructor(
        private readonly configService: Environment,
        private readonly cacheService: CacheService,
        @InjectRepository(Policy)
        private authorizationRepository: Repository<Policy>,
    ) {
    }

    public async createAuthorization(
        permission: Permission,
        role: Role,
        effect: Effect,
        action: Action,
        subject: string,
        conditions: any,
    ) {
        permission.isAuthorized(
            Action.Create,
            SubjectEnum.POLICY,
            {tenantId: role.tenant.id},
        );

        const auth = this.authorizationRepository.create({
            role: role,
            tenant: role.tenant,
            effect: effect,
            action: action,
            subject: subject,
            conditions: conditions,
        });
        return await this.authorizationRepository.save(auth);
    }

    public async findByRole(
        permission: Permission,
        role: Role,
        tenant: Tenant,
    ) {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.POLICY,
            {tenantId: tenant.id},
        );

        let cache_key = `POLICY:${role.id}`;
        if (this.cacheService.has(cache_key)) {
            return this.cacheService.get<Policy[]>(cache_key);
        } else {
            const policies = await this.authorizationRepository.find({
                where: {
                    role: {
                        id: role.id,
                    },
                },
                relations: ["role"],
            });
            this.cacheService.set(cache_key, policies);
            return policies;
        }
    }

    public async findById(
        permission: Permission,
        id: string,
    ): Promise<Policy> {
        const auth = await this.authorizationRepository.findOne({
            where: {
                id: id,
            },
            relations: ["role"],
        });
        if (auth == undefined) {
            throw new NotFoundException("Policy Not Found");
        }

        permission.isAuthorized(
            Action.Read,
            SubjectEnum.POLICY,
            {roleId: auth.role.id},
        );

        return auth;
    }

    public async updateAuthorization(
        permission: Permission,
        id: string,
        body: {
            effect?: Effect;
            action?: Action;
            subject?: string;
            conditions?: { [string: string]: string } | null;
        },
    ): Promise<any> {
        const auth = await this.findById(permission, id);

        permission.isAuthorized(
            Action.Update,
            SubjectEnum.POLICY,
            {roleId: auth.role.id},
        );

        if (body.effect) {
            auth.effect = body.effect;
        }
        if (body.action) {
            auth.action = body.action;
        }
        if (body.subject) {
            auth.subject = body.subject;
        }
        if (body.conditions) {
            auth.conditions = body.conditions;
        }
        await this.authorizationRepository.save(auth);
        return auth;
    }

    public async removeAuthorization(
        permission: Permission,
        id: string,
    ): Promise<any> {
        const auth = await this.findById(permission, id);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.POLICY,
            {roleId: auth.role.id},
        );
        return await this.authorizationRepository.delete(id);
    }
}
