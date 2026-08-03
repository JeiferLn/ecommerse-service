import type { Metadata } from "next";

import { AdminCompaniesSection } from "@/components/admin-companies-section";

export const metadata: Metadata = {
  title: "Empresas | Admin | Commerce AI SaaS",
};

export default function AdminCompaniesPage() {
  return <AdminCompaniesSection />;
}
