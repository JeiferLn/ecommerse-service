import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <Card className="w-full border-border/70 bg-card/80 shadow-brand backdrop-blur-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold">Iniciar sesión</CardTitle>
        <CardDescription>Accede a tu cuenta para administrar tu negocio.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
          <p>
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-medium text-foreground hover:underline">
              Regístrate
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
