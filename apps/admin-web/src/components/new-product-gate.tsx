"use client";

import { canManageCatalog } from "@commerce-ai/types";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ProductEditor } from "@/components/product-editor";
import { useSession } from "@/providers/session-provider";

export function NewProductGate({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useSession();
  const allowed = Boolean(user && canManageCatalog(user.role));

  useEffect(() => {
    if (!isLoading && user && !allowed) {
      router.replace("/products");
    }
  }, [allowed, isLoading, router, user]);

  if (isLoading || !user) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">No tienes permiso para crear productos.</p>;
  }

  return children ?? <ProductEditor />;
}
