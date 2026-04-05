import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddAuthCodeBindingColumns1751000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "client_id",
                type: "varchar",
                isNullable: false,
                default: "''",
            }),
        );

        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "scope",
                type: "varchar",
                isNullable: true,
            }),
        );

        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "used",
                type: "boolean",
                isNullable: false,
                default: false,
            }),
        );

        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "used_at",
                type: "timestamp",
                isNullable: true,
            }),
        );

        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "expires_at",
                type: "timestamp",
                isNullable: false,
                default: "CURRENT_TIMESTAMP",
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("auth_code", "expires_at");
        await queryRunner.dropColumn("auth_code", "used_at");
        await queryRunner.dropColumn("auth_code", "used");
        await queryRunner.dropColumn("auth_code", "scope");
        await queryRunner.dropColumn("auth_code", "client_id");
    }
}
