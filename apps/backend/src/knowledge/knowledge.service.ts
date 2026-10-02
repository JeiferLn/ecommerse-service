import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  getMissingKnowledgeTypes,
  isCompanyKnowledgeConfigured,
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
  KNOWLEDGE_DOCUMENT_TYPE_REASONS,
  REQUIRED_KNOWLEDGE_TYPES,
  type CompanyKnowledgeSettings,
  type KnowledgeDocument as KnowledgeDocumentDto,
  type KnowledgeDocumentType,
  type KnowledgeSlot,
} from "@commerce-ai/types";

import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { KnowledgeIndexerService } from "./knowledge-indexer.service";
import { extractTextFromPdf } from "./pdf-text";

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexer: KnowledgeIndexerService,
    private readonly storage: StorageService,
    private readonly billing: BillingService,
  ) {}

  async listSlots(companyId: string | null): Promise<KnowledgeSlot[]> {
    const scopedCompanyId = this.requireCompany(companyId);
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { companyId: scopedCompanyId },
      include: { _count: { select: { chunks: true } } },
    });
    const byType = new Map(documents.map((doc) => [doc.type, doc]));

    return REQUIRED_KNOWLEDGE_TYPES.map((type) => {
      const document = byType.get(type);
      const uploaded = Boolean(
        document && document.status === "active" && document.fileKey?.trim(),
      );
      return {
        type,
        title: KNOWLEDGE_DOCUMENT_TYPE_LABELS[type],
        reason: KNOWLEDGE_DOCUMENT_TYPE_REASONS[type],
        uploaded,
        documentId: uploaded ? document!.id : null,
        fileName: uploaded ? document!.fileName : null,
        chunksCount: uploaded ? document!._count.chunks : 0,
        updatedAt: uploaded ? document!.updatedAt.toISOString() : null,
      };
    });
  }

  async getSettings(companyId: string | null): Promise<CompanyKnowledgeSettings> {
    const slots = await this.listSlots(companyId);
    const missingTypes = slots.filter((slot) => !slot.uploaded).map((slot) => slot.type);
    return {
      isConfigured: missingTypes.length === 0,
      missingTypes,
      slots,
    };
  }

  async isConfigured(companyId: string): Promise<boolean> {
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { companyId },
      select: { type: true, status: true, fileKey: true },
    });
    return isCompanyKnowledgeConfigured(documents);
  }

  async getMissingTypes(companyId: string): Promise<KnowledgeDocumentType[]> {
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { companyId },
      select: { type: true, status: true, fileKey: true },
    });
    return getMissingKnowledgeTypes(documents);
  }

  async uploadPdf(
    companyId: string | null,
    typeParam: string,
    file: Express.Multer.File | undefined,
  ): Promise<KnowledgeSlot> {
    const scopedCompanyId = this.requireCompany(companyId);
    const type = this.parseType(typeParam);
    if (!file?.buffer?.length) {
      throw new BadRequestException("Adjunta un archivo PDF");
    }

    const existing = await this.prisma.knowledgeDocument.findUnique({
      where: {
        companyId_type: { companyId: scopedCompanyId, type },
      },
    });
    if (!existing?.fileKey) {
      await this.billing.assertCan(scopedCompanyId, "upload_knowledge");
    }

    const body = await extractTextFromPdf(file.buffer);
    const title = KNOWLEDGE_DOCUMENT_TYPE_LABELS[type];
    const uploaded = await this.storage.uploadKnowledgePdf({
      companyId: scopedCompanyId,
      type,
      fileName: file.originalname || `${type}.pdf`,
      body: file.buffer,
    });

    if (existing?.fileKey && existing.fileKey !== uploaded.key) {
      await this.storage.deleteObject(existing.fileKey).catch(() => undefined);
    }

    const document = await this.prisma.knowledgeDocument.upsert({
      where: {
        companyId_type: { companyId: scopedCompanyId, type },
      },
      create: {
        companyId: scopedCompanyId,
        type,
        title,
        body,
        status: "active",
        fileKey: uploaded.key,
        fileName: file.originalname || `${type}.pdf`,
        mimeType: "application/pdf",
      },
      update: {
        title,
        body,
        status: "active",
        fileKey: uploaded.key,
        fileName: file.originalname || `${type}.pdf`,
        mimeType: "application/pdf",
      },
    });

    await this.indexer.reindexDocument(document.id);
    const slots = await this.listSlots(scopedCompanyId);
    return slots.find((slot) => slot.type === type)!;
  }

  async removeByType(companyId: string | null, typeParam: string): Promise<void> {
    const scopedCompanyId = this.requireCompany(companyId);
    const type = this.parseType(typeParam);
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: {
        companyId_type: { companyId: scopedCompanyId, type },
      },
    });
    if (!document) {
      throw new NotFoundException("Documento no encontrado");
    }
    if (document.fileKey) {
      await this.storage.deleteObject(document.fileKey).catch(() => undefined);
    }
    await this.prisma.knowledgeDocument.delete({ where: { id: document.id } });
  }

  /** @deprecated text CRUD; kept for internal DTO mapping if needed */
  toDocumentDto(document: {
    id: string;
    title: string;
    type: KnowledgeDocumentType;
    body: string;
    status: KnowledgeDocumentDto["status"];
    fileKey: string | null;
    fileName: string | null;
    mimeType: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { chunks: number };
  }): KnowledgeDocumentDto {
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      body: document.body,
      status: document.status,
      fileKey: document.fileKey,
      fileName: document.fileName,
      mimeType: document.mimeType,
      chunksCount: document._count.chunks,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private parseType(typeParam: string): KnowledgeDocumentType {
    if (!(REQUIRED_KNOWLEDGE_TYPES as readonly string[]).includes(typeParam)) {
      throw new BadRequestException(`Tipo inválido. Usa: ${REQUIRED_KNOWLEDGE_TYPES.join(", ")}`);
    }
    return typeParam as KnowledgeDocumentType;
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }
}
