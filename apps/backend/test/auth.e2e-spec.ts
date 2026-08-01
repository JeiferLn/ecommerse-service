import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { App } from "supertest/types";
import type {
  ApiResponse,
  AuthUser,
  CompanyInvitation,
  CompanyMember,
  InvitationInfo,
  InviteResult,
} from "@commerce-ai/types";
import { createHash, randomBytes } from "node:crypto";

import { AppModule } from "./../src/app.module";
import { HttpExceptionFilter } from "./../src/common/filters/http-exception.filter";
import { MailService } from "./../src/mail/mail.service";

describe("Auth & Companies (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const email = `e2e-${Date.now()}@test.com`;
  const memberEmail = `member-${Date.now()}@test.com`;
  const pendingEmail = `pending-${Date.now()}@test.com`;
  const expiredEmail = `expired-${Date.now()}@test.com`;
  const tokenEmail = `token-${Date.now()}@test.com`;
  const expiredTokenEmail = `expired-token-${Date.now()}@test.com`;
  const resetEmail = `reset-${Date.now()}@test.com`;
  const password = "password123";

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    // ConfigModule.forRoot recarga apps/backend/.env al crear la app y pisa
    // process.env, así que limpiar SMTP_* no alcanza: se sobreescribe MailService
    // con un stub para que los tests NUNCA envíen correos reales.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: jest.fn(({ to }: { to: string }) => {
          console.log(`[Preview] Password reset para ${to}`);
        }),
        sendCompanyInvitation: jest.fn(({ to }: { to: string }) => {
          console.log(`[Preview] Invitación para ${to}`);
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.enableCors({ origin: ["http://localhost:3000"], credentials: true });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    const allEmails = [
      email,
      memberEmail,
      pendingEmail,
      expiredEmail,
      tokenEmail,
      expiredTokenEmail,
      resetEmail,
    ];
    for (const mail of allEmails) {
      await prisma.refreshToken.deleteMany({ where: { user: { email: mail } } });
      await prisma.passwordResetToken.deleteMany({ where: { user: { email: mail } } });
      await prisma.companyMembership.deleteMany({ where: { user: { email: mail } } });
    }
    const companies = await prisma.companyMembership.findMany({
      where: { user: { email: { in: [email, memberEmail] } } },
      select: { companyId: true },
    });
    await prisma.invitation.deleteMany({
      where: { companyId: { in: companies.map((company) => company.companyId) } },
    });
    await prisma.invitation.deleteMany({
      where: { email: { in: [pendingEmail, expiredEmail, tokenEmail, expiredTokenEmail] } },
    });
    await prisma.user.deleteMany({ where: { email: { in: allEmails } } });
    await prisma.$disconnect();
    await app.close();
  });

  async function login(mail: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email: mail, password })
      .expect(200);
    return extractCookies(res.headers["set-cookie"] as unknown as string[]);
  }

  async function register(mail: string, companyName: string, companyType: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({ name: "E2E User", email: mail, password, companyName, companyType })
      .expect(201);
    return extractCookies(res.headers["set-cookie"] as unknown as string[]);
  }

  async function ownerCompanyId(): Promise<string> {
    const membership = await prisma.companyMembership.findFirst({
      where: { user: { email }, role: "owner" },
    });
    if (!membership) {
      throw new Error("La empresa del owner no existe");
    }
    return membership.companyId;
  }

  it("registra un usuario owner con su empresa y abre sesi�n", async () => {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        name: "E2E User",
        email,
        password,
        companyName: "Tienda E2E",
        companyType: "retail",
      })
      .expect(201);

    const body = res.body as ApiResponse<AuthUser>;
    expect(body.status).toBe("success");
    expect(body.data.email).toBe(email);
    expect(body.data.role).toBe("owner");
    expect(body.data.companyId).not.toBeNull();
    expect(body.data.companies).toHaveLength(1);
    expect(body.data.companies[0]).toEqual({
      id: body.data.companyId,
      name: "Tienda E2E",
      type: "retail",
      role: "owner",
    });

    const setCookies = res.headers["set-cookie"] as unknown as string[];
    expect(setCookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    expect(setCookies.some((cookie) => cookie.startsWith("refresh_token="))).toBe(true);

    const membership = await prisma.companyMembership.findFirst({
      where: { user: { email } },
      include: { company: true },
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("owner");
    expect(membership?.company.name).toBe("Tienda E2E");

    const me = await request(server())
      .get("/api/v1/auth/me")
      .set("Cookie", extractCookies(setCookies))
      .expect(200);
    const meBody = me.body as ApiResponse<AuthUser>;
    expect(meBody.data.email).toBe(email);
  });

  it("rechaza el registro con email duplicado", async () => {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        name: "Otro",
        email,
        password,
        companyName: "Otra Tienda",
        companyType: "technology",
      })
      .expect(409);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
    expect(body.message).toBe("Ya existe una cuenta con ese email");
  });

  it("rechaza el registro con tipo de empresa inv�lido", async () => {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        name: "Tipo Invalido",
        email: `invalid-${Date.now()}@test.com`,
        password,
        companyName: "Tienda X",
        companyType: "aerolinea",
      })
      .expect(400);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
  });

  it("rechaza el login con contrase�a incorrecta", async () => {
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
    expect(body.data.role).toBe("owner");
    expect(body.data.companies.length).toBeGreaterThanOrEqual(1);
    const setCookies = res.headers["set-cookie"] as unknown as string[];
    expect(setCookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    expect(setCookies.some((cookie) => cookie.startsWith("refresh_token="))).toBe(true);
    expect(setCookies.join(";")).toContain("HttpOnly");
  });

  it("obtiene /auth/me con sesi�n v�lida", async () => {
    const cookies = await login(email);

    const me = await request(server()).get("/api/v1/auth/me").set("Cookie", cookies).expect(200);

    const meBody = me.body as ApiResponse<AuthUser>;
    expect(meBody.data.email).toBe(email);
    expect(meBody.data.companyId).not.toBeNull();
  });

  it("rechaza /auth/me sin sesi�n", async () => {
    const res = await request(server()).get("/api/v1/auth/me").expect(401);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
  });

  it("rota el refresh token y renueva la sesi�n", async () => {
    const cookies = await login(email);
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

  it("rechaza el refresh con un token ya usado (rotaci�n)", async () => {
    const cookies = await login(email);
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

  it("cierra sesi�n y revoca el refresh token", async () => {
    const cookies = await login(email);

    await request(server()).post("/api/v1/auth/logout").set("Cookie", cookies).expect(200);

    await request(server()).post("/api/v1/auth/refresh").set("Cookie", cookies).expect(401);
  });

  it("solicita reset de contrase�a y crea un token en la base de datos", async () => {
    const res = await request(server())
      .post("/api/v1/auth/forgot-password")
      .send({ email })
      .expect(200);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("success");
    expect(body.data).toBeNull();

    const record = await prisma.passwordResetToken.findFirst({
      where: { user: { email } },
    });
    expect(record).not.toBeNull();
    expect(record?.tokenHash).toHaveLength(64);
    expect(record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("no revela si el email no existe", async () => {
    const res = await request(server())
      .post("/api/v1/auth/forgot-password")
      .send({ email: `missing-${Date.now()}@test.com` })
      .expect(200);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("success");
    expect(body.data).toBeNull();
  });

  it("rechaza forgot-password con email inv�lido", async () => {
    const res = await request(server())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "no-es-un-email" })
      .expect(400);

    const body = res.body as ApiResponse<null>;
    expect(body.status).toBe("error");
  });

  it("restablece la contrase�a con el token del correo", async () => {
    const newPassword = "newpassword123";
    const realToken = randomBytes(32).toString("hex");

    try {
      const cookies = await register(resetEmail, "Tienda Reset", "education");

      const user = await prisma.user.findUnique({ where: { email: resetEmail } });
      expect(user).not.toBeNull();

      await prisma.passwordResetToken.create({
        data: {
          tokenHash: createHash("sha256").update(realToken).digest("hex"),
          userId: user!.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      const res = await request(server())
        .post("/api/v1/auth/reset-password")
        .send({ token: realToken, password: newPassword })
        .expect(200);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("success");

      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: resetEmail, password: newPassword })
        .expect(200);

      await request(server())
        .post("/api/v1/auth/login")
        .send({ email: resetEmail, password })
        .expect(401);

      await request(server())
        .post("/api/v1/auth/reset-password")
        .send({ token: realToken, password: newPassword })
        .expect(400);

      expect(cookies).toBeTruthy();
    } finally {
      await prisma.refreshToken.deleteMany({ where: { user: { email: resetEmail } } });
      await prisma.passwordResetToken.deleteMany({ where: { user: { email: resetEmail } } });
      await prisma.companyMembership.deleteMany({ where: { user: { email: resetEmail } } });
      await prisma.user.deleteMany({ where: { email: resetEmail } });
    }
  });

  describe("miembros e invitaciones", () => {
    let ownerCookies: string;

    beforeAll(async () => {
      ownerCookies = await login(email);
    });

    it("el owner ve sus miembros (solo �l inicialmente)", async () => {
      const res = await request(server())
        .get("/api/v1/company/members")
        .set("Cookie", ownerCookies)
        .expect(200);

      const body = res.body as ApiResponse<CompanyMember[]>;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.email).toBe(email);
      expect(body.data[0]?.role).toBe("owner");
    });

    it("rechaza invitaci�n con email inv�lido", async () => {
      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: "no-es-un-email" })
        .expect(400);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("invita a un usuario con cuenta y el invitado acepta desde el enlace", async () => {
      await register(memberEmail, "Tienda Member", "technology");

      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: memberEmail })
        .expect(201);

      const body = res.body as ApiResponse<InviteResult>;
      expect(body.data.status).toBe("pending");

      const membersBefore = await request(server())
        .get("/api/v1/company/members")
        .set("Cookie", ownerCookies)
        .expect(200);
      const membersBeforeBody = membersBefore.body as ApiResponse<CompanyMember[]>;
      expect(membersBeforeBody.data).toHaveLength(1);

      const invitation = await prisma.invitation.findUnique({
        where: {
          companyId_email: { companyId: await ownerCompanyId(), email: memberEmail },
        },
      });
      expect(invitation).not.toBeNull();

      const infoRes = await request(server())
        .get(`/api/v1/auth/invitation?token=${invitation!.token}`)
        .expect(200);
      const infoBody = infoRes.body as ApiResponse<InvitationInfo>;
      expect(infoBody.data.hasAccount).toBe(true);
      expect(infoBody.data.email).toBe(memberEmail);

      const conflict = await request(server())
        .post("/api/v1/auth/register-invited")
        .send({ name: "Invitado", password, token: invitation!.token })
        .expect(409);
      expect((conflict.body as ApiResponse<null>).status).toBe("error");

      const memberCookies = await login(memberEmail);

      const acceptRes = await request(server())
        .post("/api/v1/auth/invitations/accept")
        .set("Cookie", memberCookies)
        .send({ token: invitation!.token })
        .expect(200);

      const acceptBody = acceptRes.body as ApiResponse<AuthUser>;
      expect(acceptBody.data.role).toBe("user");
      expect(acceptBody.data.companyId).toBe(await ownerCompanyId());

      const acceptCookies = extractCookies(acceptRes.headers["set-cookie"] as unknown as string[]);
      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", acceptCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      expect(meBody.data.companies).toHaveLength(2);
      const joinedCompany = meBody.data.companies.find((company) => company.role === "user");
      expect(joinedCompany?.id).toBe(await ownerCompanyId());

      const leftover = await prisma.invitation.findUnique({
        where: { companyId_email: { companyId: await ownerCompanyId(), email: memberEmail } },
      });
      expect(leftover).toBeNull();

      const members = await request(server())
        .get("/api/v1/company/members")
        .set("Cookie", ownerCookies)
        .expect(200);
      const membersBody = members.body as ApiResponse<CompanyMember[]>;
      expect(membersBody.data).toHaveLength(2);
      const invited = membersBody.data.find((member) => member.email === memberEmail);
      expect(invited?.role).toBe("user");
    });

    it("rechaza invitar al mismo usuario dos veces", async () => {
      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: memberEmail })
        .expect(409);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("rechaza invitar a un administrador de la plataforma", async () => {
      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: "admin@admin.com" })
        .expect(400);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("deja invitaci�n pendiente para un email sin cuenta", async () => {
      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: pendingEmail })
        .expect(201);

      const body = res.body as ApiResponse<InviteResult>;
      expect(body.data.status).toBe("pending");

      const record = await prisma.invitation.findFirst({
        where: { email: pendingEmail },
        include: { company: true },
      });
      expect(record).not.toBeNull();

      const res2 = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: pendingEmail })
        .expect(409);

      const body2 = res2.body as ApiResponse<null>;
      expect(body2.status).toBe("error");
    });

    it("rechaza aceptar una invitación con la sesión de otro email", async () => {
      const invitation = await prisma.invitation.findUnique({
        where: { companyId_email: { companyId: await ownerCompanyId(), email: pendingEmail } },
      });
      expect(invitation).not.toBeNull();

      const res = await request(server())
        .post("/api/v1/auth/invitations/accept")
        .set("Cookie", ownerCookies)
        .send({ token: invitation!.token })
        .expect(403);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("el owner ve las invitaciones pendientes y un miembro no", async () => {
      const list = await request(server())
        .get("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .expect(200);

      const body = list.body as ApiResponse<CompanyInvitation[]>;
      expect(body.data.some((invitation) => invitation.email === pendingEmail)).toBe(true);

      const memberCookies = await login(memberEmail);
      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", memberCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      const joinedCompany = meBody.data.companies.find((company) => company.role === "user");
      expect(joinedCompany).toBeDefined();

      const switched = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", memberCookies)
        .send({ companyId: joinedCompany!.id })
        .expect(200);
      const switchedCookies = extractCookies(switched.headers["set-cookie"] as unknown as string[]);

      const forbidden = await request(server())
        .get("/api/v1/company/invitations")
        .set("Cookie", switchedCookies)
        .expect(403);
      const forbiddenBody = forbidden.body as ApiResponse<null>;
      expect(forbiddenBody.status).toBe("error");
    });

    it("las invitaciones expiradas desaparecen de la lista y permiten re-invitar", async () => {
      const membership = await prisma.companyMembership.findFirst({
        where: { user: { email }, role: "owner" },
      });
      expect(membership).not.toBeNull();

      await prisma.invitation.create({
        data: {
          token: `token-${Date.now()}`,
          companyId: membership!.companyId,
          email: expiredEmail,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const list = await request(server())
        .get("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .expect(200);
      const listBody = list.body as ApiResponse<CompanyInvitation[]>;
      expect(listBody.data.some((invitation) => invitation.email === expiredEmail)).toBe(false);

      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: expiredEmail })
        .expect(201);
      const body = res.body as ApiResponse<InviteResult>;
      expect(body.data.status).toBe("pending");

      const record = await prisma.invitation.findUnique({
        where: { companyId_email: { companyId: membership!.companyId, email: expiredEmail } },
      });
      expect(record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("registrarse con una invitaci�n expirada crea su propia empresa", async () => {
      const membership = await prisma.companyMembership.findFirst({
        where: { user: { email }, role: "owner" },
      });
      expect(membership).not.toBeNull();

      await prisma.invitation.update({
        where: {
          companyId_email: { companyId: membership!.companyId, email: expiredEmail },
        },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({
          name: "Expirado User",
          email: expiredEmail,
          password,
          companyName: "Tienda Propia",
          companyType: "retail",
        })
        .expect(201);

      const body = res.body as ApiResponse<AuthUser>;
      expect(body.data.role).toBe("owner");
      expect(body.data.companies).toHaveLength(1);
      expect(body.data.companies[0]).toMatchObject({ name: "Tienda Propia", role: "owner" });

      const invitation = await prisma.invitation.findFirst({
        where: { email: expiredEmail },
      });
      expect(invitation).toBeNull();
    });

    it("el invitado consulta su invitaci�n por token y se registra", async () => {
      await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: tokenEmail })
        .expect(201);

      const invitation = await prisma.invitation.findUnique({
        where: { companyId_email: { companyId: await ownerCompanyId(), email: tokenEmail } },
      });
      expect(invitation).not.toBeNull();
      expect(invitation?.token).toHaveLength(64);

      const infoRes = await request(server())
        .get(`/api/v1/auth/invitation?token=${invitation!.token}`)
        .expect(200);
      const infoBody = infoRes.body as ApiResponse<InvitationInfo>;
      expect(infoBody.data.email).toBe(tokenEmail);
      expect(infoBody.data.companyName).toBe("Tienda E2E");
      expect(infoBody.data.hasAccount).toBe(false);

      const res = await request(server())
        .post("/api/v1/auth/register-invited")
        .send({
          name: "Invitado Token",
          password,
          token: invitation!.token,
        })
        .expect(201);

      const body = res.body as ApiResponse<AuthUser>;
      expect(body.data.role).toBe("user");
      expect(body.data.email).toBe(tokenEmail);
      expect(body.data.companies).toHaveLength(1);
      expect(body.data.companies[0]).toMatchObject({ name: "Tienda E2E", role: "user" });

      const cookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);
      expect(cookies).toContain("access_token");

      const me = await request(server()).get("/api/v1/auth/me").set("Cookie", cookies).expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      expect(meBody.data.role).toBe("user");
      expect(meBody.data.companyId).toBe(await ownerCompanyId());

      const leftover = await prisma.invitation.findUnique({
        where: { companyId_email: { companyId: await ownerCompanyId(), email: tokenEmail } },
      });
      expect(leftover).toBeNull();
    });

    it("un invitado sin empresa propia crea la suya desde el dashboard", async () => {
      const invitedCookies = await login(tokenEmail);
      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", invitedCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      expect(meBody.data.role).toBe("user");
      expect(meBody.data.companies).toHaveLength(1);

      const res = await request(server())
        .post("/api/v1/company")
        .set("Cookie", invitedCookies)
        .send({ name: "Mi Empresa Propia", companyType: "technology" })
        .expect(201);

      const body = res.body as ApiResponse<AuthUser>;
      expect(body.data.role).toBe("owner");
      expect(body.data.companies).toHaveLength(2);
      const ownCompany = body.data.companies.find((company) => company.role === "owner");
      expect(ownCompany?.name).toBe("Mi Empresa Propia");
      expect(body.data.companyId).toBe(ownCompany?.id);

      const createdCookies = extractCookies(res.headers["set-cookie"] as unknown as string[]);
      const meAfter = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", createdCookies)
        .expect(200);
      const meAfterBody = meAfter.body as ApiResponse<AuthUser>;
      expect(meAfterBody.data.role).toBe("owner");
      expect(meAfterBody.data.companyId).toBe(ownCompany?.id);
    });

    it("rechaza crear una segunda empresa siendo dueño", async () => {
      const res = await request(server())
        .post("/api/v1/company")
        .set("Cookie", ownerCookies)
        .send({ name: "Otra Empresa", companyType: "retail" })
        .expect(409);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("rechaza crear empresa a un administrador", async () => {
      const adminRes = await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "admin@admin.com", password: "admin@admin.com" })
        .expect(200);
      const adminCookies = extractCookies(adminRes.headers["set-cookie"] as unknown as string[]);

      const res = await request(server())
        .post("/api/v1/company")
        .set("Cookie", adminCookies)
        .send({ name: "Empresa Admin", companyType: "retail" })
        .expect(400);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("rechaza un token de invitaci�n inv�lido", async () => {
      const res = await request(server())
        .get("/api/v1/auth/invitation?token=token-inexistente")
        .expect(404);
      expect((res.body as ApiResponse<null>).status).toBe("error");

      const registerRes = await request(server())
        .post("/api/v1/auth/register-invited")
        .send({ name: "Invitado", password, token: "token-inexistente" })
        .expect(404);
      expect((registerRes.body as ApiResponse<null>).status).toBe("error");
    });

    it("rechaza una invitaci�n expirada por token", async () => {
      const membership = await prisma.companyMembership.findFirst({
        where: { user: { email }, role: "owner" },
      });
      expect(membership).not.toBeNull();

      await prisma.invitation.create({
        data: {
          token: "expired-token-1234",
          companyId: membership!.companyId,
          email: expiredTokenEmail,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const infoRes = await request(server())
        .get("/api/v1/auth/invitation?token=expired-token-1234")
        .expect(410);
      expect((infoRes.body as ApiResponse<null>).status).toBe("error");

      await prisma.invitation.create({
        data: {
          token: "expired-token-5678",
          companyId: membership!.companyId,
          email: expiredTokenEmail,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const registerRes = await request(server())
        .post("/api/v1/auth/register-invited")
        .send({ name: "Invitado", password, token: "expired-token-5678" })
        .expect(410);
      expect((registerRes.body as ApiResponse<null>).status).toBe("error");
    });

    it("cancela una invitaci�n pendiente", async () => {
      const cancelledEmail = `cancelled-${Date.now()}@test.com`;

      await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .send({ email: cancelledEmail })
        .expect(201);

      const list = await request(server())
        .get("/api/v1/company/invitations")
        .set("Cookie", ownerCookies)
        .expect(200);
      const listBody = list.body as ApiResponse<CompanyInvitation[]>;
      const target = listBody.data.find((invitation) => invitation.email === cancelledEmail);
      expect(target).toBeDefined();

      const cancel = await request(server())
        .delete(`/api/v1/company/invitations/${target!.id}`)
        .set("Cookie", ownerCookies)
        .expect(200);
      const cancelBody = cancel.body as ApiResponse<InviteResult>;
      expect(cancelBody.data.status).toBe("cancelled");

      const record = await prisma.invitation.findUnique({ where: { id: target!.id } });
      expect(record).toBeNull();

      const missing = await request(server())
        .delete(`/api/v1/company/invitations/${target!.id}`)
        .set("Cookie", ownerCookies)
        .expect(404);
      expect((missing.body as ApiResponse<null>).status).toBe("error");
    });

    it("no permite cancelar la invitaci�n de otra empresa", async () => {
      const memberCookies = await login(memberEmail);
      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", memberCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      const ownCompany = meBody.data.companies.find((company) => company.role === "owner");
      expect(ownCompany).toBeDefined();

      const switched = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", memberCookies)
        .send({ companyId: ownCompany!.id })
        .expect(200);
      const switchedCookies = extractCookies(switched.headers["set-cookie"] as unknown as string[]);

      await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", switchedCookies)
        .send({ email: `cross-${Date.now()}@test.com` })
        .expect(201);

      const list = await request(server())
        .get("/api/v1/company/invitations")
        .set("Cookie", switchedCookies)
        .expect(200);
      const listBody = list.body as ApiResponse<CompanyInvitation[]>;
      const foreignInvitation = listBody.data.find((invitation) =>
        invitation.email.startsWith("cross-"),
      );
      expect(foreignInvitation).toBeDefined();

      const forbidden = await request(server())
        .delete(`/api/v1/company/invitations/${foreignInvitation!.id}`)
        .set("Cookie", ownerCookies)
        .expect(404);
      expect((forbidden.body as ApiResponse<null>).status).toBe("error");
    });

    it("al registrarse con el email invitado se une a la empresa", async () => {
      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({
          name: "Pendiente User",
          email: pendingEmail,
          password,
          companyName: "No importa",
          companyType: "retail",
        })
        .expect(201);

      const body = res.body as ApiResponse<AuthUser>;
      expect(body.data.role).toBe("user");

      const pendingUser = await prisma.user.findUnique({ where: { email: pendingEmail } });
      expect(pendingUser?.role).toBe("user");
      const membership = await prisma.companyMembership.findFirst({
        where: { user: { email: pendingEmail } },
      });
      expect(membership?.role).toBe("user");
      const invitation = await prisma.invitation.findFirst({ where: { email: pendingEmail } });
      expect(invitation).toBeNull();
    });

    it("solo el owner puede invitar", async () => {
      const memberCookies = await login(memberEmail);
      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", memberCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      const joinedCompany = meBody.data.companies.find((company) => company.role === "user");
      expect(joinedCompany).toBeDefined();

      const switched = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", memberCookies)
        .send({ companyId: joinedCompany!.id })
        .expect(200);
      const switchedCookies = extractCookies(switched.headers["set-cookie"] as unknown as string[]);

      const res = await request(server())
        .post("/api/v1/company/invitations")
        .set("Cookie", switchedCookies)
        .send({ email: "alguien@test.com" })
        .expect(403);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("un miembro con empresa propia alterna entre empresas", async () => {
      const memberCookies = await login(memberEmail);

      const me = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", memberCookies)
        .expect(200);
      const meBody = me.body as ApiResponse<AuthUser>;
      expect(meBody.data.companies).toHaveLength(2);
      const memberCompany = meBody.data.companies.find((company) => company.role === "owner");
      const joinedCompany = meBody.data.companies.find((company) => company.role === "user");
      expect(memberCompany).toBeDefined();
      expect(joinedCompany).toBeDefined();
      expect(meBody.data.role).toBe("owner");
      expect(meBody.data.companyId).toBe(memberCompany?.id);

      const switched = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", memberCookies)
        .send({ companyId: joinedCompany!.id })
        .expect(200);

      const switchedBody = switched.body as ApiResponse<AuthUser>;
      expect(switchedBody.data.role).toBe("user");
      expect(switchedBody.data.companyId).toBe(joinedCompany?.id);

      const switchedCookies = extractCookies(switched.headers["set-cookie"] as unknown as string[]);
      const meAfter = await request(server())
        .get("/api/v1/auth/me")
        .set("Cookie", switchedCookies)
        .expect(200);
      const meAfterBody = meAfter.body as ApiResponse<AuthUser>;
      expect(meAfterBody.data.role).toBe("user");
      expect(meAfterBody.data.companyId).toBe(joinedCompany?.id);

      const back = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", switchedCookies)
        .send({ companyId: memberCompany!.id })
        .expect(200);

      const backBody = back.body as ApiResponse<AuthUser>;
      expect(backBody.data.role).toBe("owner");
      expect(backBody.data.companyId).toBe(memberCompany?.id);
    });

    it("rechaza cambiar a una empresa de la que no es miembro", async () => {
      const res = await request(server())
        .post("/api/v1/company/switch")
        .set("Cookie", ownerCookies)
        .send({ companyId: "company-inexistente" })
        .expect(400);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });

    it("rechaza /company/members sin empresa (admin)", async () => {
      const adminRes = await request(server())
        .post("/api/v1/auth/login")
        .send({ email: "admin@admin.com", password: "admin@admin.com" })
        .expect(200);
      const adminCookies = extractCookies(adminRes.headers["set-cookie"] as unknown as string[]);

      const res = await request(server())
        .get("/api/v1/company/members")
        .set("Cookie", adminCookies)
        .expect(400);

      const body = res.body as ApiResponse<null>;
      expect(body.status).toBe("error");
    });
  });
});

function extractCookies(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}
