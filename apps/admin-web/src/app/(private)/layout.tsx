import { cookies } from "next/headers";
import { PrivateShell } from "@/components/private-shell";
import { ROLE_COOKIE } from "@/lib/routes";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = (await cookies()).get(ROLE_COOKIE)?.value;
  const isAdmin = role === "ADMIN";

  return <PrivateShell isAdmin={isAdmin}>{children}</PrivateShell>;
}
