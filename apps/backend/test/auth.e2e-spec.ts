import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import type { App } from "supertest/types";
import type { ApiResponse, AuthUser } from "@commerce-ai/types";

import { createApp } from "./../src/create-app";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const email = `e2e-${Date.now()}@test.com`;
  const password = "password123";

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it("registra un usuario con rol owner", async () => {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({ name: "E2E User", email, password })
      .expect(201);

    const body = res.body as ApiResponse<AuthUser>;
    expect(body.status).toBe("success");
    expect(body.data.email).toBe(email);
    expect(body.data.role).toBe("owner");
  });

  it("rechaza el registro con email duplicado", async () => {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({ name: "Otro", email, password })
      .expect(409);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
    expect(body.message).toBe("Ya existe una cuenta con ese email");
  });

  it("rechaza el login con contraseÃ±a incorrecta", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password: "wrongpass123" })
      .expect(401);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
  });

  it("hace login y establece cookies httpOnly", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const body = res.body as ApiResponse<AuthUser>;
    expect(body.data.email).toBe(email);
    const setCookies = res.headers["set-cookie"] as unknown as string[];
    expect(setCookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    expect(setCookies.some((cookie) => cookie.startsWith("refresh_token="))).toBe(true);
    expect(setCookies.join(";")).toContain("HttpOnly");
  });

  it("obtiene /auth/me con sesiÃ³n vÃ¡lida", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);

    const me = await request(server()).get("/api/v1/auth/me").set("Cookie", cookies).expect(200);

    const meBody = me.body as ApiResponse<AuthUser>;
    expect(meBody.data.email).toBe(email);
  });

  it("rechaza /auth/me sin sesiÃ³n", async () => {
    const res = await request(server()).get("/api/v1/auth/me").expect(401);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
  });

  it("rota el refresh token y renueva la sesiÃ³n", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);
    const oldRefresh = cookies
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("refresh_token="))!
      .split("=")[1];

    const refreshed = await request(server())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies)
      .expect(200);

    const newCookies = extractCookies(refreshed.headers["set-cookie"] as unknown as string[]);
    const newRefresh = newCookies
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("refresh_token="))!
      .split("=")[1];

    const refreshedBody = refreshed.body as ApiResponse<AuthUser>;
    expect(refreshedBody.data.email).toBe(email);
    expect(newRefresh).not.toBe(oldRefresh);

    const me = await request(server()).get("/api/v1/auth/me").set("Cookie", newCookies).expect(200);

    const meBody = me.body as ApiResponse<AuthUser>;
    expect(meBody.data.email).toBe(email);
  });

  it("rechaza el refresh con un token ya usado (rotaciÃ³n)", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);
    const oldRefresh = cookies
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("refresh_token="))!
      .split("=")[1];

    await request(server()).post("/api/v1/auth/refresh").set("Cookie", cookies).expect(200);

    await request(server())
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refresh_token=${oldRefresh}`)
      .expect(401);
  });

  it("cierra sesiÃ³n y revoca el refresh token", async () => {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const cookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);

    await request(server()).post("/api/v1/auth/logout").set("Cookie", cookies).expect(200);

    await request(server()).post("/api/v1/auth/refresh").set("Cookie", cookies).expect(401);
  });
});

function extractCookies(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}
