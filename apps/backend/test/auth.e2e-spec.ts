import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

type AuthBody = {
  accessToken: string;
  refreshToken: string;
  user: { role: string; email: string };
};

type TokenBody = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@test.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra, consulta me, rota el refresh token y cierra sesión', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E Owner',
        email,
        password: 'password123',
        companyName: 'E2E Company',
        companyType: 'RETAIL',
      })
      .expect(201);

    const registerBody = register.body as AuthBody;
    expect(registerBody.user.role).toBe('OWNER');
    expect(registerBody.accessToken).toBeDefined();
    expect(registerBody.refreshToken).toBeDefined();

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${registerBody.accessToken}`)
      .expect(200)
      .expect((res) => {
        expect((res.body as { email: string }).email).toBe(email);
      });

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: registerBody.refreshToken })
      .expect(200);

    const refreshBody = refresh.body as TokenBody;
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.refreshToken).toBeDefined();

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshBody.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(401);
  });

  it('rechaza el uso repetido del mismo refresh token (rotación)', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E Rotation',
        email: `e2e-rotation-${Date.now()}@test.com`,
        password: 'password123',
        companyName: 'Rotation Company',
        companyType: 'SERVICES',
      })
      .expect(201);

    const refreshToken = (register.body as AuthBody).refreshToken;

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rechaza login con credenciales inválidas', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rechaza registro con correo duplicado', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E Owner',
        email,
        password: 'password123',
        companyName: 'Other Company',
        companyType: 'SERVICES',
      })
      .expect(409);
  });

  it('rechaza acceder a /auth/me sin token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
