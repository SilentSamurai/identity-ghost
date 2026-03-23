import {MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique} from "typeorm";

export class CreateClientsTable1748000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";
        const DB_UUID_GENERATOR = "uuid_generate_v4()";

        await queryRunner.createTable(
            new Table({
                name: "clients",
                columns: [
                    {
                        name: "id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isPrimary: true,
                        generationStrategy: "uuid",
                        default: DB_UUID_GENERATOR,
                    },
                    {
                        name: "client_id",
                        type: DB_STRING_TYPE,
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: "client_secrets",
                        type: "json",
                        isNullable: true,
                    },
                    {
                        name: "redirect_uris",
                        type: "json",
                        isNullable: true,
                    },
                    {
                        name: "allowed_scopes",
                        type: DB_STRING_TYPE,
                        isNullable: true,
                    },
                    {
                        name: "grant_types",
                        type: DB_STRING_TYPE,
                        isNullable: true,
                    },
                    {
                        name: "response_types",
                        type: DB_STRING_TYPE,
                        isNullable: true,
                    },
                    {
                        name: "token_endpoint_auth_method",
                        type: DB_STRING_TYPE,
                        default: "'client_secret_basic'",
                    },
                    {
                        name: "is_public",
                        type: "boolean",
                        default: false,
                    },
                    {
                        name: "require_pkce",
                        type: "boolean",
                        default: false,
                    },
                    {
                        name: "allow_password_grant",
                        type: "boolean",
                        default: false,
                    },
                    {
                        name: "allow_refresh_token",
                        type: "boolean",
                        default: true,
                    },
                    {
                        name: "name",
                        type: DB_STRING_TYPE,
                        isNullable: true,
                    },
                    {
                        name: "created_at",
                        type: "timestamp",
                        default: "now()",
                    },
                    {
                        name: "tenant_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                ],
                uniques: [
                    new TableUnique({
                        name: "UQ_clients_client_id",
                        columnNames: ["client_id"],
                    }),
                ],
                foreignKeys: [
                    new TableForeignKey({
                        name: "FK_clients_tenant",
                        columnNames: ["tenant_id"],
                        referencedTableName: "tenants",
                        referencedColumnNames: ["id"],
                        onDelete: "CASCADE",
                    }),
                ],
            }),
            true,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("clients");
    }

}
