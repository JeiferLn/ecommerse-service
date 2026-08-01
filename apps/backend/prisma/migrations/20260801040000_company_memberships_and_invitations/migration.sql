-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "companyId" TEXT;

-- AlterTable
DROP INDEX IF EXISTS "User_companyId_idx";
ALTER TABLE "User" DROP COLUMN "companyId";

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_companyId_email_key" ON "Invitation"("companyId", "email");

-- CreateIndex
CREATE INDEX "Invitation_companyId_idx" ON "Invitation"("companyId");
