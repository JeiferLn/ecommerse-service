import type { Metadata } from "next";
import { Suspense } from "react";

import PublicCheckoutClient from "./public-checkout-client";

export const metadata: Metadata = {
  title: "Checkout | Commerce AI SaaS",
};

export default function PublicCheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Cargando checkout…
        </main>
      }
    >
      <PublicCheckoutClient />
    </Suspense>
  );
}
