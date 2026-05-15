import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddSkipSessionConfirmToTenants1764000000000 implements MigrationInterface {
    name = 'AddSkipSessionConfirmToTenants1764000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Use db-agnostic TypeORM API
        await queryRunner.addColumn(
            "tenants",
            new TableColumn({
                name: "skip_session_confirm",
                type: "boolean",
                isNullable: false,
                default: false,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("tenants", "skip_session_confirm");
    }
}
