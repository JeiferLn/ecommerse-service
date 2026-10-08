"""Modelos SQLAlchemy (tablas "PascalCase", columnas camelCase): dueños del esquema; los cambios van por Alembic."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.ids import new_id, utcnow


def pg_enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, create_type=False)


UserRoleEnum = pg_enum("UserRole", "admin", "owner", "manager", "user")
CompanyTypeEnum = pg_enum(
    "CompanyType",
    "retail",
    "clothing",
    "footwear",
    "accessories",
    "health_beauty",
    "technology",
    "electronics",
    "home_garden",
    "food_beverage",
    "pharmacy",
    "sports",
    "toys_kids",
    "automotive",
    "jewelry",
    "furniture",
    "pets",
    "books_media",
    "education",
    "services",
    "other",
)
MpSourceEnum = pg_enum("MercadoPagoConnectionSource", "oauth", "manual")
ProductStatusEnum = pg_enum("ProductStatus", "draft", "active", "archived")
MessageDirectionEnum = pg_enum("MessageDirection", "inbound", "outbound")
MessageStatusEnum = pg_enum("MessageStatus", "received", "sent", "failed")
ConversationHandlerEnum = pg_enum("ConversationHandler", "pending", "bot", "human")
WaModeEnum = pg_enum("WhatsAppConnectionMode", "shared", "dedicated")
WaConnectionKindEnum = pg_enum("WhatsAppConnectionKind", "own_number", "platform_number")
WaOnboardingStatusEnum = pg_enum(
    "WhatsAppOnboardingStatus", "pending", "awaiting_meta", "registering", "online", "failed"
)
KnowledgeTypeEnum = pg_enum("KnowledgeDocumentType", "faq", "policy", "warranty", "guide")
KnowledgeStatusEnum = pg_enum("KnowledgeDocumentStatus", "draft", "active", "archived")
OrderStatusEnum = pg_enum(
    "OrderStatus",
    "draft",
    "confirmed",
    "awaiting_payment",
    "paid",
    "preparing",
    "shipped",
    "delivered",
    "cancelled",
)
OrderChannelEnum = pg_enum("OrderChannel", "whatsapp", "in_store")
InStorePaymentEnum = pg_enum("InStorePaymentMethod", "cash", "card", "transfer", "other")
PlanCodeEnum = pg_enum("PlanCode", "free", "pro", "business")
SubscriptionStatusEnum = pg_enum(
    "SubscriptionStatus", "trialing", "active", "past_due", "trial_expired", "canceled"
)
BillingIntervalEnum = pg_enum("BillingInterval", "month", "year")

Timestamp = DateTime(timezone=False)
Money = Numeric(12, 2)


class Base(DeclarativeBase):
    # Mismos nombres que generaba Prisma, para que `alembic revision --autogenerate` no los renombre.
    metadata = MetaData(
        naming_convention={"pk": "%(table_name)s_pkey", "fk": "%(table_name)s_%(column_0_name)s_fkey"}
    )


def id_column() -> Mapped[str]:
    return mapped_column("id", Text, primary_key=True, default=new_id)


def created_at_column() -> Mapped[datetime]:
    return mapped_column("createdAt", Timestamp, default=utcnow, nullable=False)


def updated_at_column() -> Mapped[datetime]:
    return mapped_column("updatedAt", Timestamp, default=utcnow, onupdate=utcnow, nullable=False)


def ref(target: str, *, ondelete: str = "CASCADE") -> ForeignKey:
    return ForeignKey(target, ondelete=ondelete, onupdate="CASCADE")


def fk(column: str, target: str, *, nullable: bool = False, ondelete: str = "CASCADE") -> Mapped[Any]:
    return mapped_column(column, Text, ref(target, ondelete=ondelete), nullable=nullable)


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = id_column()
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column("passwordHash", Text)
    role: Mapped[str] = mapped_column(UserRoleEnum, default="user")
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    memberships: Mapped[list[CompanyMembership]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    owned_company: Mapped[Company | None] = relationship(back_populates="owner", uselist=False)


class Company(Base):
    __tablename__ = "Company"

    id: Mapped[str] = id_column()
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(CompanyTypeEnum)
    phone: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column("contactEmail", Text)
    website: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    country_code: Mapped[str | None] = mapped_column("countryCode", Text)
    shipping_city: Mapped[str | None] = mapped_column("shippingCity", Text)
    shipping_region: Mapped[str | None] = mapped_column("shippingRegion", Text)
    shipping_scopes: Mapped[list[str]] = mapped_column(
        "shippingScopes", ARRAY(Text), default=list, nullable=True
    )
    payment_methods: Mapped[list[str]] = mapped_column(
        "paymentMethods", ARRAY(Text), default=list, nullable=True
    )
    shipping_carriers: Mapped[list[str]] = mapped_column(
        "shippingCarriers", ARRAY(Text), default=list, nullable=True
    )
    banks: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=True)
    owner_id: Mapped[str] = mapped_column("ownerId", Text, ref("User.id"))
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    owner: Mapped[User] = relationship(back_populates="owned_company")
    memberships: Mapped[list[CompanyMembership]] = relationship(
        back_populates="company", cascade="all, delete-orphan", passive_deletes=True
    )
    mercado_pago_connection: Mapped[MercadoPagoConnection | None] = relationship(
        back_populates="company", uselist=False
    )
    whatsapp_connection: Mapped[WhatsAppConnection | None] = relationship(
        back_populates="company", uselist=False
    )
    whatsapp_number_request: Mapped[WhatsAppNumberRequest | None] = relationship(
        back_populates="company", uselist=False
    )
    subscription: Mapped[Subscription | None] = relationship(back_populates="company", uselist=False)


class MercadoPagoConnection(Base):
    __tablename__ = "MercadoPagoConnection"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = mapped_column("companyId", Text, ref("Company.id"))
    access_token: Mapped[str] = mapped_column("accessToken", Text)
    refresh_token: Mapped[str | None] = mapped_column("refreshToken", Text)
    public_key: Mapped[str | None] = mapped_column("publicKey", Text)
    mp_user_id: Mapped[str | None] = mapped_column("mpUserId", Text)
    mp_nickname: Mapped[str | None] = mapped_column("mpNickname", Text)
    mp_email: Mapped[str | None] = mapped_column("mpEmail", Text)
    mp_first_name: Mapped[str | None] = mapped_column("mpFirstName", Text)
    mp_last_name: Mapped[str | None] = mapped_column("mpLastName", Text)
    mp_site_id: Mapped[str | None] = mapped_column("mpSiteId", Text)
    token_expires_at: Mapped[datetime | None] = mapped_column("tokenExpiresAt", Timestamp)
    source: Mapped[str] = mapped_column(MpSourceEnum, default="manual")
    live_mode: Mapped[bool] = mapped_column("liveMode", Boolean, default=False)
    connected_at: Mapped[datetime] = mapped_column("connectedAt", Timestamp, default=utcnow)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    company: Mapped[Company] = relationship(back_populates="mercado_pago_connection")


class CompanyMembership(Base):
    __tablename__ = "CompanyMembership"

    id: Mapped[str] = id_column()
    user_id: Mapped[str] = fk("userId", "User.id")
    company_id: Mapped[str] = fk("companyId", "Company.id")
    role: Mapped[str] = mapped_column(UserRoleEnum)
    created_at: Mapped[datetime] = created_at_column()

    user: Mapped[User] = relationship(back_populates="memberships")
    company: Mapped[Company] = relationship(back_populates="memberships")


class Invitation(Base):
    __tablename__ = "Invitation"

    id: Mapped[str] = id_column()
    token: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    company_id: Mapped[str] = fk("companyId", "Company.id")
    expires_at: Mapped[datetime] = mapped_column("expiresAt", Timestamp)
    created_at: Mapped[datetime] = created_at_column()

    company: Mapped[Company] = relationship()


class RefreshToken(Base):
    __tablename__ = "RefreshToken"

    id: Mapped[str] = id_column()
    token_hash: Mapped[str] = mapped_column("tokenHash", Text)
    user_id: Mapped[str] = fk("userId", "User.id")
    company_id: Mapped[str | None] = mapped_column("companyId", Text)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", Timestamp)
    revoked_at: Mapped[datetime | None] = mapped_column("revokedAt", Timestamp)
    created_at: Mapped[datetime] = created_at_column()


class PasswordResetToken(Base):
    __tablename__ = "PasswordResetToken"

    id: Mapped[str] = id_column()
    token_hash: Mapped[str] = mapped_column("tokenHash", Text)
    user_id: Mapped[str] = fk("userId", "User.id")
    expires_at: Mapped[datetime] = mapped_column("expiresAt", Timestamp)
    created_at: Mapped[datetime] = created_at_column()


class PendingRegistration(Base):
    __tablename__ = "PendingRegistration"

    id: Mapped[str] = id_column()
    email: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column("passwordHash", Text)
    company_name: Mapped[str] = mapped_column("companyName", Text)
    company_type: Mapped[str] = mapped_column("companyType", CompanyTypeEnum)
    country_code: Mapped[str] = mapped_column("countryCode", Text)
    plan_code: Mapped[str] = mapped_column("planCode", PlanCodeEnum)
    billing_interval: Mapped[str] = mapped_column("billingInterval", BillingIntervalEnum)
    mp_preapproval_id: Mapped[str | None] = mapped_column("mpPreapprovalId", Text)
    expires_at: Mapped[datetime] = mapped_column("expiresAt", Timestamp)
    completed_at: Mapped[datetime | None] = mapped_column("completedAt", Timestamp)
    created_at: Mapped[datetime] = created_at_column()


class Category(Base):
    __tablename__ = "Category"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()


class Product(Base):
    __tablename__ = "Product"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    category_id: Mapped[str | None] = fk("categoryId", "Category.id", nullable=True, ondelete="SET NULL")
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(ProductStatusEnum, default="draft")
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    category: Mapped[Category | None] = relationship()
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product",
        order_by="ProductVariant.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    images: Mapped[list[ProductImage]] = relationship(
        back_populates="product",
        order_by="ProductImage.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ProductVariant(Base):
    __tablename__ = "ProductVariant"

    id: Mapped[str] = id_column()
    product_id: Mapped[str] = fk("productId", "Product.id")
    sku: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Money)
    compare_at_price: Mapped[Decimal | None] = mapped_column("compareAtPrice", Money)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    attributes: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    product: Mapped[Product] = relationship(back_populates="variants")


class ProductImage(Base):
    __tablename__ = "ProductImage"

    id: Mapped[str] = id_column()
    product_id: Mapped[str] = fk("productId", "Product.id")
    url: Mapped[str] = mapped_column(Text)
    key: Mapped[str] = mapped_column(Text)
    alt: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column("sortOrder", Integer, default=0)
    created_at: Mapped[datetime] = created_at_column()

    product: Mapped[Product] = relationship(back_populates="images")


class WhatsAppConnection(Base):
    __tablename__ = "WhatsAppConnection"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = mapped_column("companyId", Text, ref("Company.id"))
    # Nullable mientras el onboarding BYO / provisión aún no tiene sender.
    twilio_whatsapp_number: Mapped[str | None] = mapped_column("twilioWhatsAppNumber", Text)
    display_phone_number: Mapped[str | None] = mapped_column("displayPhoneNumber", Text)
    mode: Mapped[str] = mapped_column(WaModeEnum, default="dedicated")
    connection_kind: Mapped[str] = mapped_column(
        "connectionKind", WaConnectionKindEnum, default="platform_number"
    )
    onboarding_status: Mapped[str] = mapped_column(
        "onboardingStatus", WaOnboardingStatusEnum, default="online"
    )
    waba_id: Mapped[str | None] = mapped_column("wabaId", Text)
    meta_phone_number_id: Mapped[str | None] = mapped_column("metaPhoneNumberId", Text)
    twilio_subaccount_sid: Mapped[str | None] = mapped_column("twilioSubaccountSid", Text)
    twilio_sender_sid: Mapped[str | None] = mapped_column("twilioSenderSid", Text)
    onboarding_error: Mapped[str | None] = mapped_column("onboardingError", Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, default=True)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    company: Mapped[Company] = relationship(back_populates="whatsapp_connection")


class WhatsAppNumberRequest(Base):
    """Número de plataforma pedido por una tienda de pago; existe mientras está pendiente."""

    __tablename__ = "WhatsAppNumberRequest"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    # Solo `platform_number` en el flujo actual; BYO va por Embedded Signup.
    kind: Mapped[str] = mapped_column(Text)
    phone_number: Mapped[str | None] = mapped_column("phoneNumber", Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    company: Mapped[Company] = relationship(back_populates="whatsapp_number_request")


class Conversation(Base):
    __tablename__ = "Conversation"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    wa_connection_id: Mapped[str | None] = fk("waConnectionId", "WhatsAppConnection.id", nullable=True)
    customer_wa_id: Mapped[str] = mapped_column("customerWaId", Text)
    customer_name: Mapped[str | None] = mapped_column("customerName", Text)
    handler: Mapped[str] = mapped_column(ConversationHandlerEnum, default="pending")
    is_playground: Mapped[bool] = mapped_column("isPlayground", Boolean, default=False)
    last_message_at: Mapped[datetime] = mapped_column("lastMessageAt", Timestamp, default=utcnow)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    wa_connection: Mapped[WhatsAppConnection | None] = relationship()


class Message(Base):
    __tablename__ = "Message"

    id: Mapped[str] = id_column()
    conversation_id: Mapped[str] = fk("conversationId", "Conversation.id")
    direction: Mapped[str] = mapped_column(MessageDirectionEnum)
    wamid: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text, default="text")
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(MessageStatusEnum)
    interactive: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    raw_payload: Mapped[Any | None] = mapped_column("rawPayload", JSONB(none_as_null=True))
    created_at: Mapped[datetime] = created_at_column()


class WhatsAppContentTemplate(Base):
    __tablename__ = "WhatsAppContentTemplate"

    id: Mapped[str] = id_column()
    hash: Mapped[str] = mapped_column(Text)
    content_sid: Mapped[str] = mapped_column("contentSid", Text)
    kind: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()


class KnowledgeDocument(Base):
    __tablename__ = "KnowledgeDocument"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    title: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(KnowledgeTypeEnum)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(KnowledgeStatusEnum, default="draft")
    file_key: Mapped[str | None] = mapped_column("fileKey", Text)
    file_name: Mapped[str | None] = mapped_column("fileName", Text)
    mime_type: Mapped[str | None] = mapped_column("mimeType", Text)
    # Vigencia del documento (añadido en migración 202610071945)
    is_current: Mapped[bool] = mapped_column("isCurrent", Boolean, default=True, server_default=text("true"))
    """False si el documento ha sido reemplazado o marcado como obsoleto."""
    valid_until: Mapped[datetime | None] = mapped_column("validUntil", Timestamp)
    """Fecha límite de vigencia. NULL = sin vencimiento."""
    version: Mapped[int] = mapped_column("version", Integer, default=1, server_default=text("1"))
    """Versión del documento para trazabilidad."""
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()


class KnowledgeChunk(Base):
    __tablename__ = "KnowledgeChunk"

    id: Mapped[str] = id_column()
    document_id: Mapped[str] = fk("documentId", "KnowledgeDocument.id")
    company_id: Mapped[str] = mapped_column("companyId", Text)
    content: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column("chunkIndex", Integer)
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    created_at: Mapped[datetime] = created_at_column()


class Cart(Base):
    __tablename__ = "Cart"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    conversation_id: Mapped[str] = mapped_column("conversationId", Text, ref("Conversation.id"))
    checkout_pending: Mapped[bool] = mapped_column("checkoutPending", Boolean, default=False)
    shipping_name: Mapped[str | None] = mapped_column("shippingName", Text)
    shipping_phone: Mapped[str | None] = mapped_column("shippingPhone", Text)
    shipping_address: Mapped[str | None] = mapped_column("shippingAddress", Text)
    shipping_city: Mapped[str | None] = mapped_column("shippingCity", Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    items: Mapped[list[CartItem]] = relationship(
        back_populates="cart",
        order_by="CartItem.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CartItem(Base):
    __tablename__ = "CartItem"

    id: Mapped[str] = id_column()
    cart_id: Mapped[str] = fk("cartId", "Cart.id")
    variant_id: Mapped[str] = fk("variantId", "ProductVariant.id", ondelete="RESTRICT")
    quantity: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    cart: Mapped[Cart] = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship()


class Order(Base):
    __tablename__ = "Order"

    id: Mapped[str] = id_column()
    number: Mapped[str] = mapped_column(Text)
    company_id: Mapped[str] = fk("companyId", "Company.id")
    conversation_id: Mapped[str | None] = fk(
        "conversationId", "Conversation.id", nullable=True, ondelete="SET NULL"
    )
    customer_wa_id: Mapped[str | None] = mapped_column("customerWaId", Text)
    channel: Mapped[str] = mapped_column(OrderChannelEnum, default="whatsapp")
    in_store_payment_method: Mapped[str | None] = mapped_column("inStorePaymentMethod", InStorePaymentEnum)
    status: Mapped[str] = mapped_column(OrderStatusEnum, default="awaiting_payment")
    currency: Mapped[str] = mapped_column(Text, default="COP")
    subtotal: Mapped[Decimal] = mapped_column(Money)
    shipping_cost: Mapped[Decimal] = mapped_column("shippingCost", Money, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Money)
    shipping_name: Mapped[str | None] = mapped_column("shippingName", Text)
    shipping_phone: Mapped[str | None] = mapped_column("shippingPhone", Text)
    shipping_address: Mapped[str | None] = mapped_column("shippingAddress", Text)
    shipping_country: Mapped[str | None] = mapped_column("shippingCountry", Text)
    shipping_region: Mapped[str | None] = mapped_column("shippingRegion", Text)
    shipping_city: Mapped[str | None] = mapped_column("shippingCity", Text)
    notes: Mapped[str | None] = mapped_column(Text)
    stock_decremented: Mapped[bool] = mapped_column("stockDecremented", Boolean, default=True)
    checkout_token: Mapped[str | None] = mapped_column("checkoutToken", Text)
    checkout_expires_at: Mapped[datetime | None] = mapped_column("checkoutExpiresAt", Timestamp)
    mp_preference_id: Mapped[str | None] = mapped_column("mpPreferenceId", Text)
    mp_payment_id: Mapped[str | None] = mapped_column("mpPaymentId", Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", order_by="OrderItem.id", cascade="all, delete-orphan", passive_deletes=True
    )
    company: Mapped[Company] = relationship()


class OrderItem(Base):
    __tablename__ = "OrderItem"

    id: Mapped[str] = id_column()
    order_id: Mapped[str] = fk("orderId", "Order.id")
    variant_id: Mapped[str | None] = mapped_column("variantId", Text)
    product_name: Mapped[str] = mapped_column("productName", Text)
    variant_name: Mapped[str] = mapped_column("variantName", Text)
    sku: Mapped[str] = mapped_column(Text)
    unit_price: Mapped[Decimal] = mapped_column("unitPrice", Money)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column("lineTotal", Money)

    order: Mapped[Order] = relationship(back_populates="items")


class Plan(Base):
    __tablename__ = "Plan"

    id: Mapped[str] = id_column()
    code: Mapped[str] = mapped_column(PlanCodeEnum)
    name: Mapped[str] = mapped_column(Text)
    price_usd_cents: Mapped[int] = mapped_column("priceUsdCents", Integer, default=0)
    max_members: Mapped[int] = mapped_column("maxMembers", Integer)
    max_products: Mapped[int] = mapped_column("maxProducts", Integer)
    max_variants: Mapped[int] = mapped_column("maxVariants", Integer)
    max_wa_messages_month: Mapped[int] = mapped_column("maxWaMessagesMonth", Integer)
    max_ai_replies_month: Mapped[int] = mapped_column("maxAiRepliesMonth", Integer)
    max_knowledge_docs: Mapped[int] = mapped_column("maxKnowledgeDocs", Integer)
    is_public: Mapped[bool] = mapped_column("isPublic", Boolean, default=True)
    sort_order: Mapped[int] = mapped_column("sortOrder", Integer, default=0)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()


class Subscription(Base):
    __tablename__ = "Subscription"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = mapped_column("companyId", Text, ref("Company.id"))
    plan_id: Mapped[str] = mapped_column("planId", Text, ref("Plan.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(SubscriptionStatusEnum, default="trialing")
    trial_ends_at: Mapped[datetime | None] = mapped_column("trialEndsAt", Timestamp)
    current_period_start: Mapped[datetime | None] = mapped_column("currentPeriodStart", Timestamp)
    current_period_end: Mapped[datetime | None] = mapped_column("currentPeriodEnd", Timestamp)
    billing_interval: Mapped[str | None] = mapped_column("billingInterval", BillingIntervalEnum)
    cancel_at_period_end: Mapped[bool] = mapped_column("cancelAtPeriodEnd", Boolean, default=False)
    desired_plan_id: Mapped[str | None] = mapped_column(
        "desiredPlanId", Text, ref("Plan.id", ondelete="SET NULL")
    )
    desired_billing_interval: Mapped[str | None] = mapped_column(
        "desiredBillingInterval", BillingIntervalEnum
    )
    mp_preference_id: Mapped[str | None] = mapped_column("mpPreferenceId", Text)
    mp_preapproval_id: Mapped[str | None] = mapped_column("mpPreapprovalId", Text)
    mp_payment_id: Mapped[str | None] = mapped_column("mpPaymentId", Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    company: Mapped[Company] = relationship(back_populates="subscription")
    plan: Mapped[Plan] = relationship(foreign_keys=[plan_id])
    desired_plan: Mapped[Plan | None] = relationship(foreign_keys=[desired_plan_id])


class UsageCounter(Base):
    __tablename__ = "UsageCounter"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    period_key: Mapped[str] = mapped_column("periodKey", Text)
    wa_inbound_count: Mapped[int] = mapped_column("waInboundCount", Integer, default=0)
    ai_reply_count: Mapped[int] = mapped_column("aiReplyCount", Integer, default=0)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()


class PlatformSettings(Base):
    """Ajustes de plataforma editados desde el panel: una sola fila (`id = 'default'`).

    `NULL` en una columna significa "usar el valor del `.env`"."""

    __tablename__ = "PlatformSettings"

    id: Mapped[str] = mapped_column("id", Text, primary_key=True)
    whatsapp_simulate_send: Mapped[bool | None] = mapped_column("whatsappSimulateSend", Boolean)
    updated_at: Mapped[datetime] = updated_at_column()


class AiUsage(Base):
    __tablename__ = "AiUsage"

    id: Mapped[str] = id_column()
    company_id: Mapped[str] = fk("companyId", "Company.id")
    conversation_id: Mapped[str | None] = mapped_column("conversationId", Text, nullable=True)
    customer_phone: Mapped[str | None] = mapped_column("customerPhone", Text, nullable=True)
    created_at: Mapped[datetime] = created_at_column()


# Índices con los nombres de la base (heredados de Prisma).
Index("AiUsage_companyId_idx", AiUsage.company_id)
Index("AiUsage_conversationId_idx", AiUsage.conversation_id)
Index("AiUsage_customerPhone_idx", AiUsage.customer_phone)
Index("AiUsage_createdAt_idx", AiUsage.created_at)
Index("Cart_companyId_idx", Cart.company_id)
Index("Cart_conversationId_key", Cart.conversation_id, unique=True)
Index("CartItem_cartId_variantId_key", CartItem.cart_id, CartItem.variant_id, unique=True)
Index("CartItem_variantId_idx", CartItem.variant_id)
Index("Category_companyId_idx", Category.company_id)
Index("Category_companyId_slug_key", Category.company_id, Category.slug, unique=True)
Index("Company_ownerId_key", Company.owner_id, unique=True)
Index("CompanyMembership_companyId_idx", CompanyMembership.company_id)
Index(
    "CompanyMembership_userId_companyId_key",
    CompanyMembership.user_id,
    CompanyMembership.company_id,
    unique=True,
)
Index("Conversation_companyId_handler_idx", Conversation.company_id, Conversation.handler)
Index("Conversation_companyId_idx", Conversation.company_id)
Index("Conversation_companyId_isPlayground_idx", Conversation.company_id, Conversation.is_playground)
Index("Conversation_companyId_lastMessageAt_idx", Conversation.company_id, Conversation.last_message_at)
Index(
    "Conversation_waConnectionId_customerWaId_key",
    Conversation.wa_connection_id,
    Conversation.customer_wa_id,
    unique=True,
)
Index("Invitation_companyId_email_key", Invitation.company_id, Invitation.email, unique=True)
Base.metadata.tables["Invitation"].append_constraint(UniqueConstraint("token", name="Invitation_token_key"))
Index("KnowledgeChunk_companyId_idx", KnowledgeChunk.company_id)
Index(
    "KnowledgeChunk_documentId_chunkIndex_key",
    KnowledgeChunk.document_id,
    KnowledgeChunk.chunk_index,
    unique=True,
)
Index("KnowledgeChunk_documentId_idx", KnowledgeChunk.document_id)
Index("KnowledgeDocument_companyId_idx", KnowledgeDocument.company_id)
Index("KnowledgeDocument_companyId_status_idx", KnowledgeDocument.company_id, KnowledgeDocument.status)
Index(
    "KnowledgeDocument_companyId_type_key", KnowledgeDocument.company_id, KnowledgeDocument.type, unique=True
)
Index("MercadoPagoConnection_companyId_key", MercadoPagoConnection.company_id, unique=True)
Index("Message_conversationId_createdAt_idx", Message.conversation_id, Message.created_at)
Index("Message_wamid_idx", Message.wamid)
Index("Order_checkoutToken_key", Order.checkout_token, unique=True)
Index("Order_companyId_channel_idx", Order.company_id, Order.channel)
Index("Order_companyId_createdAt_idx", Order.company_id, Order.created_at)
Index("Order_companyId_idx", Order.company_id)
Index("Order_companyId_number_key", Order.company_id, Order.number, unique=True)
Index("Order_companyId_status_idx", Order.company_id, Order.status)
Index("Order_conversationId_idx", Order.conversation_id)
Index("Order_customerWaId_idx", Order.customer_wa_id)
Index("Order_mpPaymentId_idx", Order.mp_payment_id)
Index("OrderItem_orderId_idx", OrderItem.order_id)
Index("PasswordResetToken_tokenHash_key", PasswordResetToken.token_hash, unique=True)
Index("PasswordResetToken_userId_idx", PasswordResetToken.user_id)
Index("PendingRegistration_email_key", PendingRegistration.email, unique=True)
Index("PendingRegistration_expiresAt_idx", PendingRegistration.expires_at)
Index("PendingRegistration_mpPreapprovalId_idx", PendingRegistration.mp_preapproval_id)
Index("Plan_code_key", Plan.code, unique=True)
Index("Product_categoryId_idx", Product.category_id)
Index("Product_companyId_idx", Product.company_id)
Index("Product_companyId_status_idx", Product.company_id, Product.status)
Index("ProductImage_productId_idx", ProductImage.product_id)
Index("ProductVariant_productId_idx", ProductVariant.product_id)
Index("ProductVariant_productId_sku_key", ProductVariant.product_id, ProductVariant.sku, unique=True)
Index("RefreshToken_tokenHash_key", RefreshToken.token_hash, unique=True)
Index("RefreshToken_userId_idx", RefreshToken.user_id)
Index("Subscription_companyId_key", Subscription.company_id, unique=True)
Index("Subscription_mpPreapprovalId_idx", Subscription.mp_preapproval_id)
Index("Subscription_planId_idx", Subscription.plan_id)
Index("Subscription_status_idx", Subscription.status)
Index("UsageCounter_companyId_idx", UsageCounter.company_id)
Index("UsageCounter_companyId_periodKey_key", UsageCounter.company_id, UsageCounter.period_key, unique=True)
Index("User_email_key", User.email, unique=True)
Index("WhatsAppConnection_companyId_key", WhatsAppConnection.company_id, unique=True)
Index(
    "WhatsAppConnection_dedicated_number_key",
    WhatsAppConnection.twilio_whatsapp_number,
    unique=True,
    postgresql_where=text("mode = 'dedicated' AND \"twilioWhatsAppNumber\" IS NOT NULL"),
)
Index(
    "WhatsAppConnection_displayPhoneNumber_key",
    WhatsAppConnection.display_phone_number,
    unique=True,
    postgresql_where=text('"displayPhoneNumber" IS NOT NULL'),
)
Index("WhatsAppNumberRequest_companyId_key", WhatsAppNumberRequest.company_id, unique=True)
Index("WhatsAppConnection_twilioWhatsAppNumber_idx", WhatsAppConnection.twilio_whatsapp_number)
Index("WhatsAppContentTemplate_hash_key", WhatsAppContentTemplate.hash, unique=True)
