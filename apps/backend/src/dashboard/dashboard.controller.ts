import { Controller, Get } from "@nestjs/common";
import type {
  ApiResponse,
  CompanyDashboardStats,
  PlatformDashboardStats,
} from "@commerce-ai/types";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { DashboardService } from "./dashboard.service";

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("company/stats")
  async companyStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<CompanyDashboardStats>> {
    return {
      status: "success",
      data: await this.dashboardService.getCompanyStats(user.companyId),
    };
  }

  @Roles("admin")
  @Get("admin/stats")
  async platformStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<PlatformDashboardStats>> {
    return {
      status: "success",
      data: await this.dashboardService.getPlatformStats(user.role),
    };
  }
}
