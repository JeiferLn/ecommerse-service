import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "admin@admin.com";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: UserRole.admin },
    create: {
      name: "Administrador",
      email: ADMIN_EMAIL,
      passwordHash,
      role: UserRole.admin,
    },
  });

  console.log(`Seed completado: ${ADMIN_EMAIL} (rol admin)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
