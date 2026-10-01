-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "waConnectionId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "isPlayground" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Conversation_companyId_isPlayground_idx" ON "Conversation"("companyId", "isPlayground");
