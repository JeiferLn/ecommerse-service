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
