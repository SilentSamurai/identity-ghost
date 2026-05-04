import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class MakeAuthCodePkceColumnsNullable1763000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Make code_challenge nullable (PKCE is optional for clients with requirePkce=false)
        await queryRunner.changeColumn(
            "auth_code",
            "code_challenge",
            new TableColumn({
                name: "code_challenge",
                type: "VARCHAR",
                isNullable: true,
                isUnique: false,
            }),
        );

        // Make method nullable (no method when no code_challenge)
        await queryRunner.changeColumn(
            "auth_code",
            "method",
            new TableColumn({
                name: "method",
                type: "VARCHAR",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.changeColumn(
            "auth_code",
            "code_challenge",
            new TableColumn({
                name: "code_challenge",
                type: "VARCHAR",
                isNullable: false,
                isUnique: true,
            }),
        );

        await queryRunner.changeColumn(
            "auth_code",
            "method",
            new TableColumn({
                name: "method",
                type: "VARCHAR",
                isNullable: false,
            }),
        );
    }
}
