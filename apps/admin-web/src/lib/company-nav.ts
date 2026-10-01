import {
  canManageBilling,
  canManageKnowledge,
  canManageWhatsapp,
  canOperateOrders,
  canViewCatalog,
  canViewMembers,
  canViewWhatsapp,
  type UserRole,
} from "@commerce-ai/types";
import {
  BookOpenText,
  ClipboardList,
  CreditCard,
  FlaskConical,
  FolderTree,
  House,
  MessagesSquare,
  Package,
  Radio,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type CompanyRole = Exclude<UserRole, "admin">;

export interface CompanyNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rutas extra que marcan el ítem como activo. */
  matches?: string[];
  /** Rutas que, aunque empiecen igual, pertenecen a otro ítem. */
  excludes?: string[];
  badge?: "pendingConversations";
  visible: (role: CompanyRole) => boolean;
}

export interface CompanyNavGroup {
  id: string;
  label: string;
  items: CompanyNavItem[];
}

const everyone = () => true;

export const COMPANY_NAV: CompanyNavGroup[] = [
  {
    id: "operation",
    label: "Operación",
    items: [
      { href: "/", label: "Inicio", icon: House, visible: everyone },
      {
        href: "/whatsapp/inbox",
        label: "Conversaciones",
        icon: MessagesSquare,
        badge: "pendingConversations",
        visible: canViewWhatsapp,
      },
      {
        href: "/orders",
        label: "Pedidos",
        icon: ClipboardList,
        matches: ["/sales"],
        visible: canOperateOrders,
      },
    ],
  },
  {
    id: "catalog",
    label: "Catálogo",
    items: [
      { href: "/products", label: "Productos", icon: Package, visible: canViewCatalog },
      { href: "/categories", label: "Categorías", icon: FolderTree, visible: canViewCatalog },
    ],
  },
  {
    id: "assistant",
    label: "Asistente",
    items: [
      {
        href: "/assistant/playground",
        label: "Prueba tu asistente",
        icon: FlaskConical,
        visible: canManageWhatsapp,
      },
      {
        href: "/knowledge",
        label: "Conocimiento",
        icon: BookOpenText,
        visible: canManageKnowledge,
      },
      {
        href: "/whatsapp",
        label: "Canal WhatsApp",
        icon: Radio,
        excludes: ["/whatsapp/inbox"],
        visible: canManageWhatsapp,
      },
    ],
  },
  {
    id: "settings",
    label: "Configuración",
    items: [
      {
        href: "/settings",
        label: "Tienda",
        icon: Store,
        excludes: ["/settings/payments", "/settings/shipping"],
        visible: everyone,
      },
      {
        href: "/settings/payments",
        label: "Pagos",
        icon: CreditCard,
        visible: canManageWhatsapp,
      },
      {
        href: "/settings/shipping",
        label: "Envíos",
        icon: Truck,
        visible: canManageWhatsapp,
      },
      { href: "/members", label: "Equipo", icon: Users, visible: canViewMembers },
      { href: "/billing", label: "Facturación", icon: Wallet, visible: canManageBilling },
    ],
  },
];

export function isNavItemActive(item: CompanyNavItem, pathname: string): boolean {
  if (item.excludes?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }
  const paths = [item.href, ...(item.matches ?? [])];
  return paths.some((path) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function visibleNav(role: UserRole | undefined): CompanyNavGroup[] {
  if (!role || role === "admin") {
    return [];
  }
  return COMPANY_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible(role)),
  })).filter((group) => group.items.length > 0);
}
