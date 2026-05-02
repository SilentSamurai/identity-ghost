import {MigrationInterface, QueryRunner, TableColumn, TableUnique} from "typeorm";

export class AddAliasToClients1758000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "clients",
            new TableColumn({
                name: "alias",
                type: "VARCHAR",
                isNullable: true,
            }),
        );

        await queryRunner.createUniqueConstraint(
            "clients",
            new TableUnique({
                name: "UQ_clients_alias",
                columnNames: ["alias"],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropUniqueConstraint("clients", "UQ_clients_alias");
        await queryRunner.dropColumn("clients", "alias");
    }

}
