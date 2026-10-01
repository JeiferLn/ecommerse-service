import type { Metadata } from "next";

import { PlatformDashboard } from "@/components/platform-dashboard";

export const metadata: Metadata = {
  title: "Plataforma",
};

export default function AdminPage() {
  return <PlatformDashboard />;
}
