import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Client} from '../entity/client.entity';
import {TenantService} from './tenant.service';
import {SecurityService} from '../casl/security.service';
import {AuthContext} from '../casl/contexts';
import {Action} from '../casl/actions.enum';
import {SubjectEnum} from '../entity/subjectEnum';
import {randomBytes, scryptSync, timingSafeEqual} from 'crypto';
import {v4 as uuidv4} from 'uuid';

@Injectable()
export class ClientService {
    constructor(
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
        private readonly tenantService: TenantService,
        private readonly securityService: SecurityService,
    ) {
    }

    async createClient(
        authContext: AuthContext,
        tenantId: string,
        name: string,
        redirectUris: string[],
        allowedScopes?: string,
        grantTypes?: string,
        responseTypes?: string,
        tokenEndpointAuthMethod?: string,
        isPublic?: boolean,
        requirePkce?: boolean,
        allowPasswordGrant?: boolean,
        allowRefreshToken?: boolean,
    ): Promise<{ client: Client; plainSecret: string | null }> {
        this.securityService.isAuthorized(authContext, Action.Create, SubjectEnum.CLIENT, {tenantId});

        const tenant = await this.tenantService.findById(authContext, tenantId);
        const clientId = uuidv4();

        let clientSecrets: { secret: string; salt: string; created_at: string; expires_at: string | null }[] = [];
        let plainSecret: string | null = null;

        if (!isPublic) {
            const generated = this.generateSecret();
            plainSecret = generated.plainSecret;
            clientSecrets = [{
                secret: generated.hashedSecret,
                salt: generated.salt,
                created_at: new Date().toISOString(),
                expires_at: null,
            }];
        }

        const client = this.clientRepository.create({
            clientId,
            clientSecrets,
            redirectUris: redirectUris || [],
            allowedScopes: allowedScopes || '',
            grantTypes: grantTypes || 'authorization_code',
            responseTypes: responseTypes || 'code',
            tokenEndpointAuthMethod: tokenEndpointAuthMethod || 'client_secret_basic',
            isPublic: isPublic || false,
            requirePkce: requirePkce || false,
            allowPasswordGrant: allowPasswordGrant || false,
            allowRefreshToken: allowRefreshToken !== undefined ? allowRefreshToken : true,
            name,
            tenant,
        });

        const saved = await this.clientRepository.save(client);
        return {client: saved, plainSecret};
    }

    async findByClientId(clientId: string): Promise<Client> {
        const client = await this.clientRepository.findOne({
            where: {clientId},
            relations: ['tenant'],
        });
        if (!client) {
            throw new NotFoundException(`Client with clientId ${clientId} not found`);
        }
        return client;
    }

    async findByTenantId(tenantId: string): Promise<Client[]> {
        return this.clientRepository.find({
            where: {tenant: {id: tenantId}},
            relations: ['tenant'],
        });
    }

    validateClientSecret(client: Client, secret: string): boolean {
        if (client.isPublic) {
            return true;
        }
        if (!client.clientSecrets || client.clientSecrets.length === 0) {
            return false;
        }
        const now = new Date();
        for (const entry of client.clientSecrets) {
            if (entry.expires_at && new Date(entry.expires_at) < now) {
                continue;
            }
            const buffer = scryptSync(secret, entry.salt, 64) as Buffer;
            if (timingSafeEqual(Buffer.from(entry.secret, 'hex'), buffer)) {
                return true;
            }
        }
        return false;
    }

    async rotateSecret(clientId: string): Promise<{ client: Client; plainSecret: string }> {
        const client = await this.findByClientId(clientId);

        const generated = this.generateSecret();

        // Set expiry on existing non-expired secrets (24h overlap window)
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        if (client.clientSecrets) {
            for (const entry of client.clientSecrets) {
                if (!entry.expires_at) {
                    entry.expires_at = expiresAt;
                }
            }
        }

        const newEntry = {
            secret: generated.hashedSecret,
            salt: generated.salt,
            created_at: now.toISOString(),
            expires_at: null,
        };

        client.clientSecrets = [...(client.clientSecrets || []), newEntry];
        const saved = await this.clientRepository.save(client);
        return {client: saved, plainSecret: generated.plainSecret};
    }

    async updateClient(
        authContext: AuthContext,
        clientId: string,
        updates: {
            name?: string;
            redirectUris?: string[];
            requirePkce?: boolean;
            allowPasswordGrant?: boolean;
            allowRefreshToken?: boolean;
        },
    ): Promise<Client> {
        const client = await this.findByClientId(clientId);
        this.securityService.isAuthorized(authContext, Action.Update, SubjectEnum.CLIENT, {tenantId: client.tenantId});
        if (updates.name !== undefined) client.name = updates.name;
        if (updates.redirectUris !== undefined) client.redirectUris = updates.redirectUris;
        if (updates.requirePkce !== undefined) client.requirePkce = updates.requirePkce;
        if (updates.allowPasswordGrant !== undefined) client.allowPasswordGrant = updates.allowPasswordGrant;
        if (updates.allowRefreshToken !== undefined) client.allowRefreshToken = updates.allowRefreshToken;
        return this.clientRepository.save(client);
    }

    async deleteClient(authContext: AuthContext, clientId: string): Promise<void> {
        const client = await this.findByClientId(clientId);
        this.securityService.isAuthorized(authContext, Action.Delete, SubjectEnum.CLIENT, {tenantId: client.tenantId});
        await this.clientRepository.remove(client);
    }

    private generateSecret(): { plainSecret: string; hashedSecret: string; salt: string } {
        const plainSecret = randomBytes(32).toString('hex');
        const salt = randomBytes(8).toString('hex');
        const buffer = scryptSync(plainSecret, salt, 64) as Buffer;
        return {plainSecret, hashedSecret: buffer.toString('hex'), salt};
    }
}
