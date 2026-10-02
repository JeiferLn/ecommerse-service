import type { Metadata } from "next";

import { AdminPlatformSettingsSection } from "@/components/admin-platform-settings-section";

export const metadata: Metadata = {
  title: "Configuración",
};

export default function AdminSettingsPage() {
  return <AdminPlatformSettingsSection />;
}
