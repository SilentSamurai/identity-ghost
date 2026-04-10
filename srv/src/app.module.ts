import {MiddlewareConsumer, Module, NestModule, OnModuleInit} from "@nestjs/common";
import {ConfigModule} from "./config/config.module";
import {ScheduleModule} from "@nestjs/schedule";
import {TypeOrmModule} from "@nestjs/typeorm";
import {CaslModule} from "./casl/casl.module";
import {AuthModule} from "./auth/auth.module";
import {Environment} from "./config/environment.service";
import {LoggerMiddleware} from "./log/logger.middleware";
import {StartUpService} from "./startUp.service";
import {ControllersModule} from "./controllers/controller.module";
import {ServiceModule} from "./services/service.module";
import {migrations} from "./migrations/migrations";
import {entities} from "./entity/entities";

@Module({
    imports: [
        ConfigModule,
        // ServeStaticModule.forRootAsync(
        //     {
        //         inject: [ConfigService],
        //         useFactory: (configService: ConfigService) => {
        //             return [{rootPath: configService.getStaticPath()}];
        //         }
        //     }),
        ScheduleModule.forRoot(), // Initializes the scheduler and registers any declarative cron jobs, timeouts and intervals that exist within the app.
        TypeOrmModule.forRootAsync(
            // Get the configuration settings from the config service asynchronously.
            {
                imports: undefined,
                inject: [Environment],
                useFactory: (environment: Environment) => {
                    const sslEnvEnabled: boolean = environment.get(
                        "DATABASE_SSL",
                        false,
                    );
                    console.log(`db ssl value found: ${sslEnvEnabled}`);
                    return {
                        type: environment.get("DATABASE_TYPE"),
                        host: environment.get("DATABASE_HOST"),
                        port: environment.get("DATABASE_PORT"),
                        username: environment.get("DATABASE_USERNAME"),
                        password: environment.get("DATABASE_PASSWORD"),
                        database: environment.get("DATABASE_NAME"),
                        entities: entities,
                        migrations: migrations,
                        synchronize: false,
                        ssl: sslEnvEnabled
                            ? {rejectUnauthorized: false}
                            : false,
                        logging: environment.get("DATABASE_LOGGING"),
                        schema: environment.get("DATABASE_SCHEMA"),
                        extra: {
                            ssl: sslEnvEnabled
                                ? {rejectUnauthorized: false}
                                : false,
                        },
                    };
                },
            },
        ),
        CaslModule,
        ServiceModule,
        AuthModule,
        ControllersModule,
    ],
    controllers: [],
    providers: [StartUpService],
})
export class AppModule implements NestModule, OnModuleInit {
    constructor(private readonly configService: Environment) {}

    onModuleInit() {
        const lifetime = parseInt(this.configService.get("TOKEN_EXPIRATION_TIME_IN_SECONDS", "3600"), 10);
        const skew = parseInt(this.configService.get("JWT_CLOCK_SKEW_SECONDS", "30"), 10);
        if (lifetime <= skew) {
            throw new Error(
                `TOKEN_EXPIRATION_TIME_IN_SECONDS (${lifetime}) must be greater than ` +
                `JWT_CLOCK_SKEW_SECONDS (${skew}) to avoid issuing already-expired tokens`
            );
        }
    }

    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes("*");
    }
}
