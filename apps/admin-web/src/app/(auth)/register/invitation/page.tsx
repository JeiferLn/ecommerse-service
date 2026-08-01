import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { InvitationRegisterForm } from "@/components/auth/invitation-register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Aceptar invitación | Commerce AI SaaS",
};

export default function InvitationRegisterPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Únete a la empresa</CardTitle>
        <CardDescription>
          Te invitaron a colaborar. Solo necesitas tu nombre y una contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando invitación…</p>}>
          <InvitationRegisterForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Quieres tu propia empresa?{" "}
          <Link href="/register" className="text-foreground hover:underline">
            Regístrate aquí
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
