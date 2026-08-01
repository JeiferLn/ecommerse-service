import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Recuperar contraseña | Commerce AI SaaS",
};

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>
          Ingresa tu email y te enviaremos un enlace para restablecerla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
