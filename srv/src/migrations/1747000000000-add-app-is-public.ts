import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddAppIsPublic1747000000000 implements MigrationInterface {
    name = 'AddAppIsPublic1747000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "apps",
            new TableColumn({
                name: "is_public",
                type: "boolean",
                isNullable: false,
                default: false,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("apps", "is_public");
    }
} 