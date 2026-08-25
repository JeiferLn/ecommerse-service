import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen w-full">
      {/* Visual panel — full height with product image */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:p-16 md:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1600&h=2000&fit=crop&q=80"
          alt="Emprendedora gestionando pedidos y atención a clientes desde el celular"
          className="absolute inset-0 size-full object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-[#0a0c14]/95 via-[#0a0c14]/55 to-[#0a0c14]/25"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-[#0a0c14]/40 via-transparent to-[#0040e0]/15"
        />

        <div className="relative z-10">
          <BrandMark size="md" className="text-white [&_span:last-child_span]:text-[#b8c3ff]" />
        </div>

        <div className="relative z-10 mb-6 max-w-md">
          <h2 className="font-heading mb-4 text-4xl font-bold tracking-tight text-white lg:text-5xl xl:text-6xl">
            Vende mientras
            <br />
            <span className="text-gradient-primary">duermes.</span>
          </h2>
          <p className="text-lg leading-relaxed text-white/75">
            Tu asistente en WhatsApp atiende 24/7, muestra el catálogo y cierra pedidos con Mercado
            Pago.
          </p>
        </div>
      </aside>

      {/* Form panel — full height */}
      <section className="relative flex w-full flex-col justify-center bg-background px-6 py-12 sm:px-10 md:w-1/2 md:px-14 lg:px-20 dark:bg-[#0c0e17]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[10%] -bottom-[15%] size-[45%] rounded-full bg-[radial-gradient(circle,rgba(46,91,255,0.08)_0%,transparent_60%)] md:hidden dark:bg-[radial-gradient(circle,rgba(46,91,255,0.14)_0%,transparent_60%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="mb-8 flex justify-center md:hidden">
            <BrandMark size="md" />
          </div>

          <div className="mb-8">
            <h1 className="font-heading mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Bienvenido de nuevo
            </h1>
            <p className="text-muted-foreground">
              Ingresa tus credenciales para acceder al panel de tu tienda.
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            ¿No tienes una cuenta?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
