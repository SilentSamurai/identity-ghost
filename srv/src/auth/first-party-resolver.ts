import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Client} from '../entity/client.entity';
import {Tenant} from '../entity/tenant.entity';

@Injectable()
export class FirstPartyResolver {
    constructor(
        @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    ) {}

    async isFirstParty(client: Client): Promise<boolean> {
        try {
            // A client is first-party if its alias matches its owning tenant's domain.
            // This covers both the super tenant's default client and every regular
            // tenant's own default client (the domain-alias client created at onboarding).
            // Third-party App_Clients have a UUID alias that never matches the tenant domain.
            const tenant = client.tenant
                ?? await this.tenants.findOne({where: {id: client.tenantId}});
            if (!tenant) return false;

            return client.alias === tenant.domain;
        } catch {
            return false;
        }
    }
}
