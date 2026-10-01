import type { Metadata } from "next";
import Link from "next/link";

import { AuthCentered } from "@/components/auth/auth-centered";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { accentWords } from "@/components/site/words";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCentered
      title={
        <>
          Recupera <span className={accentWords}>tu contraseña.</span>
        </>
      }
      description="Escribe el email de tu cuenta y te enviaremos un enlace para crear una nueva."
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Volver a iniciar sesión
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCentered>
  );
}
