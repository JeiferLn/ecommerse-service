import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrivateShell } from "@/components/private-shell";
import { AUTH_COOKIE, ROUTES } from "@/lib/routes";
import { verifyAccessToken } from "@/lib/session";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  if (!payload) {
    redirect(ROUTES.login);
  }

  return <PrivateShell isAdmin={payload.role === "ADMIN"}>{children}</PrivateShell>;
}
