import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCentered } from "@/components/auth/auth-centered";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { accentWords } from "@/components/site/words";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
};

export default function ResetPasswordPage() {
  return (
    <AuthCentered
      title={
        <>
          Crea una <span className={accentWords}>nueva contraseña.</span>
        </>
      }
      description="Usa al menos 8 caracteres. Después podrás entrar con ella."
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCentered>
  );
}
