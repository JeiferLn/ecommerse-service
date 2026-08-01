import type { Metadata } from "next";

import { MembersSection } from "@/components/members-section";

export const metadata: Metadata = {
  title: "Miembros | Commerce AI SaaS",
};

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Miembros</h1>
      <MembersSection />
    </div>
  );
}
