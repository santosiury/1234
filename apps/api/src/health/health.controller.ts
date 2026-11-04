import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiTags } from "@nestjs/swagger";
import type { HealthResponse } from "@omini/shared";
class HealthDto implements HealthResponse {
  @ApiProperty({ type: String, enum: ["ok"], example: "ok" }) status!: "ok";
  @ApiProperty({ type: String, format: "date-time" }) timestamp!: string;
}
@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({
    type: HealthDto,
    description: "Process liveness; does not check SQL Server.",
  })
  getHealth(): HealthResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
