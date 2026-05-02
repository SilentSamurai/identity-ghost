import {BadRequestException, Logger} from "@nestjs/common";
import {Equal, ILike, In, IsNull, LessThan, LessThanOrEqual, MoreThan, MoreThanOrEqual, Not,} from "typeorm";
import {FindOperator} from "typeorm/find-options/FindOperator";

const logger = new Logger("SearchFilterUtils");

export class SearchFilter {
    label: string;
    field: string;
    operator: string;
    value: any;
}

enum FilterRule {
    EQUALS = "equals",
    NOT_EQUALS = "notEquals",
    GREATER_THAN = "greaterThan",
    GREATER_THAN_OR_EQUALS = "greaterThanEqual",
    LESS_THAN = "lessThan",
    LESS_THAN_OR_EQUALS = "lessThanEquals",
    LIKE = "contains",
    NOT_LIKE = "nlike",
    IN = "in",
    NOT_IN = "nin",
    IS_NULL = "isnull",
    IS_NOT_NULL = "isnotnull",
    MATCHES = "matches",
}

export function getCondition(
    operator: string,
    value: any,
): FindOperator<any> {
    switch (operator) {
        case FilterRule.IS_NULL:
            return IsNull();
        case FilterRule.IS_NOT_NULL:
            return Not(IsNull());
        case FilterRule.EQUALS:
            return Equal(value);
        case FilterRule.NOT_EQUALS:
            return Not(value);
        case FilterRule.GREATER_THAN:
            return MoreThan(value);
        case FilterRule.GREATER_THAN_OR_EQUALS:
            return MoreThanOrEqual(value);
        case FilterRule.LESS_THAN:
            return LessThan(value);
        case FilterRule.LESS_THAN_OR_EQUALS:
            return LessThanOrEqual(value);
        case FilterRule.LIKE:
            return ILike(`%${value}%`);
        case FilterRule.NOT_LIKE:
            return Not(ILike(`%${value}%`));
        case FilterRule.IN: {
            let parsed = value;
            if (typeof parsed === "string") {
                parsed = parsed.split(",");
            }
            if (Array.isArray(parsed)) {
                return In(parsed);
            }
            throw new BadRequestException(`Invalid value for IN filter: ${value}`);
        }
        case FilterRule.NOT_IN: {
            let parsed = value;
            if (typeof parsed === "string") {
                parsed = parsed.split(",");
            }
            if (Array.isArray(parsed)) {
                return Not(In(parsed));
            }
            throw new BadRequestException(`Invalid value for NOT_IN filter: ${value}`);
        }
        case FilterRule.MATCHES: {
            if (typeof value !== "string") {
                throw new BadRequestException("MATCHES filter requires a string value");
            }
            const newValue = value.replace(/\*/g, "%");
            return ILike(newValue);
        }
        default:
            throw new BadRequestException(`Unknown filter operator: ${operator}`);
    }
}

const RELATIONS: Record<string, Record<string, string>> = {
    Users: {
        Tenants: "tenants",
        tenants: "tenants",
    },
    Tenants: {},
    TenantMembers: {},
    Roles: {
        Users: "users",
        Tenants: "tenant",
        tenant: "tenant",
    },
    Groups: {
        Tenants: "tenant",
    },
    Apps: {
        owner: "owner",
        roles: "roles",
    },
    Clients: {
        tenant: "tenant",
    },
};

export function getRelations(entity: string, expand: string[]): Record<string, boolean> {
    const relations = RELATIONS[entity] || {};
    const result: Record<string, boolean> = {};
    for (const related of expand) {
        if (relations.hasOwnProperty(related)) {
            result[relations[related]] = true;
        }
    }
    return result;
}

export function buildWhere(entity: string, filters: SearchFilter[]): Record<string, any> {
    if (!filters || filters.length === 0) return {};

    const where: Record<string, any> = {};

    for (const filter of filters) {
        if (filter.field.includes("/")) {
            const names = filter.field.split("/").filter(n => n.length > 0);
            if (names.length !== 2) {
                logger.warn(`Invalid relation filter path: ${filter.field}`);
                continue;
            }
            let [fkEntity, fkField] = names;
            const relations = RELATIONS[entity] || {};
            if (relations.hasOwnProperty(fkEntity)) {
                fkEntity = relations[fkEntity];
            }
            // Merge into existing relation filter instead of overwriting
            if (!where[fkEntity]) {
                where[fkEntity] = {};
            }
            where[fkEntity][fkField] = getCondition(filter.operator, filter.value);
        } else {
            where[filter.field] = getCondition(filter.operator, filter.value);
        }
    }

    return where;
}
