-- Esquema base: historial de migraciones de Prisma (apps/backend/prisma/migrations) hasta el corte a Python.

-- >>> 20260801002312_init_auth
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'owner', 'user');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260801014141_add_password_reset_tokens
-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260801024452_add_companies
-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('retail', 'health_beauty', 'technology', 'education');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompanyType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerId_key" ON "Company"("ownerId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- >>> 20260801031942_add_manager_role
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'manager';

-- >>> 20260801040000_company_memberships_and_invitations
-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "companyId" TEXT;

-- AlterTable
DROP INDEX IF EXISTS "User_companyId_idx";
ALTER TABLE "User" DROP COLUMN "companyId";

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_companyId_email_key" ON "Invitation"("companyId", "email");

-- CreateIndex
CREATE INDEX "Invitation_companyId_idx" ON "Invitation"("companyId");

-- >>> 20260801080000_add_invitation_expiration
-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '1 hour');
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" DROP DEFAULT;

-- >>> 20260801090000_add_invitation_token
-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "token" TEXT;
UPDATE "Invitation" SET "token" = md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text) WHERE "token" IS NULL;
ALTER TABLE "Invitation" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_token_key" UNIQUE ("token");

-- >>> 20260801110000_expand_company_types_and_profile
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

-- >>> 20260801120000_add_catalog
-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_companyId_idx" ON "Category"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_slug_key" ON "Category"("companyId", "slug");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE INDEX "Product_companyId_status_idx" ON "Product"("companyId", "status");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260803211545_add_whatsapp
-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('received', 'sent', 'failed');

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "displayPhoneNumber" TEXT,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waConnectionId" TEXT NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "customerName" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "wamid" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "status" "MessageStatus",
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_companyId_key" ON "WhatsAppConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "Conversation_companyId_idx" ON "Conversation"("companyId");

-- CreateIndex
CREATE INDEX "Conversation_companyId_lastMessageAt_idx" ON "Conversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_waConnectionId_customerWaId_key" ON "Conversation"("waConnectionId", "customerWaId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_wamid_idx" ON "Message"("wamid");

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_waConnectionId_fkey" FOREIGN KEY ("waConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260803225131_conversation_handler
-- CreateEnum
CREATE TYPE "ConversationHandler" AS ENUM ('pending', 'bot', 'human');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "handler" "ConversationHandler" NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "Conversation_companyId_handler_idx" ON "Conversation"("companyId", "handler");

-- >>> 20260804010000_company_commerce_settings
-- AlterTable
ALTER TABLE "Company" ADD COLUMN "countryCode" TEXT,
ADD COLUMN "shippingScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "paymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "shippingCarriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "banks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- >>> 20260804200000_whatsapp_twilio
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

-- >>> 20260805150000_knowledge_rag
-- Enable pgvector (image already includes the extension).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "KnowledgeDocumentType" AS ENUM ('faq', 'policy', 'warranty', 'guide');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "KnowledgeDocumentType" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeDocument_companyId_idx" ON "KnowledgeDocument"("companyId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_companyId_status_idx" ON "KnowledgeDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_companyId_idx" ON "KnowledgeChunk"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_chunkIndex_key" ON "KnowledgeChunk"("documentId", "chunkIndex");

-- CreateIndex (cosine distance; useful after enough rows)
CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx" ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260805160000_knowledge_pdf_slots
-- AlterTable
ALTER TABLE "KnowledgeDocument" ADD COLUMN "fileKey" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "fileName" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "mimeType" TEXT;

-- Deduplicate before unique: keep newest per (companyId, type)
DELETE FROM "KnowledgeDocument" AS d
USING "KnowledgeDocument" AS newer
WHERE d."companyId" = newer."companyId"
  AND d."type" = newer."type"
  AND d."id" <> newer."id"
  AND d."updatedAt" < newer."updatedAt";

DELETE FROM "KnowledgeDocument" AS d
WHERE d."id" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "companyId", "type" ORDER BY "updatedAt" DESC, id DESC) AS rn
    FROM "KnowledgeDocument"
  ) ranked
  WHERE ranked.rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_companyId_type_key" ON "KnowledgeDocument"("companyId", "type");

-- >>> 20260806200000_orders_cart
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM (
  'draft',
  'confirmed',
  'awaiting_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled'
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "checkoutPending" BOOLEAN NOT NULL DEFAULT false,
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "shippingAddress" TEXT,
    "shippingCity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT,
    "customerWaId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'awaiting_payment',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "shippingAddress" TEXT,
    "shippingCity" TEXT,
    "notes" TEXT,
    "stockDecremented" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cart_conversationId_key" ON "Cart"("conversationId");

-- CreateIndex
CREATE INDEX "Cart_companyId_idx" ON "Cart"("companyId");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");

-- CreateIndex
CREATE INDEX "Order_companyId_status_idx" ON "Order"("companyId", "status");

-- CreateIndex
CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_conversationId_idx" ON "Order"("conversationId");

-- CreateIndex
CREATE INDEX "Order_customerWaId_idx" ON "Order"("customerWaId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_companyId_number_key" ON "Order"("companyId", "number");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260807010000_order_checkout_token
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutToken_key" ON "Order"("checkoutToken");

-- >>> 20260808080000_shipping_coverage_fields
-- AlterTable
ALTER TABLE "Company" ADD COLUMN "shippingCity" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingCountry" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingRegion" TEXT;

-- >>> 20260808090000_company_shipping_region
-- AlterTable
ALTER TABLE "Company" ADD COLUMN "shippingRegion" TEXT;

-- >>> 20260808183602_add_mp_preference_id
-- DropIndex
DROP INDEX "Invitation_companyId_idx";

-- DropIndex
DROP INDEX "KnowledgeChunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mpPreferenceId" TEXT;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260808190900_add_mp_payment_id
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mpPaymentId" TEXT;

-- CreateIndex
CREATE INDEX "Order_mpPaymentId_idx" ON "Order"("mpPaymentId");

-- >>> 20260808193851_add_mercadopago_connection
-- CreateEnum
CREATE TYPE "MercadoPagoConnectionSource" AS ENUM ('oauth', 'manual');

-- CreateTable
CREATE TABLE "MercadoPagoConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "publicKey" TEXT,
    "mpUserId" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "source" "MercadoPagoConnectionSource" NOT NULL DEFAULT 'manual',
    "liveMode" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoPagoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoConnection_companyId_key" ON "MercadoPagoConnection"("companyId");

-- AddForeignKey
ALTER TABLE "MercadoPagoConnection" ADD CONSTRAINT "MercadoPagoConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260808203103_mp_connection_seller_profile
-- AlterTable
ALTER TABLE "MercadoPagoConnection" ADD COLUMN     "mpEmail" TEXT,
ADD COLUMN     "mpFirstName" TEXT,
ADD COLUMN     "mpLastName" TEXT,
ADD COLUMN     "mpNickname" TEXT,
ADD COLUMN     "mpSiteId" TEXT;

-- >>> 20260809150000_order_channel_in_store
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

-- >>> 20260809180000_billing_subscriptions
-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('free', 'pro', 'business');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'trial_expired', 'canceled');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "priceUsdCents" INTEGER NOT NULL DEFAULT 0,
    "maxMembers" INTEGER NOT NULL,
    "maxProducts" INTEGER NOT NULL,
    "maxVariants" INTEGER NOT NULL,
    "maxWaMessagesMonth" INTEGER NOT NULL,
    "maxAiRepliesMonth" INTEGER NOT NULL,
    "maxKnowledgeDocs" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "desiredPlanId" TEXT,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "waInboundCount" INTEGER NOT NULL DEFAULT 0,
    "aiReplyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "UsageCounter_companyId_idx" ON "UsageCounter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_companyId_periodKey_key" ON "UsageCounter"("companyId", "periodKey");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_desiredPlanId_fkey" FOREIGN KEY ("desiredPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- >>> 20260810180000_subscription_recurring
-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingInterval" "BillingInterval",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "desiredBillingInterval" "BillingInterval",
ADD COLUMN     "mpPreapprovalId" TEXT;

-- CreateIndex
CREATE INDEX "Subscription_mpPreapprovalId_idx" ON "Subscription"("mpPreapprovalId");

-- >>> 20260810190000_pending_registration
-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "CompanyType" NOT NULL,
    "countryCode" TEXT NOT NULL,
    "planCode" "PlanCode" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "mpPreapprovalId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_email_key" ON "PendingRegistration"("email");

-- CreateIndex
CREATE INDEX "PendingRegistration_mpPreapprovalId_idx" ON "PendingRegistration"("mpPreapprovalId");

-- CreateIndex
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");

-- >>> 20261001160000_conversation_playground
-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "waConnectionId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "isPlayground" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Conversation_companyId_isPlayground_idx" ON "Conversation"("companyId", "isPlayground");

-- >>> 20261001200000_knowledge_docs_all_plans
-- Los 4 documentos de conocimiento son opcionales y están disponibles en todos los planes.
UPDATE "Plan" SET "maxKnowledgeDocs" = 4;

-- >>> 20261001210000_whatsapp_shared_number
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

-- >>> 20261001220000_whatsapp_interactive_messages
-- AlterTable
ALTER TABLE "Message" ADD COLUMN "interactive" JSONB;

-- CreateTable
CREATE TABLE "WhatsAppContentTemplate" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "contentSid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContentTemplate_hash_key" ON "WhatsAppContentTemplate"("hash");
