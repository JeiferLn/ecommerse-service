import type { Metadata } from "next";

import { MembersSection } from "@/components/members-section";

export const metadata: Metadata = {
  title: "Equipo",
};

export default function MembersPage() {
  return <MembersSection />;
}
