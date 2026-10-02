-- AlterTable
ALTER TABLE "Message" ADD COLUMN "interactive" JSONB;

-- CreateTable
CREATE TABLE "WhatsAppContentTemplate" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "contentSid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContentTemplate_hash_key" ON "WhatsAppContentTemplate"("hash");
