import type { Metadata } from "next";

import { MembersSection } from "@/components/members-section";

export const metadata: Metadata = {
  title: "Miembros | Commerce AI SaaS",
};

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Miembros</h1>
      <MembersSection />
    </div>
  );
}
