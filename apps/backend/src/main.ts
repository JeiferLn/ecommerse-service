import { createApp } from "./create-app";

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
