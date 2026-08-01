import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { App } from "supertest/types";
import type { ApiResponse } from "@commerce-ai/types";

import { AppModule } from "./../src/app.module";
import type { HealthStatus } from "./../src/health/health.service";

describe("Health (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("/api/v1/health (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect((res) => {
        const body = res.body as ApiResponse<HealthStatus>;
        expect(body.status).toBe("success");
        expect(["up", "down"]).toContain(body.data.database);
      });
  });
});
