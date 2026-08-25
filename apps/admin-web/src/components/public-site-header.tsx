import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PublicSiteHeader({ current }: { current?: "pricing" }) {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 py-4 pl-5 pr-14 sm:px-10 sm:pr-16">
        <BrandMark size="md" />
        <nav className="flex items-center gap-1 sm:gap-4">
          <Link
            href="/pricing"
            className={cn(
              "hidden text-sm font-medium transition-colors sm:inline",
              current === "pricing"
                ? "border-b-2 border-primary pb-0.5 font-semibold text-primary"
                : "text-muted-foreground hover:text-primary",
            )}
          >
            Planes
          </Link>
          <Button variant="ghost" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            <Link href="/register?plan=free">
              Probar gratis
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </nav>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 sm:right-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
