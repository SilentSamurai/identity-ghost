import {MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique} from "typeorm";

export class CreateUserConsentsTable1757000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";

        // Create user_consents table
        await queryRunner.createTable(
            new Table({
                name: "user_consents",
                columns: [
                    {
                        name: "id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isPrimary: true,
                        generationStrategy: "uuid",
                        default: "uuid_generate_v4()",
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
                        name: "granted_scopes",
                        type: DB_STRING_TYPE,
                        isNullable: false,
                    },
                    {
                        name: "consent_version",
                        type: "integer",
                        isNullable: false,
                        default: 1,
                    },
                    {
                        name: "created_at",
                        type: "timestamp",
                        default: "now()",
                    },
                    {
                        name: "updated_at",
                        type: "timestamp",
                        default: "now()",
                    },
                ],
                uniques: [
                    new TableUnique({
                        name: "UQ_user_consents_user_client",
                        columnNames: ["user_id", "client_id"],
                    }),
                ],
                indices: [
                    new TableIndex({
                        name: "IDX_user_consents_user_id",
                        columnNames: ["user_id"],
                    }),
                    new TableIndex({
                        name: "IDX_user_consents_client_id",
                        columnNames: ["client_id"],
                    }),
                ],
                foreignKeys: [
                    new TableForeignKey({
                        name: "FK_user_consents_user",
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
        await queryRunner.dropTable("user_consents");
    }

}
