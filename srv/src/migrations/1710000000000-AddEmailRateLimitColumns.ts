import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddEmailRateLimitColumns1710000000000 implements MigrationInterface {
    name = 'AddEmailRateLimitColumns1710000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("users", [
            new TableColumn({
                name: "email_count",
                type: "integer",
                default: 0,
                isNullable: false
            }),
            new TableColumn({
                name: "email_count_reset_at",
                type: "timestamp",
                isNullable: true
            })
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumns("users", ["email_count", "email_count_reset_at"]);
    }
} 