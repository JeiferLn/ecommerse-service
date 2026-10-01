import type { Metadata } from "next";

import { NewProductGate } from "@/components/new-product-gate";

export const metadata: Metadata = {
  title: "Nuevo producto",
};

export default function NewProductPage() {
  return <NewProductGate />;
}
