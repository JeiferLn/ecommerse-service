import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  href?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE = {
  sm: {
    wrap: "gap-2 text-base",
    iconWrap: "size-7 rounded-lg",
    icon: "size-3.5",
  },
  md: {
    wrap: "gap-2.5 text-lg",
    iconWrap: "size-9 rounded-xl",
    icon: "size-4",
  },
  lg: {
    wrap: "gap-3 text-2xl sm:text-3xl",
    iconWrap: "size-11 rounded-2xl sm:size-12",
    icon: "size-5 sm:size-6",
  },
} as const;

export function BrandMark({ href = "/", className, size = "md" }: BrandMarkProps) {
  const s = SIZE[size];

  return (
    <Link
      href={href}
      className={cn(
        "font-heading inline-flex shrink-0 items-center font-bold tracking-tight whitespace-nowrap text-foreground",
        s.wrap,
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--brand-glow)]",
          s.iconWrap,
        )}
      >
        <MessageCircle className={s.icon} aria-hidden strokeWidth={2.25} />
      </span>
      <span>
        Commerce <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
