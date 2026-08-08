import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type {
  CompanyDashboardStats,
  CompanyType,
  DailyCount,
  PlatformDashboardStats,
  ProductStatus,
  ProductStockSummary,
  StatusCount,
} from "@commerce-ai/types";

import { PrismaService } from "../prisma/prisma.service";

const LOW_STOCK_THRESHOLD = 5;
const RECENT_COMPANIES_LIMIT = 8;
const TOP_PRODUCTS_LIMIT = 8;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyStats(companyId: string | null): Promise<CompanyDashboardStats> {
    const scopedCompanyId = this.requireCompany(companyId);

    const [products, categoriesTotal, membersTotal, ordersTotal, ordersAwaitingPayment, ordersOpen] =
      await Promise.all([
      this.prisma.product.findMany({
        where: { companyId: scopedCompanyId },
        select: {
          id: true,
          name: true,
          status: true,
          variants: { select: { stock: true } },
        },
      }),
      this.prisma.category.count({ where: { companyId: scopedCompanyId } }),
      this.prisma.companyMembership.count({ where: { companyId: scopedCompanyId } }),
      this.prisma.order.count({ where: { companyId: scopedCompanyId } }),
      this.prisma.order.count({
        where: { companyId: scopedCompanyId, status: "awaiting_payment" },
      }),
      this.prisma.order.count({
        where: {
          companyId: scopedCompanyId,
          status: {
            in: ["draft", "confirmed", "awaiting_payment", "paid", "preparing", "shipped"],
          },
        },
      }),
    ]);

    const statusMap: Record<ProductStatus, number> = {
      draft: 0,
      active: 0,
      archived: 0,
    };

    const stockSummaries: ProductStockSummary[] = [];
    let variantsTotal = 0;
    let totalStock = 0;

    for (const product of products) {
      statusMap[product.status as ProductStatus] += 1;
      const productStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
      variantsTotal += product.variants.length;
      totalStock += productStock;
      stockSummaries.push({
        id: product.id,
        name: product.name,
        totalStock: productStock,
      });
    }

    const productsByStatus: StatusCount[] = (Object.keys(statusMap) as ProductStatus[]).map(
      (status) => ({ status, count: statusMap[status] }),
    );

    const sortedByStockAsc = [...stockSummaries].sort((a, b) => a.totalStock - b.totalStock);
    const lowStockProducts = sortedByStockAsc
      .filter((item) => item.totalStock <= LOW_STOCK_THRESHOLD)
      .slice(0, TOP_PRODUCTS_LIMIT);

    const topProductsByStock = [...stockSummaries]
      .sort((a, b) => b.totalStock - a.totalStock)
      .slice(0, TOP_PRODUCTS_LIMIT);

    return {
      productsTotal: products.length,
      productsByStatus,
      variantsTotal,
      totalStock,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      lowStockProducts,
      categoriesTotal,
      membersTotal,
      topProductsByStock,
      ordersTotal,
      ordersAwaitingPayment,
      ordersOpen,
    };
  }

  async getPlatformStats(role: string): Promise<PlatformDashboardStats> {
    if (role !== "admin") {
      throw new ForbiddenException("Solo administradores de plataforma");
    }

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);

    const [
      companiesTotal,
      usersTotal,
      productsTotal,
      membershipsTotal,
      companiesCreated,
      usersCreated,
      recentCompaniesRaw,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count({ where: { role: { not: "admin" } } }),
      this.prisma.product.count(),
      this.prisma.companyMembership.count(),
      this.prisma.company.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.user.findMany({
        where: { role: { not: "admin" }, createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.company.findMany({
        take: RECENT_COMPANIES_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
          _count: { select: { memberships: true, products: true } },
        },
      }),
    ]);

    return {
      companiesTotal,
      usersTotal,
      productsTotal,
      membershipsTotal,
      companiesLast30Days: this.toDailySeries(companiesCreated.map((row) => row.createdAt), since),
      usersLast30Days: this.toDailySeries(usersCreated.map((row) => row.createdAt), since),
      recentCompanies: recentCompaniesRaw.map((company) => ({
        id: company.id,
        name: company.name,
        type: company.type as CompanyType,
        ownerName: company.owner.name,
        ownerEmail: company.owner.email,
        membersCount: company._count.memberships,
        productsCount: company._count.products,
        createdAt: company.createdAt.toISOString(),
      })),
    };
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    return companyId;
  }

  private toDailySeries(dates: Date[], since: Date): DailyCount[] {
    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i += 1) {
      const day = new Date(since);
      day.setUTCDate(since.getUTCDate() + i);
      buckets.set(day.toISOString().slice(0, 10), 0);
    }

    for (const date of dates) {
      const key = date.toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }
}
