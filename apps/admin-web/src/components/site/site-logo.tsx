import { MessageSquareText } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function SiteLogo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Commerce AI, inicio"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
        <MessageSquareText className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
        Commerce AI
      </span>
    </Link>
  );
}
