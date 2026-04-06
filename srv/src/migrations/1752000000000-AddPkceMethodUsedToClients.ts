import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddPkceMethodUsedToClients1752000000000 implements MigrationInterface {
    name = 'AddPkceMethodUsedToClients1752000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "clients",
            new TableColumn({
                name: "pkce_method_used",
                type: "varchar",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("clients", "pkce_method_used");
    }
}