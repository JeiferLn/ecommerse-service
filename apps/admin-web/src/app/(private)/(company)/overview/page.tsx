import type { Metadata } from "next";

import { CompanyDashboard } from "@/components/company-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return <CompanyDashboard />;
}
