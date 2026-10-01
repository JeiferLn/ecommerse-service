import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { accentWords } from "@/components/site/words";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <AuthShell
      variant="login"
      title={
        <>
          Entra a <span className={accentWords}>tu tienda.</span>
        </>
      }
      description="Revisa los pedidos, las conversaciones y el stock de hoy."
      footer={
        <>
          ¿Todavía no tienes cuenta?{" "}
          <Link
            href="/register?plan=free"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Prueba 15 días gratis
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
