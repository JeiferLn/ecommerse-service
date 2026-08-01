-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '1 hour');
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" DROP DEFAULT;
