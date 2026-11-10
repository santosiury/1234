import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DATABASE_CLIENT_FACTORY,
  DatabaseClient,
  DatabaseClientFactory,
} from "./prisma.factory";
export type DatabaseStatus = "disabled" | "ok" | "unavailable";
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client?: DatabaseClient;
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DATABASE_CLIENT_FACTORY)
    private readonly factory: DatabaseClientFactory,
  ) {}
  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>("PERSISTENCE_ENABLED")) return;
    try {
      this.client = this.factory(
        this.config.getOrThrow<string>("DATABASE_URL"),
      );
      await this.client.$connect();
    } catch {
      this.logger.warn(
        "Database unavailable; process liveness and demo mode remain independent.",
      );
    }
  }
  orm(): DatabaseClient {
    if (!this.config.get<boolean>("PERSISTENCE_ENABLED"))
      throw new ServiceUnavailableException("Persistence unavailable");
    return (this.client ??= this.factory(
      this.config.getOrThrow<string>("DATABASE_URL"),
    ));
  }
  async diagnose(): Promise<DatabaseStatus> {
    if (!this.config.get<boolean>("PERSISTENCE_ENABLED")) return "disabled";
    try {
      // Retry initialization if adapter creation failed; a failed connection may recover later.
      this.client ??= this.factory(
        this.config.getOrThrow<string>("DATABASE_URL"),
      );
      await this.client.$queryRaw`SELECT 1 AS connected`;
      return "ok";
    } catch {
      return "unavailable";
    }
  }
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.$disconnect();
    } catch {
      this.logger.warn("Database disconnect did not complete.");
    }
  }
}
