import {MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableUnique} from "typeorm";

export class AddAppClientIdentity1770000000000 implements MigrationInterface {
    name = 'AddAppClientIdentity1770000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add client_id column to apps table (NOT NULL since no existing apps need migration)
        await queryRunner.addColumn(
            "apps",
            new TableColumn({
                name: "client_id",
                type: "VARCHAR",
                isNullable: false,
            }),
        );

        // Add unique constraint on client_id
        await queryRunner.createUniqueConstraint(
            "apps",
            new TableUnique({
                name: "UQ_apps_client_id",
                columnNames: ["client_id"],
            }),
        );

        // Add foreign key to clients table
        await queryRunner.createForeignKey(
            "apps",
            new TableForeignKey({
                name: "FK_apps_client_id",
                columnNames: ["client_id"],
                referencedTableName: "clients",
                referencedColumnNames: ["id"],
                onDelete: "RESTRICT",
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("apps");
        
        const fk = table?.foreignKeys.find(fk => fk.columnNames.indexOf("client_id") !== -1);
        if (fk) {
            await queryRunner.dropForeignKey("apps", fk);
        }
        
        const unique = table?.uniques.find(u => u.columnNames.indexOf("client_id") !== -1);
        if (unique) {
            await queryRunner.dropUniqueConstraint("apps", unique);
        }
        
        await queryRunner.dropColumn("apps", "client_id");
    }
}
