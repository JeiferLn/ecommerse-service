import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim());

  if (process.env.NODE_ENV !== "production") {
    const uploadDir = process.env.LOCAL_UPLOAD_DIR?.trim() || join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });
    app.useStaticAssets(uploadDir, { prefix: "/uploads/" });
  }

  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  return app;
}
