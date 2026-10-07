import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Términos de servicio",
  description:
    "Condiciones de uso de Commerce AI: cuenta, prueba gratuita, planes, WhatsApp, pagos con Mercado Pago y responsabilidades.",
};

const UPDATED = "7 de octubre de 2026";

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "servicio",
    title: "1. El servicio",
    body: (
      <>
        <p>
          Commerce AI es una plataforma SaaS que permite a tiendas gestionar catálogo, pedidos y un
          asistente conversacional conectado a WhatsApp, con cobro mediante Mercado Pago. El servicio
          se ofrece «tal cual» según el plan contratado y la disponibilidad de terceros (Twilio, Meta,
          Mercado Pago, proveedores de IA).
        </p>
        <p>
          Al crear una cuenta o usar el sitio aceptas estos términos. Si no estás de acuerdo, no uses
          el servicio.
        </p>
      </>
    ),
  },
  {
    id: "cuenta",
    title: "2. Cuenta y elegibilidad",
    body: (
      <>
        <p>
          Debes proporcionar datos veraces al registrarte y mantener la confidencialidad de tu
          acceso. Eres responsable de toda actividad realizada desde tu cuenta y de los usuarios que
          invites a tu empresa.
        </p>
        <p>
          El servicio está pensado para comercios que operan donde Mercado Pago está disponible. Tú
          garantizas que tienes derecho a vender los productos que publiques y a usar los números y
          cuentas de mensajería que conectes.
        </p>
      </>
    ),
  },
  {
    id: "prueba",
    title: "3. Prueba gratuita y planes",
    body: (
      <>
        <p>
          El plan Free incluye un período de prueba limitado (por ejemplo, 15 días) sin tarjeta,
          según lo indicado en{" "}
          <Link href="/pricing" className="underline underline-offset-4 hover:text-foreground">
            Planes
          </Link>
          . Al terminar la prueba, funciones como WhatsApp, IA o altas nuevas pueden pausarse hasta
          que actives un plan de pago; tu cuenta y catálogo se conservan salvo cancelación o
          eliminación.
        </p>
        <p>
          Los planes Pro y Business se cobran de forma recurrente con Mercado Pago. Los precios,
          cupos y límites vigentes son los publicados en la página de planes o en tu panel de
          facturación. Podemos modificar planes con aviso razonable; el uso continuado tras el
          aviso implica aceptación de los cambios aplicables a renovaciones futuras.
        </p>
      </>
    ),
  },
  {
    id: "pagos",
    title: "4. Pagos y reembolsos",
    body: (
      <>
        <p>
          Las suscripciones de la plataforma y los cobros a tus clientes por pedidos se procesan a
          través de Mercado Pago u otros procesadores que indiquemos. Commerce AI no almacena los
          datos completos de tu tarjeta.
        </p>
        <p>
          Los cobros a tus compradores van a la cuenta de Mercado Pago que conectes a tu empresa;
          Commerce AI no es parte de esa relación de compraventa. Salvo obligación legal o fallo
          atribuible a nosotros, las cuotas de suscripción ya cobradas no son reembolsables. Puedes
          cancelar para que no se renueve el siguiente ciclo.
        </p>
      </>
    ),
  },
  {
    id: "whatsapp",
    title: "5. WhatsApp y mensajería",
    body: (
      <>
        <p>
          La mensajería depende de Twilio, Meta y las políticas de WhatsApp Business. Debes cumplir
          esas políticas (ventana de 24 h, plantillas, consentimiento del destinatario, contenido
          permitido). Nosotros podemos suspender el canal si un proveedor lo exige o si detectamos
          abuso.
        </p>
        <p>
          Eres responsable del contenido que envías (tú o el asistente con tu catálogo y
          documentos), de los números que conectas y de las conversaciones con tus clientes. Los
          cupos de mensajes e IA del plan se consumen según el uso real; los excesos pueden limitar
          el servicio hasta el siguiente ciclo o hasta que mejores de plan.
        </p>
      </>
    ),
  },
  {
    id: "contenido",
    title: "6. Tu contenido y el asistente",
    body: (
      <>
        <p>
          Conservas la titularidad de tu catálogo, documentos, marcas y datos de clientes. Nos
          otorgas una licencia limitada para alojarlos, procesarlos y mostrarlos solo para operar el
          servicio (incluido el asistente con IA).
        </p>
        <p>
          El asistente responde a partir de productos activos, configuración de envíos y
          documentos que subas. Puede equivocarse o no tener información; debes revisar políticas
          críticas y puedes tomar el chat a mano. No garantizamos ventas ni que cada respuesta sea
          exacta.
        </p>
      </>
    ),
  },
  {
    id: "uso",
    title: "7. Uso aceptable",
    body: (
      <p>
        No puedes usar Commerce AI para spam, fraude, productos ilegales, suplantación, vulneración
        de derechos de terceros, ingeniería inversa no autorizada del servicio, ni sobrecargar de
        forma abusiva la infraestructura. Nos reservamos el derecho de suspender o cerrar cuentas
        que incumplan estos términos o la ley aplicable.
      </p>
    ),
  },
  {
    id: "disponibilidad",
    title: "8. Disponibilidad y terceros",
    body: (
      <p>
        Podemos realizar mantenimiento, actualizaciones o sufrir interrupciones. Servicios de
        terceros (WhatsApp, Twilio, Meta, Mercado Pago, proveedores de IA, hosting) pueden fallar o
        cambiar sus condiciones sin que podamos controlarlo. No somos responsables de esos fallos
        externos más allá de lo que exija la ley.
      </p>
    ),
  },
  {
    id: "responsabilidad",
    title: "9. Limitación de responsabilidad",
    body: (
      <p>
        En la medida permitida por la ley, Commerce AI y sus proveedores no serán responsables por
        lucro cesante, pérdida de datos, daño indirecto o reclamaciones de tus clientes derivadas
        de ventas, envíos, precios o mensajes enviados desde tu cuenta. Nuestra responsabilidad
        agregada por reclamaciones relacionadas con el servicio en un período de doce meses no
        excederá, salvo dolo o norma imperativa en contrario, el monto que nos hayas pagado por la
        suscripción en esos doce meses (o cero si solo usaste la prueba gratuita).
      </p>
    ),
  },
  {
    id: "datos",
    title: "10. Datos personales",
    body: (
      <p>
        Tratamos datos necesarios para operar la cuenta, la mensajería y la facturación. Eres
        responsable de informar a tus clientes cuando uses WhatsApp u otros canales y de contar con
        bases legales adecuadas. Si necesitas ejercer derechos sobre tus datos de cuenta, escríbenos
        al contacto indicado más abajo.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "11. Cambios y contacto",
    body: (
      <>
        <p>
          Podemos actualizar estos términos publicando la versión vigente en esta página. El uso
          continuado del servicio después de la fecha de actualización implica aceptación, salvo que
          la ley exija otro mecanismo.
        </p>
        <p>
          Contacto comercial y legal:{" "}
          <a
            href="mailto:hola@ecommerce-ai.website"
            className="underline underline-offset-4 hover:text-foreground"
          >
            hola@ecommerce-ai.website
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-28 pb-20 lg:px-10">
        <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Términos de servicio
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Última actualización: {UPDATED}</p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Estos términos regulan el uso de Commerce AI en{" "}
          <span className="text-foreground">ecommerce-ai.website</span> y aplicaciones relacionadas.
          Complementan la información de planes y el panel de tu tienda.
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
