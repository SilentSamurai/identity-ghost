import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddRedirectUriToAuthCode1750000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "auth_code",
            new TableColumn({
                name: "redirect_uri",
                type: "varchar",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("auth_code", "redirect_uri");
    }
}
       