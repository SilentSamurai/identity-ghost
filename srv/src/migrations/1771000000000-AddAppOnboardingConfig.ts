import {MigrationInterface, QueryRunner, TableColumn} from "typeorm";

export class AddAppOnboardingConfig1771000000000 implements MigrationInterface {
    name = 'AddAppOnboardingConfig1771000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add onboarding_enabled column (defaults to true for backward compatibility)
        await queryRunner.addColumn(
            "apps",
            new TableColumn({
                name: "onboarding_enabled",
                type: "boolean",
                isNullable: false,
                default: true,
            }),
        );

        // Add onboarding_callback_url column (nullable, when null uses appUrl)
        await queryRunner.addColumn(
            "apps",
            new TableColumn({
                name: "onboarding_callback_url",
                type: "varchar",
                isNullable: true,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("apps", "onboarding_callback_url");
        await queryRunner.dropColumn("apps", "onboarding_enabled");
    }
}
