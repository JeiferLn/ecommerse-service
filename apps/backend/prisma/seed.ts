import { PrismaClient, UserRole, PlanCode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "admin@admin.com";

const PLANS = [
  {
    code: PlanCode.free,
    name: "Free",
    priceUsdCents: 0,
    maxMembers: 2,
    maxProducts: 30,
    maxVariants: 80,
    maxWaMessagesMonth: 100,
    maxAiRepliesMonth: 50,
    maxKnowledgeDocs: 1,
    sortOrder: 0,
  },
  {
    code: PlanCode.pro,
    name: "Pro",
    priceUsdCents: 3900,
    maxMembers: 5,
    maxProducts: 300,
    maxVariants: 1000,
    maxWaMessagesMonth: 2000,
    maxAiRepliesMonth: 1500,
    maxKnowledgeDocs: 5,
    sortOrder: 1,
  },
  {
    code: PlanCode.business,
    name: "Business",
    priceUsdCents: 9900,
    maxMembers: 25,
    maxProducts: 2000,
    maxVariants: 8000,
    maxWaMessagesMonth: 10000,
    maxAiRepliesMonth: 8000,
    maxKnowledgeDocs: 20,
    sortOrder: 2,
  },
] as const;

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

  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceUsdCents: plan.priceUsdCents,
        maxMembers: plan.maxMembers,
        maxProducts: plan.maxProducts,
        maxVariants: plan.maxVariants,
        maxWaMessagesMonth: plan.maxWaMessagesMonth,
        maxAiRepliesMonth: plan.maxAiRepliesMonth,
        maxKnowledgeDocs: plan.maxKnowledgeDocs,
        isPublic: true,
        sortOrder: plan.sortOrder,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceUsdCents: plan.priceUsdCents,
        maxMembers: plan.maxMembers,
        maxProducts: plan.maxProducts,
        maxVariants: plan.maxVariants,
        maxWaMessagesMonth: plan.maxWaMessagesMonth,
        maxAiRepliesMonth: plan.maxAiRepliesMonth,
        maxKnowledgeDocs: plan.maxKnowledgeDocs,
        isPublic: true,
        sortOrder: plan.sortOrder,
      },
    });
  }

  console.log(`Seed completado: ${ADMIN_EMAIL} (rol admin) + planes Free/Pro/Business`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
