-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingInterval" "BillingInterval",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "desiredBillingInterval" "BillingInterval",
ADD COLUMN     "mpPreapprovalId" TEXT;

-- CreateIndex
CREATE INDEX "Subscription_mpPreapprovalId_idx" ON "Subscription"("mpPreapprovalId");
