-- Expand CompanyType for sales-oriented businesses
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'clothing';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'footwear';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'accessories';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'electronics';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'home_garden';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'food_beverage';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'pharmacy';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'sports';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'toys_kids';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'automotive';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'jewelry';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'furniture';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'pets';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'books_media';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'services';
ALTER TYPE "CompanyType" ADD VALUE IF NOT EXISTS 'other';

-- Company contact / business profile fields
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "description" TEXT;
