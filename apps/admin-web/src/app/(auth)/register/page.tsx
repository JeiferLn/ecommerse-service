import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Crear cuenta | Commerce AI SaaS",
};

export default function RegisterPage() {
  return (
    <main className="relative flex h-dvh max-h-dvh w-full overflow-hidden">
      {/* Visual panel — fixed to viewport */}
      <aside className="relative hidden h-full w-1/2 shrink-0 flex-col justify-between overflow-hidden p-12 lg:p-16 md:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&h=2000&fit=crop&q=80"
          alt="Tienda retail lista para vender en línea y por WhatsApp"
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
            Empieza a vender
            <br />
            <span className="text-gradient-primary">en piloto automático.</span>
          </h2>
          <p className="text-lg leading-relaxed text-white/75">
            Crea tu cuenta, conecta WhatsApp y deja que el asistente atienda clientes mientras tú
            creces la tienda.
          </p>
        </div>
      </aside>

      {/* Form panel — internal scroll */}
      <section className="relative flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain bg-background md:w-1/2 dark:bg-[#0c0e17]">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12 sm:px-10 md:px-14 lg:px-16 md:py-14">
          <div className="mb-8 flex justify-center md:hidden">
            <BrandMark size="md" />
          </div>

          <div className="mb-8">
            <h1 className="font-heading mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Crear cuenta
            </h1>
            <p className="text-muted-foreground">
              Empieza a vender por WhatsApp con IA. Free incluye 15 días de prueba.
            </p>
          </div>

          <RegisterForm />

          <p className="mt-8 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
