-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable companies: config inicial
ALTER TABLE "companies" ADD COLUMN "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN "address" TEXT;
ALTER TABLE "companies" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Bogota';

-- CreateTable
CREATE TABLE "company_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_invitations_tokenHash_key" ON "company_invitations"("tokenHash");
CREATE INDEX "company_invitations_companyId_idx" ON "company_invitations"("companyId");
CREATE INDEX "company_invitations_email_idx" ON "company_invitations"("email");

ALTER TABLE "company_invitations"
  ADD CONSTRAINT "company_invitations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_invitations"
  ADD CONSTRAINT "company_invitations_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
