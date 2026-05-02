import {MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex, TableUnique} from "typeorm";

export class CreateTenantKeysAndDropLegacyColumns1754000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";
        const DB_UUID_GENERATOR = "uuid_generate_v4()";

        await queryRunner.createTable(
            new Table({
                name: "tenant_keys",
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
                        name: "tenant_id",
                        type: DB_STRING_TYPE,
                        length: "36",
                        isNullable: false,
                    },
                    {
                        name: "key_version",
                        type: "int",
                        isNullable: false,
                    },
                    {
                        name: "kid",
                        type: DB_STRING_TYPE,
                        length: "64",
                        isNullable: false,
                    },
                    {
                        name: "public_key",
                        type: "text",
                        isNullable: false,
                    },
                    {
                        name: "private_key",
                        type: "text",
                        isNullable: false,
                    },
                    {
                        name: "is_current",
                        type: "boolean",
                        isNullable: false,
                        default: false,
                    },
                    {
                        name: "created_at",
                        type: "timestamp",
                        isNullable: false,
                        default: "now()",
                    },
                    {
                        name: "superseded_at",
                        type: "timestamp",
                        isNullable: true,
                    },
                    {
                        name: "deactivated_at",
                        type: "timestamp",
                        isNullable: true,
                    },
                ],
                uniques: [
                    new TableUnique({
                        name: "UQ_tenant_keys_tenant_version",
                        columnNames: ["tenant_id", "key_version"],
                    }),
                    new TableUnique({
                        name: "UQ_tenant_keys_kid",
                        columnNames: ["kid"],
                    }),
                ],
                foreignKeys: [
                    new TableForeignKey({
                        name: "FK_tenant_keys_tenant",
                        columnNames: ["tenant_id"],
                        referencedTableName: "tenants",
                        referencedColumnNames: ["id"],
                        onDelete: "CASCADE",
                    }),
                ],
            }),
            true,
        );

        // Partial indexes
        await queryRunner.createIndex(
            "tenant_keys",
            new TableIndex({
                name: "IDX_tenant_keys_tenant_active",
                columnNames: ["tenant_id"],
                where: "deactivated_at IS NULL",
            }),
        );

        await queryRunner.createIndex(
            "tenant_keys",
            new TableIndex({
                name: "IDX_tenant_keys_tenant_current",
                columnNames: ["tenant_id"],
                where: "is_current = true",
            }),
        );

        await queryRunner.createIndex(
            "tenant_keys",
            new TableIndex({
                name: "IDX_tenant_keys_kid",
                columnNames: ["kid"],
                where: "deactivated_at IS NULL",
            }),
        );

        await queryRunner.createIndex(
            "tenant_keys",
            new TableIndex({
                name: "IDX_tenant_keys_superseded_cleanup",
                columnNames: ["superseded_at"],
                where: "deactivated_at IS NULL AND is_current = false",
            }),
        );

        // Drop legacy key columns from tenants table
        await queryRunner.dropColumn("tenants", "private_key");
        await queryRunner.dropColumn("tenants", "public_key");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const DB_STRING_TYPE = "VARCHAR";

        // Re-add legacy key columns to tenants table
        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "private_key",
                type: DB_STRING_TYPE,
                isNullable: true,
            }),
        );

        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "public_key",
                type: DB_STRING_TYPE,
                isNullable: true,
            }),
        );

        // Drop tenant_keys table (cascades indexes, constraints)
        await queryRunner.dropTable("tenant_keys");
    }

}
