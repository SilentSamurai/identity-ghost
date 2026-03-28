import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddUserLocked1749000000000 implements MigrationInterface {
    name = 'AddUserLocked1749000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "users",
            new TableColumn({
                name: "locked",
                type: "boolean",
                isNullable: false,
                default: false,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("users", "locked");
    }
}
