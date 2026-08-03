import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import { hash } from "bcryptjs";
import request from "supertest";
import type { App } from "supertest/types";
import type { ApiResponse, ProductDetails } from "@commerce-ai/types";

import { AppModule } from "./../src/app.module";
import { HttpExceptionFilter } from "./../src/common/filters/http-exception.filter";
import { MailService } from "./../src/mail/mail.service";

describe("Catalog multi-tenant (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const ownerAEmail = `catalog-a-${stamp}@test.com`;
  const ownerBEmail = `catalog-b-${stamp}@test.com`;
  const userAEmail = `catalog-user-a-${stamp}@test.com`;
  const password = "password123";

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendPasswordReset: jest.fn(),
        sendCompanyInvitation: jest.fn(),
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
    const emails = [ownerAEmail, ownerBEmail, userAEmail];
    const memberships = await prisma.companyMembership.findMany({
      where: { user: { email: { in: emails } } },
      select: { companyId: true },
    });
    const companyIds = [...new Set(memberships.map((row) => row.companyId))];

    await prisma.productImage.deleteMany({ where: { product: { companyId: { in: companyIds } } } });
    await prisma.productVariant.deleteMany({
      where: { product: { companyId: { in: companyIds } } },
    });
    await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.invitation.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.refreshToken.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.passwordResetToken.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.companyMembership.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
    await app.close();
  });

  function extractCookies(setCookies: string[]): string {
    return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  async function register(email: string, companyName: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/register")
      .send({
        name: "Catalog Owner",
        email,
        password,
        companyName,
        companyType: "retail",
      })
      .expect(201);
    return extractCookies(res.headers["set-cookie"] as unknown as string[]);
  }

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return extractCookies(res.headers["set-cookie"] as unknown as string[]);
  }

  it("aísla productos entre empresas y bloquea escritura al rol user", async () => {
    const cookiesA = await register(ownerAEmail, `Tienda A ${stamp}`);
    const cookiesB = await register(ownerBEmail, `Tienda B ${stamp}`);

    const created = await request(server())
      .post("/api/v1/products")
      .set("Cookie", cookiesA)
      .send({
        name: "Producto A",
        status: "active",
        variants: [{ sku: "A-1", name: "Default", price: 10, stock: 3 }],
      })
      .expect(201);

    const product = (created.body as ApiResponse<ProductDetails>).data;
    expect(product.id).toBeDefined();

    await request(server())
      .get(`/api/v1/products/${product.id}`)
      .set("Cookie", cookiesB)
      .expect(404);

    await request(server())
      .patch(`/api/v1/products/${product.id}`)
      .set("Cookie", cookiesB)
      .send({ name: "Hack" })
      .expect(404);

    const companyA = await prisma.companyMembership.findFirst({
      where: { user: { email: ownerAEmail }, role: "owner" },
    });
    expect(companyA).not.toBeNull();

    const passwordHash = await hash(password, 10);
    const member = await prisma.user.create({
      data: {
        name: "Member User",
        email: userAEmail,
        passwordHash,
        role: "user",
      },
    });
    await prisma.companyMembership.create({
      data: {
        userId: member.id,
        companyId: companyA!.companyId,
        role: "user",
      },
    });

    const userCookies = await login(userAEmail);
    await request(server())
      .post("/api/v1/products")
      .set("Cookie", userCookies)
      .send({
        name: "No debería",
        variants: [{ sku: "U-1", name: "Default", price: 1, stock: 0 }],
      })
      .expect(403);

    await request(server())
      .get(`/api/v1/products/${product.id}`)
      .set("Cookie", userCookies)
      .expect(200);
  });
});
