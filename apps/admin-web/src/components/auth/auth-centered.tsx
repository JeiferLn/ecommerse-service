import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { SiteLogo } from "@/components/site/site-logo";

function rise(delay: number): CSSProperties {
  return { "--d": `${delay}ms` } as CSSProperties;
}

/** Columna sobria para forgot / reset / invitación. */
export function AuthCentered({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="paper-grid absolute inset-0" />
        <div className="absolute top-1/3 left-1/2 size-144 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="relative mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 lg:px-10">
        <SiteLogo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver al inicio
        </Link>
      </header>

      <main className="relative flex flex-1 items-start justify-center px-5 pt-12 pb-20 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <h1
            style={rise(0)}
            className="word-rise tracking-display text-4xl leading-tight font-semibold text-balance sm:text-5xl"
          >
            {title}
          </h1>
          {description ? (
            <p
              style={rise(120)}
              className="word-rise mt-4 text-base leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
          <div
            style={rise(240)}
            className="word-rise mt-8 rounded-2xl border border-border bg-card p-6 shadow-[0_24px_60px_-30px_oklch(0.2_0.012_60/0.35)] sm:p-8"
          >
            {children}
          </div>
          {footer ? (
            <div style={rise(360)} className="word-rise mt-6 text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
