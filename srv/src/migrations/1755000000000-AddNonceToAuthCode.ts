import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddNonceToAuthCode1755000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "nonce",
                type: "varchar",
                length: "512",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("auth_code", "nonce");
    }
}
