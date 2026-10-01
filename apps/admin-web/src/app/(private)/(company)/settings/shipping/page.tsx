import type { Metadata } from "next";

import { CompanyCommerceSettingsForm } from "@/components/company-commerce-settings-form";

export const metadata: Metadata = {
  title: "Envíos",
};

export default function ShippingSettingsPage() {
  return <CompanyCommerceSettingsForm />;
}
