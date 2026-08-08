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
