"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteLogo } from "@/components/site/site-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#recorrido", label: "Cómo funciona" },
  { href: "/#equipo", label: "Tu panel" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/pricing", label: "Planes", key: "pricing" },
] as const;

const linkClass =
  "rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none";

export function SiteHeader({
  current,
  tone = "paper",
}: {
  current?: "pricing";
  tone?: "paper" | "ink";
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled || open ? "border-border" : "border-transparent",
        tone === "ink" && !scrolled && !open ? "site-ink bg-transparent" : "bg-background",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 lg:px-10">
        <SiteLogo />

        <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={"key" in item && current === item.key ? "page" : undefined}
              className={cn(linkClass, "key" in item && current === item.key && "text-foreground")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(linkClass, "hidden px-3 py-2 md:inline-flex")}>
            Entrar
          </Link>
          <Button asChild size="sm" className="h-9 px-3.5">
            <Link href="/register?plan=free">
              Probar 15 días
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Principal"
          className="border-t border-border px-5 pt-2 pb-6 md:hidden"
        >
          <ul className="flex flex-col">
            {[...NAV, { href: "/login", label: "Entrar" }].map((item) => (
              <li key={item.href} className="border-b border-border last:border-b-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-4 text-base text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {item.label}
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
