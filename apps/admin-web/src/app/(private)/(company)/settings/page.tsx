import type { Metadata } from "next";

import { CompanySettingsForm } from "@/components/company-settings-form";

export const metadata: Metadata = {
  title: "Tienda",
};

export default function SettingsPage() {
  return <CompanySettingsForm />;
}
