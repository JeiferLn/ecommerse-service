import type { Metadata } from "next";

import { AdminWhatsAppCloudTestSection } from "@/components/admin-whatsapp-cloud-test-section";

export const metadata: Metadata = {
  title: "WhatsApp Test",
};

export default function AdminWhatsAppTestPage() {
  return <AdminWhatsAppCloudTestSection />;
}
