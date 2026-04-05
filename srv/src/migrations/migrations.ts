import {CreateInitialTables1681147242561} from "./1681147242561-initial-creation";
import {SessionMigration1684308185392} from "./1684308185392-session-migration";
import {Migrations1718012430697} from "./1718012430697-migrations";
import {CreateAuthorizationTable1698765432100} from "./CreateAuthorizationTable1698765432100";
import {AddDescriptionToRoles1699999999999} from "./1699999999999-add-description-to-roles";
import {SubscriptionAndApps1744497534374} from "./1744497534374-new-migration";
import {TenantLevelStorage1746655278354} from "./1746655278354-tenant-level-storage";
import {AddAppIsPublic1747000000000} from "./1747000000000-add-app-is-public";
import {AddSubscriberTenantHintToAuthCode1710000000000} from "./1710000000000-AddSubscriberTenantHintToAuthCode";
import {AddEmailRateLimitColumns1710000000000} from "./1710000000000-AddEmailRateLimitColumns";
import {CreateClientsTable1748000000000} from "./1748000000000-create-clients-table";
import {AddUserLocked1749000000000} from "./1749000000000-add-user-locked";
import {AddRedirectUriToAuthCode1750000000000} from "./1750000000000-AddRedirectUriToAuthCode";
import {AddAuthCodeBindingColumns1751000000000} from "./1751000000000-AddAuthCodeBindingColumns";

export const migrations = [
    CreateInitialTables1681147242561,
    SessionMigration1684308185392,
    Migrations1718012430697,
    CreateAuthorizationTable1698765432100,
    AddDescriptionToRoles1699999999999,
    SubscriptionAndApps1744497534374,
    TenantLevelStorage1746655278354,
    AddAppIsPublic1747000000000,
    AddSubscriberTenantHintToAuthCode1710000000000,
    AddEmailRateLimitColumns1710000000000,
    CreateClientsTable1748000000000,
    AddUserLocked1749000000000,
    AddRedirectUriToAuthCode1750000000000,
    AddAuthCodeBindingColumns1751000000000
];