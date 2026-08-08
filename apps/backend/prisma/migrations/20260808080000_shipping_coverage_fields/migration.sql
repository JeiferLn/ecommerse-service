-- AlterTable
ALTER TABLE "Company" ADD COLUMN "shippingCity" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingCountry" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingRegion" TEXT;
