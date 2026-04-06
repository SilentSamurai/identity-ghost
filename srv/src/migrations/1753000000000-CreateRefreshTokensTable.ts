import {MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique} from "typeorm";

export class CreateRefreshTokensTable1753000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";
        const DB_UUID_GENERATOR = "uuid_generate_v4()";

        await queryRunner.createTable(
            new Table({
                name: "refresh_tokens",
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
                        name: "token_hash",
                        type: DB_STRING_TYPE,
                        isNullable: false,
                    },
                    {
                        name: "family_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "parent_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: true,
                    },
                    {
                        name: "user_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "client_id",
                        type: DB_STRING_TYPE,
                        isNullable: false,
                    },
                    {
                        name: "tenant_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "scope",
                        type: DB_STRING_TYPE,
                        isNullable: false,
                    },
                    {
                        name: "absolute_expires_at",
                        type: "datetime",
                        isNullable: false,
                    },
                    {
                        name: "expires_at",
                        type: "datetime",
                        isNullable: false,
                    },
                    {
                        name: "revoked",
                        type: "boolean",
                        default: false,
                    },
                    {
                        name: "used_at",
                        type: "datetime",
                        isNullable: true,
                    },
                    {
                        name: "created_at",
                        type: "timestamp",
                        default: "now()",
                    },
                ],
                uniques: [
                    new TableUnique({
                        name: "UQ_refresh_tokens_parent_id",
                        columnNames: ["parent_id"],
                    }),
                ],
                indices: [
                    new TableIndex({
                        name: "IDX_refresh_tokens_token_hash",
                        columnNames: ["token_hash"],
                    }),
                    new TableIndex({
                        name: "IDX_refresh_tokens_family_id",
                        columnNames: ["family_id"],
                    }),
                ],
                foreignKeys: [
                    new TableForeignKey({
                        name: "FK_refresh_tokens_user",
                        columnNames: ["user_id"],
                        referencedTableName: "users",
                        referencedColumnNames: ["id"],
                        onDelete: "CASCADE",
                    }),
                ],
            }),
            true,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("refresh_tokens");
    }

}
