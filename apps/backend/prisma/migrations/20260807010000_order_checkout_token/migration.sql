-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutToken_key" ON "Order"("checkoutToken");
