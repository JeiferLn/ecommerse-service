import type { Metadata } from "next";

import { CompanyDashboard } from "@/components/company-dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Commerce AI SaaS",
};

export default function DashboardPage() {
  return <CompanyDashboard />;
}
