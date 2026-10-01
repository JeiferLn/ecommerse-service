import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { accentWords } from "@/components/site/words";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default function RegisterPage() {
  return (
    <AuthShell
      variant="register"
      title={
        <>
          Crea la cuenta <span className={accentWords}>de tu tienda.</span>
        </>
      }
      description="Free incluye 15 días de prueba. Pro y Business se activan al pagar en Mercado Pago."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Inicia sesión
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
