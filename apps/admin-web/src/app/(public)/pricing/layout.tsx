import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Planes y precios",
  description:
    "Empieza con 15 días gratis, sin tarjeta. Pro y Business se cobran con Mercado Pago y cancelas cuando quieras.",
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
