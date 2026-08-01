import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
};

export default function ResetPasswordPage() {
  return (
    <Card className="w-full border-border/70 bg-card/80 shadow-brand backdrop-blur-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold">Restablecer contraseña</CardTitle>
        <CardDescription>Ingresa tu nueva contraseña para acceder a tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
