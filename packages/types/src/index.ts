export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export type UserRole = "admin" | "owner" | "manager" | "user";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  owner: "Dueño",
  manager: "Manager",
  user: "Usuario",
};

/** Roles que un owner puede asignar a miembros de su empresa (nunca owner/admin). */
export const MEMBER_ASSIGNABLE_ROLES = ["user", "manager"] as const;
export type MemberAssignableRole = (typeof MEMBER_ASSIGNABLE_ROLES)[number];

/**
 * Capacidades de negocio por rol de empresa.
 * `admin` es staff de la plataforma y no opera una tienda: no hereda estas capacidades.
 * No hay tabla Permission: se autoriza con `@Roles(...)` + esta matriz.
 */
export type CompanyCapability =
  | "editCompany"
  | "manageMembers"
  | "viewMembers"
  | "manageCatalog"
  | "viewCatalog"
  | "viewDashboard"
  | "manageOrders"
  | "operateOrders"
  | "manageWhatsapp"
  | "viewWhatsapp"
  | "manageBilling";

type CompanyRole = Exclude<UserRole, "admin">;

export const ROLE_CAPABILITIES: Record<CompanyRole, Record<CompanyCapability, boolean>> = {
  owner: {
    editCompany: true,
    manageMembers: true,
    viewMembers: true,
    manageCatalog: true,
    viewCatalog: true,
    viewDashboard: true,
    manageOrders: true,
    operateOrders: true,
    manageWhatsapp: true,
    viewWhatsapp: true,
    manageBilling: true,
  },
  manager: {
    editCompany: false,
    manageMembers: false,
    viewMembers: true,
    manageCatalog: true,
    viewCatalog: true,
    viewDashboard: true,
    manageOrders: true,
    operateOrders: true,
    manageWhatsapp: true,
    viewWhatsapp: true,
    manageBilling: false,
  },
  user: {
    editCompany: false,
    manageMembers: false,
    viewMembers: true,
    manageCatalog: false,
    viewCatalog: true,
    viewDashboard: true,
    manageOrders: false,
    operateOrders: true,
    manageWhatsapp: false,
    viewWhatsapp: true,
    manageBilling: false,
  },
};

export function hasCapability(role: UserRole, capability: CompanyCapability): boolean {
  if (role === "admin") {
    return false;
  }
  return ROLE_CAPABILITIES[role][capability];
}

export function canEditCompany(role: UserRole): boolean {
  return hasCapability(role, "editCompany");
}

export function canManageMembers(role: UserRole): boolean {
  return hasCapability(role, "manageMembers");
}

export function canViewMembers(role: UserRole): boolean {
  return hasCapability(role, "viewMembers");
}

export function canManageCatalog(role: UserRole): boolean {
  return hasCapability(role, "manageCatalog");
}

export function canViewCatalog(role: UserRole): boolean {
  return hasCapability(role, "viewCatalog");
}

export function canViewDashboard(role: UserRole): boolean {
  return hasCapability(role, "viewDashboard");
}

export function canManageWhatsapp(role: UserRole): boolean {
  return hasCapability(role, "manageWhatsapp");
}

export function canViewWhatsapp(role: UserRole): boolean {
  return hasCapability(role, "viewWhatsapp");
}

export type CompanyType =
  | "retail"
  | "clothing"
  | "footwear"
  | "accessories"
  | "health_beauty"
  | "technology"
  | "electronics"
  | "home_garden"
  | "food_beverage"
  | "pharmacy"
  | "sports"
  | "toys_kids"
  | "automotive"
  | "jewelry"
  | "furniture"
  | "pets"
  | "books_media"
  | "education"
  | "services"
  | "other";

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  retail: "Retail / Comercio general",
  clothing: "Ropa y moda",
  footwear: "Calzado",
  accessories: "Accesorios",
  health_beauty: "Salud y estética",
  technology: "Tecnología",
  electronics: "Electrónica",
  home_garden: "Hogar y jardín",
  food_beverage: "Alimentos y bebidas",
  pharmacy: "Farmacia",
  sports: "Deportes",
  toys_kids: "Juguetes e infantil",
  automotive: "Automotriz",
  jewelry: "Joyería",
  furniture: "Muebles",
  pets: "Mascotas",
  books_media: "Libros y medios",
  education: "Educación",
  services: "Servicios",
  other: "Otro",
};

export const COMPANY_TYPES: CompanyType[] = Object.keys(COMPANY_TYPE_LABELS) as CompanyType[];

export type ShippingScope = "local" | "national" | "international";

export const SHIPPING_SCOPES: ShippingScope[] = ["local", "national", "international"];

export const SHIPPING_SCOPE_LABELS: Record<ShippingScope, string> = {
  local: "Local / misma ciudad",
  national: "Nacional",
  international: "Internacional",
};

/** Reservado para Fase 9 (pasarela); la tienda no configura métodos de pago en el chat. */
export type PaymentMethod = "debit_card" | "credit_card" | "bank_transfer" | "cash_on_delivery";

export const COMPANY_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "CO", name: "Colombia" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "PE", name: "Perú" },
  { code: "EC", name: "Ecuador" },
  { code: "VE", name: "Venezuela" },
  { code: "UY", name: "Uruguay" },
  { code: "PY", name: "Paraguay" },
  { code: "BO", name: "Bolivia" },
  { code: "CR", name: "Costa Rica" },
  { code: "PA", name: "Panamá" },
  { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" },
  { code: "SV", name: "El Salvador" },
  { code: "NI", name: "Nicaragua" },
  { code: "DO", name: "República Dominicana" },
  { code: "US", name: "Estados Unidos" },
  { code: "ES", name: "España" },
  { code: "BR", name: "Brasil" },
];

export interface CompanyCommerceSettings {
  countryCode: string | null;
  shippingScopes: ShippingScope[];
  shippingCarriers: string[];
  /** true si hay país, al menos un alcance de envío y transportadoras */
  isConfigured: boolean;
}

export function isCompanyCommerceConfigured(settings: {
  countryCode: string | null;
  shippingScopes: readonly string[];
  shippingCarriers: readonly string[];
}): boolean {
  if (!settings.countryCode?.trim()) {
    return false;
  }
  if (settings.shippingScopes.length === 0 || settings.shippingCarriers.length === 0) {
    return false;
  }
  return true;
}

export interface CompanySummary {
  id: string;
  name: string;
  type: CompanyType;
  role: UserRole;
}

export interface CompanyDetails {
  id: string;
  name: string;
  type: CompanyType;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
  address: string | null;
  description: string | null;
  commerce: CompanyCommerceSettings;
  createdAt: string;
}

export interface CompanyMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface InviteResult {
  status: "joined" | "pending" | "cancelled";
  message: string;
}

export interface RemoveMemberResult {
  message: string;
}

export interface CompanyInvitation {
  id: string;
  email: string;
  createdAt: string;
}

export interface InvitationInfo {
  email: string;
  companyName: string;
  hasAccount: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  companies: CompanySummary[];
}

export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export type ProductStatus = "draft" | "active" | "archived";

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export const PRODUCT_STATUSES: ProductStatus[] = Object.keys(
  PRODUCT_STATUS_LABELS,
) as ProductStatus[];

export interface Category {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  attributes: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  url: string;
  key: string;
  alt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  categoryName: string | null;
  variantsCount: number;
  totalStock: number;
  minPrice: number | null;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetails {
  id: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  category: Category | null;
  variants: ProductVariant[];
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface StatusCount {
  status: ProductStatus;
  count: number;
}

export interface ProductStockSummary {
  id: string;
  name: string;
  totalStock: number;
}

export interface CompanyDashboardStats {
  productsTotal: number;
  productsByStatus: StatusCount[];
  variantsTotal: number;
  totalStock: number;
  lowStockThreshold: number;
  lowStockProducts: ProductStockSummary[];
  categoriesTotal: number;
  membersTotal: number;
  topProductsByStock: ProductStockSummary[];
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface PlatformCompanySummary {
  id: string;
  name: string;
  type: CompanyType;
  ownerName: string;
  ownerEmail: string;
  membersCount: number;
  productsCount: number;
  createdAt: string;
}

export interface PlatformDashboardStats {
  companiesTotal: number;
  usersTotal: number;
  productsTotal: number;
  membershipsTotal: number;
  companiesLast30Days: DailyCount[];
  usersLast30Days: DailyCount[];
  recentCompanies: PlatformCompanySummary[];
}

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus = "received" | "sent" | "failed";

export type ConversationHandler = "pending" | "bot" | "human";

export const CONVERSATION_HANDLER_LABELS: Record<ConversationHandler, string> = {
  pending: "Sin elegir",
  bot: "Bot",
  human: "Asesor",
};

export interface WhatsAppConnection {
  id: string;
  companyId: string;
  /** Número WhatsApp E.164 (ej. +14155238886), sin prefijo whatsapp: */
  twilioWhatsAppNumber: string;
  displayPhoneNumber: string | null;
  isActive: boolean;
  waMeLink: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  companyId: string;
  customerWaId: string;
  customerName: string | null;
  handler: ConversationHandler;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  wamid: string | null;
  type: string;
  body: string;
  status: MessageStatus | null;
  createdAt: string;
}
