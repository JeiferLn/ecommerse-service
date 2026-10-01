import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCentered } from "@/components/auth/auth-centered";
import { InvitationRegisterForm } from "@/components/auth/invitation-register-form";
import { accentWords } from "@/components/site/words";

export const metadata: Metadata = {
  title: "Aceptar invitación",
};

export default function InvitationRegisterPage() {
  return (
    <AuthCentered
      title={
        <>
          Únete <span className={accentWords}>al equipo.</span>
        </>
      }
      description="Te invitaron a colaborar. Solo necesitas tu nombre y una contraseña."
      footer={
        <>
          ¿Quieres tu propia tienda?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Crea una cuenta
          </Link>
        </>
      }
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando invitación…</p>}>
        <InvitationRegisterForm />
      </Suspense>
    </AuthCentered>
  );
}
