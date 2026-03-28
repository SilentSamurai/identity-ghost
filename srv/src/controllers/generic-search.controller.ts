import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Logger,
    NotFoundException,
    Param,
    Post,
    Request,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Repository} from "typeorm";
import {InjectRepository} from "@nestjs/typeorm";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {Role} from "../entity/role.entity";
import {Action} from "../casl/actions.enum";
import {SecurityService} from "../casl/security.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SuperAdminGuard} from "../auth/super-admin.guard";
import {Group} from "../entity/group.entity";
import {SubjectEnum} from "../entity/subjectEnum";
import {App} from "../entity/app.entity";
import {Client} from "../entity/client.entity";
import {AuthContext} from "../casl/contexts";
import {buildWhere, getRelations, SearchFilter} from "./search-filter.utils";
import * as yup from "yup";
import {ValidationPipe} from "../validation/validation.pipe";

const logger = new Logger("GenericSearchController");

const ALLOWED_ENTITIES = new Set(Object.keys(SubjectEnum.entityMap));

const SearchQuerySchema = yup.object().shape({
    pageNo: yup.number().integer().min(0).optional(),
    pageSize: yup.number().integer().min(1).max(1000).optional(),
    where: yup.array().optional(),
    expand: yup.array().of(yup.string()).optional(),
    select: yup.mixed().optional(),
    orderBy: yup.array().optional(),
});

class SearchQueryBody {
    pageNo?: number;
    pageSize?: number;
    where?: SearchFilter[];
    expand?: string[];
    select?: string[] | string | null;
    orderBy?: any[];
}

@Controller("api/search")
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class GenericSearchController {
    private readonly repos: Record<string, Repository<any>>;

    constructor(
        @InjectRepository(User) usersRepo: Repository<User>,
        @InjectRepository(Tenant) tenantRepo: Repository<Tenant>,
        @InjectRepository(TenantMember) memberRepo: Repository<TenantMember>,
        @InjectRepository(Role) roleRepository: Repository<Role>,
        @InjectRepository(Group) groupRepository: Repository<Group>,
        @InjectRepository(App) appRepository: Repository<App>,
        @InjectRepository(Client) clientRepository: Repository<Client>,
        private readonly securityService: SecurityService,
    ) {
        this.repos = {
            Users: usersRepo,
            Tenants: tenantRepo,
            TenantMembers: memberRepo,
            Roles: roleRepository,
            Groups: groupRepository,
            Apps: appRepository,
            Clients: clientRepository,
        };
    }

    @Post("/:entity")
    async search(
        @Request() request: AuthContext,
        @Param("entity") entity: string,
        @Body(new ValidationPipe(SearchQuerySchema)) query: SearchQueryBody,
    ): Promise<any> {
        if (!ALLOWED_ENTITIES.has(entity)) {
            throw new NotFoundException(`Resource ${entity} not found`);
        }

        const subject = SubjectEnum.getSubject(entity);
        this.securityService.isAuthorized(request, Action.Read, subject);

        const repo = this.repos[entity];
        const pageNo = query.pageNo ?? 0;
        const pageSize = query.pageSize ?? 30;
        const whereClause = buildWhere(entity, query.where ?? []);
        const relations = getRelations(entity, query.expand ?? []);

        if (query.select === "count") {
            const count = await repo.count({where: whereClause});
            return {count};
        }

        const [data, totalCount] = await repo.findAndCount({
            skip: pageNo * pageSize,
            take: pageSize,
            where: whereClause,
            relations,
        });

        return {
            pageNo,
            pageSize,
            data,
            totalCount,
        };
    }
}
