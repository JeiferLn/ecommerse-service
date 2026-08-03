-- CreateEnum
CREATE TYPE "ConversationHandler" AS ENUM ('pending', 'bot', 'human');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "handler" "ConversationHandler" NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "Conversation_companyId_handler_idx" ON "Conversation"("companyId", "handler");
