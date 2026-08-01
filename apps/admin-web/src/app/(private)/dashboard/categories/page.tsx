import type { Metadata } from "next";

import { CategoriesSection } from "@/components/categories-section";

export const metadata: Metadata = {
  title: "Categorías | Commerce AI SaaS",
};

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Categorías</h1>
        <p className="text-muted-foreground">Clasifica los productos de tu empresa.</p>
      </div>
      <CategoriesSection />
    </div>
  );
}
