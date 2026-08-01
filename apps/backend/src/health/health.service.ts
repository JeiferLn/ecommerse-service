import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

export interface HealthStatus {
  status: "ok";
  database: "up" | "down";
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    let database: "up" | "down" = "up";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "down";
    }

    return { status: "ok", database };
  }
}
