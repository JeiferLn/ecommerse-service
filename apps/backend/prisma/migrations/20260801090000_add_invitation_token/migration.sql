-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "token" TEXT;
UPDATE "Invitation" SET "token" = md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text) WHERE "token" IS NULL;
ALTER TABLE "Invitation" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_token_key" UNIQUE ("token");
