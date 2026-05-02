import {MigrationInterface, QueryRunner, Table, TableColumn, TableIndex} from "typeorm";

export class CreateLoginSessionsTable1756000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";

        // 1. Create login_sessions table
        await queryRunner.createTable(
            new Table({
                name: "login_sessions",
                columns: [
                    {
                        name: "sid",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isPrimary: true,
                    },
                    {
                        name: "user_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "tenant_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "auth_time",
                        type: "integer",
                        isNullable: false,
                    },
                    {
                        name: "expires_at",
                        type: "datetime",
                        isNullable: false,
                    },
                    {
                        name: "invalidated_at",
                        type: "datetime",
                        isNullable: true,
                    },
                    {
                        name: "created_at",
                        type: "timestamp",
                        default: "now()",
                    },
                ],
                indices: [
                    new TableIndex({
                        name: "IDX_login_sessions_user_id",
                        columnNames: ["user_id"],
                    }),
                    new TableIndex({
                        name: "IDX_login_sessions_tenant_id",
                        columnNames: ["tenant_id"],
                    }),
                ],
            }),
            true,
        );

        // 2. Add nullable sid column to auth_code table
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "sid",
                type: "varchar",
                length: "36",
                isNullable: true,
            }),
        );

        // 3. Add nullable sid column to refresh_tokens table
        await queryRunner.addColumn(
            "refresh_tokens",
            new TableColumn({
                name: "sid",
                type: "varchar",
                length: "36",
                isNullable: true,
            }),
        );

        // 4. Add index on refresh_tokens.sid
        await queryRunner.createIndex(
            "refresh_tokens",
            new TableIndex({
                name: "IDX_refresh_tokens_sid",
                columnNames: ["sid"],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index on refresh_tokens.sid
        await queryRunner.dropIndex("refresh_tokens", "IDX_refresh_tokens_sid");

        // Drop sid column from refresh_tokens
        await queryRunner.dropColumn("refresh_tokens", "sid");

        // Drop sid column from auth_code
        await queryRunner.dropColumn("auth_code", "sid");

        // Drop login_sessions table
        await queryRunner.dropTable("login_sessions");
    }

}
