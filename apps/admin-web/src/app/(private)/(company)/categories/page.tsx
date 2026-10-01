import type { Metadata } from "next";

import { CategoriesSection } from "@/components/categories-section";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Categorías",
};

export default function CategoriesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Categorías"
        description="Agrupan tus productos para filtrarlos y para que el asistente recomiende mejor."
        className="mb-6"
      />
      <CategoriesSection />
    </div>
  );
}
