import {
  Controller,
  Get,
  Inject,
  Ip,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { PrismaService } from "./prisma.service";
@ApiExcludeController()
@Controller("development/database")
export class DatabaseController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  @Get()
  async diagnose(@Ip() ip: string) {
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
    if (
      this.config.get("NODE_ENV") !== "development" ||
      !this.config.get("DB_DIAGNOSTICS_ENABLED") ||
      !loopback
    )
      throw new NotFoundException();
    const status = await this.prisma.diagnose();
    if (status === "unavailable")
      throw new ServiceUnavailableException("Database unavailable");
    return { status, timestamp: new Date().toISOString() };
  }
}
