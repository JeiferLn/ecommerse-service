import capabilities from "./data/capabilities.json";
import companyCountries from "./data/countries.json";

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
  | "manageKnowledge"
  | "manageBilling";

type CompanyRole = Exclude<UserRole, "admin">;

/** Fuente única en `data/capabilities.json` (también la lee el backend Python). */
export const ROLE_CAPABILITIES: Record<
  CompanyRole,
  Record<CompanyCapability, boolean>
> = capabilities;

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

export function canManageKnowledge(role: UserRole): boolean {
  return hasCapability(role, "manageKnowledge");
}

export function canManageOrders(role: UserRole): boolean {
  return hasCapability(role, "manageOrders");
}

export function canOperateOrders(role: UserRole): boolean {
  return hasCapability(role, "operateOrders");
}

export function canManageBilling(role: UserRole): boolean {
  return hasCapability(role, "manageBilling");
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

/**
 * Países soportados para registrar empresas.
 * Alineado con la cobertura actual de Mercado Pago (LatAm).
 * Más adelante se podrán sumar otros proveedores / países.
 */
export const COMPANY_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = companyCountries;

export const COMPANY_COUNTRY_CODES = COMPANY_COUNTRIES.map((country) => country.code);

export function isSupportedCompanyCountry(code: string | null | undefined): boolean {
  if (!code?.trim()) {
    return false;
  }
  const normalized = code.trim().toUpperCase();
  return COMPANY_COUNTRY_CODES.includes(normalized);
}

export {
  COLOMBIA_DEPARTMENTS,
  COLOMBIA_GEO,
  getColombiaMunicipalities,
  isValidColombiaLocation,
} from "./geo/colombia";

export interface CompanyCommerceSettings {
  countryCode: string | null;
  /** Departamento / región base de la tienda. */
  shippingRegion: string | null;
  /** Municipio / ciudad base de la tienda (para validar envíos locales). */
  shippingCity: string | null;
  shippingScopes: ShippingScope[];
  shippingCarriers: string[];
  /** true si hay país, alcance, transportadoras y (si local) depto+municipio. */
  isConfigured: boolean;
}

export function isCompanyCommerceConfigured(settings: {
  countryCode: string | null;
  shippingRegion?: string | null;
  shippingCity?: string | null;
  shippingScopes: readonly string[];
  shippingCarriers: readonly string[];
}): boolean {
  if (!settings.countryCode?.trim()) {
    return false;
  }
  if (settings.shippingScopes.length === 0 || settings.shippingCarriers.length === 0) {
    return false;
  }
  if (settings.shippingScopes.includes("local")) {
    if (!settings.shippingRegion?.trim() || !settings.shippingCity?.trim()) {
      return false;
    }
  }
  return true;
}

export type MercadoPagoConnectionSource = "oauth" | "manual";

/** Vista pública de la conexión MP (sin access/refresh tokens). */
export interface MercadoPagoConnectionView {
  isConnected: true;
  mpUserId: string | null;
  /** Nickname / usuario de Mercado Libre–Pago. */
  mpNickname: string | null;
  mpEmail: string | null;
  mpFirstName: string | null;
  mpLastName: string | null;
  /** Site MP (ej. MCO Colombia, MLM México). */
  mpSiteId: string | null;
  publicKey: string | null;
  source: MercadoPagoConnectionSource;
  liveMode: boolean;
  connectedAt: string;
  tokenExpiresAt: string | null;
  /** true si la plataforma tiene client_id/secret para OAuth. */
  oauthAvailable: boolean;
}

export interface CompanyPaymentsSettings {
  isConfigured: boolean;
  connection: MercadoPagoConnectionView | null;
  /** true si la plataforma puede iniciar OAuth (MP_CLIENT_ID/SECRET). */
  oauthAvailable: boolean;
}

export function isCompanyPaymentsConfigured(
  connection: { accessToken?: string | null } | null | undefined,
): boolean {
  return Boolean(connection?.accessToken?.trim());
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
  knowledge: CompanyKnowledgeSettings;
  payments: CompanyPaymentsSettings;
  onboarding: CompanyOnboarding;
  createdAt: string;
}

/** Estado de la puesta en marcha del asistente. */
export interface CompanyOnboarding {
  activeProducts: number;
  /** El dueño ya habló con su asistente en "Prueba tu asistente". */
  playgroundTried: boolean;
  /** La plataforma ya asignó un número de WhatsApp. */
  whatsappAssigned: boolean;
  /** El número está asignado y el asistente no está en pausa. */
  whatsappActive: boolean;
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
  /** Resumen de suscripción de la empresa activa (null si admin sin empresa). */
  subscription?: SubscriptionSummary | null;
}

export type PlanCode = "free" | "pro" | "business";

export const PLAN_CODES: PlanCode[] = ["free", "pro", "business"];

export const PLAN_CODE_LABELS: Record<PlanCode, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export type BillingInterval = "month" | "year";

export const BILLING_INTERVALS: BillingInterval[] = ["month", "year"];

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Mensual",
  year: "Anual",
};

/** Precio anual en centavos USD = 10 × mensual (2 meses gratis). */
export function priceYearUsdCents(monthlyUsdCents: number): number {
  if (monthlyUsdCents <= 0) {
    return 0;
  }
  return monthlyUsdCents * 10;
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "trial_expired" | "canceled";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  trial_expired: "Prueba terminada",
  canceled: "Cancelada",
};

export interface PlanView {
  code: PlanCode;
  name: string;
  priceUsdCents: number;
  /** 10 × mensual (2 meses gratis). */
  priceYearUsdCents: number;
  maxMembers: number;
  maxProducts: number;
  maxVariants: number;
  maxWaMessagesMonth: number;
  maxAiRepliesMonth: number;
  maxKnowledgeDocs: number;
  sortOrder: number;
  /** Destacado en pricing (Pro). */
  highlighted?: boolean;
}

export interface SubscriptionSummary {
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  desiredPlanCode: PlanCode | null;
  checkoutRequired: boolean;
  /** Features gated (WA/IA/altas) bloqueadas. */
  featuresLocked: boolean;
  billingInterval: BillingInterval | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface SubscriptionUsage {
  members: number;
  products: number;
  variants: number;
  knowledgeDocs: number;
  waInbound: number;
  aiReplies: number;
  periodKey: string;
}

export interface SubscriptionDetails extends SubscriptionSummary {
  priceUsdCents: number;
  priceYearUsdCents: number;
  limits: {
    maxMembers: number;
    maxProducts: number;
    maxVariants: number;
    maxWaMessagesMonth: number;
    maxAiRepliesMonth: number;
    maxKnowledgeDocs: number;
  };
  usage: SubscriptionUsage;
  currentPeriodStart: string | null;
  desiredBillingInterval: BillingInterval | null;
}

export interface BillingCheckoutResult {
  initPoint: string | null;
  /** true si se activó en modo desarrollo sin MP. */
  activatedWithoutPayment: boolean;
  planCode: PlanCode;
  interval: BillingInterval;
}

export interface BillingCancelResult {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface RegisterResult {
  /** null si el registro de pago aún no se completó (redirige a MP). */
  user: AuthUser | null;
  checkoutRequired: boolean;
  desiredPlanCode: PlanCode | null;
  /** URL de Mercado Pago para suscripción (solo planes de pago). */
  initPoint: string | null;
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

export type KnowledgeDocumentType = "faq" | "policy" | "warranty" | "guide";

export type KnowledgeDocumentStatus = "draft" | "active" | "archived";

/** Los 4 PDFs que mejoran las respuestas del asistente (opcionales). */
export const REQUIRED_KNOWLEDGE_TYPES: readonly KnowledgeDocumentType[] = [
  "guide",
  "faq",
  "warranty",
  "policy",
] as const;

export const KNOWLEDGE_DOCUMENT_TYPE_LABELS: Record<KnowledgeDocumentType, string> = {
  guide: "Guía del asistente",
  faq: "FAQ",
  warranty: "Política de garantías",
  policy: "Políticas de la tienda",
};

export const KNOWLEDGE_DOCUMENT_TYPE_REASONS: Record<KnowledgeDocumentType, string> = {
  guide:
    "Instrucciones para el bot: tono, qué puede y no puede hacer, cuándo escalar a un humano, y cómo presentar productos o precios.",
  faq: "Preguntas frecuentes ya resueltas (horarios, tallas, stock, medios de pago, tiempos de respuesta). El bot las usa para responder sin inventar.",
  warranty:
    "Condiciones de garantía: cobertura, plazos, qué sí/no aplica, cómo reclamar y qué datos o evidencia pedir al cliente.",
  policy:
    "Reglas de la tienda: envíos y zonas, cambios/devoluciones, cancelaciones, datos de contacto y cualquier política que el cliente deba conocer.",
};

export const KNOWLEDGE_DOCUMENT_STATUS_LABELS: Record<KnowledgeDocumentStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export const KNOWLEDGE_DOCUMENT_TYPES: KnowledgeDocumentType[] = Object.keys(
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
) as KnowledgeDocumentType[];

export const KNOWLEDGE_DOCUMENT_STATUSES: KnowledgeDocumentStatus[] = Object.keys(
  KNOWLEDGE_DOCUMENT_STATUS_LABELS,
) as KnowledgeDocumentStatus[];

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: KnowledgeDocumentType;
  body: string;
  status: KnowledgeDocumentStatus;
  fileKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  chunksCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Slot fijo en Configuración (siempre 4). */
export interface KnowledgeSlot {
  type: KnowledgeDocumentType;
  title: string;
  reason: string;
  uploaded: boolean;
  documentId: string | null;
  fileName: string | null;
  chunksCount: number;
  updatedAt: string | null;
}

export interface CompanyKnowledgeSettings {
  isConfigured: boolean;
  missingTypes: KnowledgeDocumentType[];
  slots: KnowledgeSlot[];
}

export function isCompanyKnowledgeConfigured(
  docs: ReadonlyArray<{
    type: string;
    status: string;
    fileKey?: string | null;
  }>,
): boolean {
  return REQUIRED_KNOWLEDGE_TYPES.every((type) =>
    docs.some(
      (doc) => doc.type === type && doc.status === "active" && Boolean(doc.fileKey?.trim()),
    ),
  );
}

export function getMissingKnowledgeTypes(
  docs: ReadonlyArray<{
    type: string;
    status: string;
    fileKey?: string | null;
  }>,
): KnowledgeDocumentType[] {
  return REQUIRED_KNOWLEDGE_TYPES.filter(
    (type) =>
      !docs.some(
        (doc) => doc.type === type && doc.status === "active" && Boolean(doc.fileKey?.trim()),
      ),
  );
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
  ordersTotal: number;
  ordersAwaitingPayment: number;
  /** Pedidos pagados listos para preparar. */
  ordersPaid: number;
  ordersOpen: number;
  ordersWhatsapp: number;
  ordersInStore: number;
  /** Suma de totales en estados cobrados (paid|preparing|shipped|delivered). */
  revenueTotal: number;
  revenueWhatsapp: number;
  revenueInStore: number;
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

/** Empresa vista desde el panel de plataforma, con lo necesario para asignar WhatsApp. */
export interface AdminCompanyRow extends PlatformCompanySummary {
  planCode: PlanCode | null;
  subscriptionStatus: SubscriptionStatus | null;
  requirements: {
    products: boolean;
    shipping: boolean;
    payments: boolean;
  };
  /** Cumple todos los requisitos y aún no tiene número asignado. */
  awaitingNumber: boolean;
  whatsapp: WhatsAppConnection | null;
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

/** `shared`: número de la plataforma enrutado por código; `dedicated`: número propio de la tienda. */
export type WhatsAppConnectionMode = "shared" | "dedicated";

export interface WhatsAppConnection {
  id: string;
  companyId: string;
  /** Número WhatsApp E.164 (ej. +14155238886), sin prefijo whatsapp: */
  twilioWhatsAppNumber: string;
  displayPhoneNumber: string | null;
  mode: WhatsAppConnectionMode;
  /** Código de la tienda en el número compartido (sin #). */
  storeCode: string | null;
  isActive: boolean;
  /** En modo compartido incluye el texto con el código de la tienda. */
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

/** Opción tocable de un mensaje del bot. `id` es la acción que procesa el backend (ej. `cart:checkout`). */
export interface InteractiveAction {
  id: string;
  title: string;
}

export interface InteractiveListItem {
  id: string;
  title: string;
  description?: string;
}

/** Elementos interactivos de un mensaje: iguales en WhatsApp, Conversaciones y Prueba tu asistente. */
export type MessageInteractive =
  | { kind: "buttons"; actions: InteractiveAction[] }
  | { kind: "list"; button: string; items: InteractiveListItem[] }
  | {
      kind: "product_card";
      imageUrl: string | null;
      title: string;
      subtitle: string;
      actions: InteractiveAction[];
    }
  | { kind: "link_button"; title: string; url: string | null }
  /** Mensaje del cliente al tocar un botón u opción. */
  | { kind: "reply"; actionId: string };

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  wamid: string | null;
  type: string;
  body: string;
  status: MessageStatus | null;
  interactive: MessageInteractive | null;
  createdAt: string;
}

/** Conversación de "Prueba tu asistente" (no pasa por WhatsApp). */
export interface AssistantPlaygroundThread {
  conversationId: string | null;
  handler: ConversationHandler;
  messages: WhatsAppMessage[];
}

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "awaiting_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "confirmed",
  "awaiting_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export type OrderChannel = "whatsapp" | "in_store";

export const ORDER_CHANNELS: OrderChannel[] = ["whatsapp", "in_store"];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  in_store: "Tienda física",
};

export type InStorePaymentMethod = "cash" | "card" | "transfer" | "other";

export const IN_STORE_PAYMENT_METHODS: InStorePaymentMethod[] = [
  "cash",
  "card",
  "transfer",
  "other",
];

export const IN_STORE_PAYMENT_METHOD_LABELS: Record<InStorePaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};

export interface CreateInStoreSaleItem {
  variantId: string;
  quantity: number;
}

export interface CreateInStoreSalePayload {
  items: CreateInStoreSaleItem[];
  paymentMethod: InStorePaymentMethod;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface CartItemView {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
}

export interface CartView {
  id: string;
  companyId: string;
  conversationId: string;
  checkoutPending: boolean;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  items: CartItemView[];
  subtotal: number;
  currency: string;
  updatedAt: string;
}

export interface OrderItemView {
  id: string;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderSummary {
  id: string;
  number: string;
  companyId: string;
  conversationId: string | null;
  customerWaId: string | null;
  channel: OrderChannel;
  inStorePaymentMethod: InStorePaymentMethod | null;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  itemsCount: number;
  shippingCity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetails extends Omit<OrderSummary, "itemsCount"> {
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  shippingCountry: string | null;
  shippingRegion: string | null;
  notes: string | null;
  /** Link público de checkout (si el pedido aún tiene token activo). */
  checkoutUrl?: string | null;
  items: OrderItemView[];
}

/** Cobertura de envío expuesta al checkout público (sin datos sensibles). */
export interface CheckoutShippingCoverage {
  countryCode: string | null;
  countryName: string | null;
  baseRegion: string | null;
  baseCity: string | null;
  scopes: ShippingScope[];
  summary: string;
}

/** Vista pública de checkout (sin datos sensibles de empresa ni WA del cliente). */
export interface CheckoutOrderView {
  number: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  companyName: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  shippingCountry: string | null;
  shippingRegion: string | null;
  shippingCity: string | null;
  shippingCoverage: CheckoutShippingCoverage;
  expiresAt: string | null;
  items: OrderItemView[];
}

export interface CompleteCheckoutPayload {
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCountry: string;
  shippingRegion: string;
  shippingCity: string;
  /** Indica que el cliente quiere iniciar el cobro (redirige a Mercado Pago). */
  confirmPayment: boolean;
}

/** Respuesta al iniciar el pago: guarda envío y abre Checkout Pro. */
export interface CheckoutPaymentStart {
  order: CheckoutOrderView;
  preferenceId: string;
  /** URL de Mercado Pago (init_point / sandbox_init_point). */
  paymentUrl: string;
}
