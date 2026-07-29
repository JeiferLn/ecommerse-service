-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM (
  'RETAIL',
  'WHOLESALE',
  'SERVICES',
  'FOOD_BEVERAGE',
  'HEALTH_BEAUTY',
  'TECHNOLOGY',
  'OTHER'
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompanyType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Migrate Role enum: USER -> OWNER, keep ADMIN
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'OWNER', 'MEMBER');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"Role_new"
      ELSE 'OWNER'::"Role_new"
    END
  );

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Add company relation
ALTER TABLE "users" ADD COLUMN "companyId" TEXT;

CREATE INDEX "users_companyId_idx" ON "users"("companyId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
