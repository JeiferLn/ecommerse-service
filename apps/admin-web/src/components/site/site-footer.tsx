import Link from "next/link";

import { SiteLogo } from "@/components/site/site-logo";

const COLUMNS = [
  {
    title: "Producto",
    links: [
      { href: "/#recorrido", label: "Cómo funciona" },
      { href: "/#equipo", label: "Tu panel" },
      { href: "/#preguntas", label: "Preguntas frecuentes" },
      { href: "/pricing", label: "Planes" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { href: "/login", label: "Entrar" },
      { href: "/register?plan=free", label: "Crear cuenta" },
      { href: "/forgot-password", label: "Recuperar contraseña" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-5">
          <SiteLogo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            El vendedor de tu tienda en WhatsApp. Responde con tu catálogo y cobra en el chat.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav
            key={column.title}
            aria-label={column.title}
            className="lg:col-span-3 lg:first-of-type:col-start-7"
          >
            <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
              {column.title}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm text-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-muted-foreground lg:px-10">
          © 2026 Commerce AI. Pagos procesados por Mercado Pago.
        </p>
      </div>
    </footer>
  );
}
