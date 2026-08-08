-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mpPaymentId" TEXT;

-- CreateIndex
CREATE INDEX "Order_mpPaymentId_idx" ON "Order"("mpPaymentId");
