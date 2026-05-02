import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddRequireAuthTimeToAuthCode1759000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "require_auth_time",
                type: "boolean",
                default: false,
                isNullable: false,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("auth_code", "require_auth_time");
    }
}
