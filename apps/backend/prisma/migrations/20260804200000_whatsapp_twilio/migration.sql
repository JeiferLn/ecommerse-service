-- Conexiones Meta no son compatibles con Twilio; se limpian hilos asociados.
DELETE FROM "Message";
DELETE FROM "Conversation";
DELETE FROM "WhatsAppConnection";

DROP INDEX IF EXISTS "WhatsAppConnection_phoneNumberId_key";

ALTER TABLE "WhatsAppConnection" DROP COLUMN IF EXISTS "phoneNumberId";
ALTER TABLE "WhatsAppConnection" DROP COLUMN IF EXISTS "wabaId";
ALTER TABLE "WhatsAppConnection" DROP COLUMN IF EXISTS "accessToken";

ALTER TABLE "WhatsAppConnection" ADD COLUMN "twilioWhatsAppNumber" TEXT NOT NULL;

CREATE UNIQUE INDEX "WhatsAppConnection_twilioWhatsAppNumber_key" ON "WhatsAppConnection"("twilioWhatsAppNumber");
