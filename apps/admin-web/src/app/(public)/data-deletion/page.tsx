import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description:
    "Cómo solicitar la eliminación de datos de tu cuenta o de clientes en Commerce AI (requisito Meta / WhatsApp).",
};

const UPDATED = "7 de octubre de 2026";

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "resumen",
    title: "1. Resumen",
    body: (
      <p>
        Esta página explica cómo pedir que borremos datos personales asociados a Commerce AI. Es la
        instrucción pública de eliminación de datos para usuarios de la plataforma y para
        revisiones de Meta (WhatsApp / Embedded Signup). Complementa la{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Política de privacidad
        </Link>
        .
      </p>
    ),
  },
  {
    id: "cuenta",
    title: "2. Si tienes cuenta en Commerce AI",
    body: (
      <>
        <p>Puedes solicitar la eliminación de tu cuenta y de los datos asociados así:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Entra al panel con tu usuario (si aún puedes acceder) y, si está disponible, usa la
            opción de cerrar o eliminar cuenta en configuración.
          </li>
          <li>
            O escribe a{" "}
            <a
              href="mailto:hola@ecommerce-ai.website?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
              className="underline underline-offset-4 hover:text-foreground"
            >
              hola@ecommerce-ai.website
            </a>{" "}
            con el asunto «Solicitud de eliminación de datos», el correo de la cuenta y, si aplica,
            el nombre de la empresa.
          </li>
        </ol>
        <p>
          Tras verificar la identidad, eliminaremos o anonimizaremos los datos de cuenta, catálogo,
          conversaciones y pedidos que no debamos conservar por ley, facturación o seguridad. Te
          confirmaremos por correo cuando el proceso esté en curso o completado.
        </p>
      </>
    ),
  },
  {
    id: "cliente",
    title: "3. Si eres cliente de una tienda (WhatsApp)",
    body: (
      <>
        <p>
          Si escribiste a una tienda que usa Commerce AI, esa tienda es la responsable de tus datos
          frente a ti. Para borrar o limitar el uso de tu historial de chat o datos de pedido:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Contacta primero a la tienda por el mismo canal o sus datos de contacto.</li>
          <li>
            Si la tienda nos pide ayuda técnica, o no responde y nos escribes indicando el número de
            WhatsApp usado y el nombre de la tienda, coordinaremos la eliminación en la medida en
            que los datos estén en nuestros sistemas y la ley lo permita.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "meta",
    title: "4. Datos vinculados a Meta / WhatsApp",
    body: (
      <p>
        Si conectaste un número o cuenta de WhatsApp Business a través de Meta, también puedes
        gestionar permisos y eliminación desde la configuración de tu cuenta de Meta / Facebook
        (apps y sitios web conectados). Cuando Meta nos notifique una solicitud de eliminación
        asociada a nuestra app, procesaremos la baja de los identificadores y datos vinculados que
        corresponda, salvo retención legal obligatoria.
      </p>
    ),
  },
  {
    id: "plazos",
    title: "5. Plazos y qué no se borra de inmediato",
    body: (
      <>
        <p>
          Procuramos completar las solicitudes en un plazo razonable (en la práctica, hasta 30 días
          salvo complejidad o verificación pendiente). Puede quedar una copia residual en copias de
          seguridad durante un período limitado hasta que se rotan.
        </p>
        <p>
          Podemos conservar lo mínimo necesario por obligaciones legales, prevención de fraude,
          disputas de pago o registros contables (por ejemplo, identificadores de facturación),
          anonimizado cuando sea posible.
        </p>
      </>
    ),
  },
  {
    id: "contacto",
    title: "6. Contacto",
    body: (
      <p>
        Eliminación de datos y privacidad:{" "}
        <a
          href="mailto:hola@ecommerce-ai.website?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
          className="underline underline-offset-4 hover:text-foreground"
        >
          hola@ecommerce-ai.website
        </a>
        . Términos:{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          /terms
        </Link>
        . Privacidad:{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          /privacy
        </Link>
        .
      </p>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-28 pb-20 lg:px-10">
        <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Eliminación de datos
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Última actualización: {UPDATED}</p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Instrucciones para solicitar que Commerce AI elimine datos de tu cuenta o, cuando
          corresponda, datos tratados por una tienda que usa nuestro servicio.
        </p>

        <nav aria-label="Índice" className="mt-10 rounded-lg border border-border bg-muted/30 p-5">
          <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">Índice</p>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 flex flex-col gap-12">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
