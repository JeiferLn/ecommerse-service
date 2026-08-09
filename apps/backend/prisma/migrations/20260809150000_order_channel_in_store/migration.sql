-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('whatsapp', 'in_store');

-- CreateEnum
CREATE TYPE "InStorePaymentMethod" AS ENUM ('cash', 'card', 'transfer', 'other');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "Order" ADD COLUMN "inStorePaymentMethod" "InStorePaymentMethod";
ALTER TABLE "Order" ALTER COLUMN "customerWaId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Order_companyId_channel_idx" ON "Order"("companyId", "channel");
