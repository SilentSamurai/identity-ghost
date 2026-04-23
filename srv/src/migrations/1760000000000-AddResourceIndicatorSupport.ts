import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddResourceIndicatorSupport1760000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add allowed_resources column to clients table
        await queryRunner.addColumn(
            "clients",
            new TableColumn({
                name: "allowed_resources",
                type: "text",
                isNullable: true,
            }),
        );

        // Add resource column to auth_code table
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "resource",
                type: "varchar",
                length: "2048",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("auth_code", "resource");
        await queryRunner.dropColumn("clients", "allowed_resources");
    }
}
