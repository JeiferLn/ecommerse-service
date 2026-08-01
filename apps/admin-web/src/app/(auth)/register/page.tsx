import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Crear cuenta | Commerce AI SaaS",
};

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Empieza a vender por WhatsApp con IA.</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
