import type { Metadata } from "next";

import { PlatformDashboard } from "@/components/platform-dashboard";

export const metadata: Metadata = {
  title: "Admin | Commerce AI SaaS",
};

export default function AdminPage() {
  return <PlatformDashboard />;
}
