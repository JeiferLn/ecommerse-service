-- AlterTable
ALTER TABLE "Company" ADD COLUMN "countryCode" TEXT,
ADD COLUMN "shippingScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "paymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "shippingCarriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "banks" TEXT[] DEFAULT ARRAY[]::TEXT[];
