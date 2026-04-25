import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class RemoveTenantCredentialColumns1762000000000 implements MigrationInterface {
    name = 'RemoveTenantCredentialColumns1762000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("tenants", "client_id");
        await queryRunner.dropColumn("tenants", "client_secret");
        await queryRunner.dropColumn("tenants", "secret_salt");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Re-add columns as nullable since data cannot be restored
        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "client_id",
                type: "VARCHAR",
                isNullable: true,
            }),
        );

        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "client_secret",
                type: "VARCHAR",
                isNullable: true,
            }),
        );

        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "secret_salt",
                type: "VARCHAR",
                isNullable: true,
            }),
        );
    }
}
