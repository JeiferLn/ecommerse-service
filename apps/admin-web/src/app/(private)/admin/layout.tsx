import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-1">
      <AdminSidebar />
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col px-4 py-6 sm:px-8 lg:py-8">
        {children}
      </div>
    </div>
  );
}
