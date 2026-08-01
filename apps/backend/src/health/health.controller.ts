import { Controller, Get } from "@nestjs/common";
import type { ApiResponse } from "@commerce-ai/types";

import { HealthService, type HealthStatus } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<ApiResponse<HealthStatus>> {
    return { status: "success", data: await this.healthService.check() };
  }
}
