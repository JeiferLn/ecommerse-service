import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@admin.com';
  const password = 'admin@admin.com';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Admin',
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      companyId: null,
    },
    create: {
      email,
      name: 'Admin',
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`Usuario admin listo: ${admin.email} (${admin.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
