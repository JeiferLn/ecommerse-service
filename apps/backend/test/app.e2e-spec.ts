import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import type { ApiResponse } from "@commerce-ai/types";

import { createApp } from "./../src/create-app";
import type { HealthStatus } from "./../src/health/health.service";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/api/v1/health (GET)", () => {
    return request(app.getHttpServer() as unknown as App)
      .get("/api/v1/health")
      .expect(200)
      .expect((res) => {
        const body = res.body as ApiResponse<HealthStatus>;
        expect(body.status).toBe("success");
        expect(["up", "down"]).toContain(body.data.database);
      });
  });
});
