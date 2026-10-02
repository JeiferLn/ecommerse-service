-- CreateEnum
CREATE TYPE "WhatsAppConnectionMode" AS ENUM ('shared', 'dedicated');

-- AlterTable
ALTER TABLE "WhatsAppConnection" ADD COLUMN "mode" "WhatsAppConnectionMode" NOT NULL DEFAULT 'dedicated';
ALTER TABLE "WhatsAppConnection" ADD COLUMN "storeCode" TEXT;

-- El número deja de ser único en general: varias tiendas comparten el de la plataforma.
DROP INDEX "WhatsAppConnection_twilioWhatsAppNumber_key";
CREATE INDEX "WhatsAppConnection_twilioWhatsAppNumber_idx" ON "WhatsAppConnection"("twilioWhatsAppNumber");
CREATE UNIQUE INDEX "WhatsAppConnection_dedicated_number_key" ON "WhatsAppConnection"("twilioWhatsAppNumber") WHERE "mode" = 'dedicated';
CREATE UNIQUE INDEX "WhatsAppConnection_storeCode_key" ON "WhatsAppConnection"("storeCode");

-- CreateTable
CREATE TABLE "SharedNumberSession" (
    "id" TEXT NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedNumberSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedNumberSession_customerWaId_key" ON "SharedNumberSession"("customerWaId");
CREATE INDEX "SharedNumberSession_connectionId_idx" ON "SharedNumberSession"("connectionId");

ALTER TABLE "SharedNumberSession" ADD CONSTRAINT "SharedNumberSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
