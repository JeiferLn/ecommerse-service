import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo Commerce AI trata datos de cuentas, mensajería WhatsApp, pedidos y pagos con Mercado Pago.",
};

const UPDATED = "7 de octubre de 2026";

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "responsable",
    title: "1. Quiénes somos",
    body: (
      <p>
        Commerce AI opera la plataforma en{" "}
        <span className="text-foreground">ecommerce-ai.website</span> (panel, API y sitio
        comercial). Esta política describe cómo tratamos datos personales cuando usas el servicio.
        Complementa los{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Términos de servicio
        </Link>
        .
      </p>
    ),
  },
  {
    id: "alcance",
    title: "2. Roles: nosotros y tu tienda",
    body: (
      <>
        <p>
          Respecto a tu cuenta de comercio (registro, suscripción, uso del panel), Commerce AI actúa
          como responsable del tratamiento de esos datos.
        </p>
        <p>
          Respecto a los datos de tus clientes finales (mensajes de WhatsApp, pedidos, datos de
          envío o pago que ellos te den), tú eres el responsable frente a ellos. Nosotros tratamos
          esos datos como encargado, solo para prestarte el servicio según tu configuración.
        </p>
      </>
    ),
  },
  {
    id: "datos",
    title: "3. Qué datos tratamos",
    body: (
      <>
        <p>Según cómo uses la plataforma, podemos tratar:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="text-foreground">Cuenta y empresa:</span> nombre, correo, contraseña
            (hash), rol, datos de la tienda, miembros invitados.
          </li>
          <li>
            <span className="text-foreground">Facturación:</span> plan, estado de suscripción e
            identificadores de pago de Mercado Pago (no guardamos el número completo de tu tarjeta).
          </li>
          <li>
            <span className="text-foreground">Catálogo y operación:</span> productos, imágenes,
            documentos de conocimiento, configuración de envíos y conexión de pagos.
          </li>
          <li>
            <span className="text-foreground">Mensajería:</span> números conectados, conversaciones,
            metadatos de entrega y contenido necesario para el inbox y el asistente.
          </li>
          <li>
            <span className="text-foreground">Pedidos:</span> ítems, estados, totales y datos de
            contacto o envío que el flujo de compra requiera.
          </li>
          <li>
            <span className="text-foreground">Uso técnico:</span> logs de seguridad, IP, tipo de
            dispositivo o errores, en la medida necesaria para operar y proteger el servicio.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "4. Para qué los usamos",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Crear y autenticar tu cuenta, y dar acceso al panel.</li>
        <li>Prestar el asistente, el inbox, pedidos, catálogo y playground.</li>
        <li>Conectar WhatsApp (Twilio / Meta) y procesar mensajes entrantes y salientes.</li>
        <li>Gestionar planes, cupos, cobros de suscripción y webhooks de Mercado Pago.</li>
        <li>Mejorar seguridad, diagnosticar fallos y cumplir obligaciones legales.</li>
        <li>Enviarte avisos del servicio (seguridad, facturación, cambios relevantes).</li>
      </ul>
    ),
  },
  {
    id: "bases",
    title: "5. Bases del tratamiento",
    body: (
      <p>
        Tratamos datos para ejecutar el contrato del servicio, por interés legítimo en asegurar la
        plataforma, y cuando la ley lo exija. Cuando tu tienda usa WhatsApp u otros canales con
        clientes, te corresponde informarles y contar con la base legal adecuada (por ejemplo,
        consentimiento o relación comercial previa, según el país y las políticas de Meta /
        WhatsApp).
      </p>
    ),
  },
  {
    id: "encargados",
    title: "6. Proveedores y transferencias",
    body: (
      <>
        <p>
          Usamos proveedores que tratan datos en nuestro nombre o como parte necesaria del servicio,
          entre otros: hosting e infraestructura, Twilio y Meta (WhatsApp), Mercado Pago (pagos),
          almacenamiento de archivos y proveedores de IA para generar respuestas.
        </p>
        <p>
          Esos proveedores pueden estar fuera de tu país. Cuando aplica, usamos salvaguardas
          habituales del sector (contratos de tratamiento, cifrado en tránsito, controles de
          acceso). El uso de WhatsApp y Mercado Pago también queda sujeto a sus propias políticas.
        </p>
      </>
    ),
  },
  {
    id: "conservacion",
    title: "7. Conservación",
    body: (
      <p>
        Conservamos los datos mientras tu cuenta esté activa y el tiempo adicional necesario para
        facturación, seguridad, reclamaciones o obligaciones legales. Puedes pedir la eliminación
        de la cuenta; borraremos o anonimizaremos lo que no debamos conservar. Los mensajes y
        pedidos de tus clientes se eliminan o bloquean según tu solicitud y lo que la ley o el
        proveedor de mensajería permitan.
      </p>
    ),
  },
  {
    id: "seguridad",
    title: "8. Seguridad",
    body: (
      <p>
        Aplicamos medidas razonables (acceso autenticado, cifrado en tránsito, segregación por
        empresa, registros de acceso). Ningún sistema es 100 % seguro; si detectas un incidente que
        afecte tu cuenta, avísanos de inmediato.
      </p>
    ),
  },
  {
    id: "derechos",
    title: "9. Tus derechos",
    body: (
      <>
        <p>
          Según tu jurisdicción, puedes solicitar acceso, rectificación, actualización, eliminación,
          oposición o limitación del tratamiento de tus datos de cuenta, y la portabilidad cuando
          corresponda. También puedes retirar consentimientos opcionales cuando el tratamiento se
          base en ellos.
        </p>
        <p>
          Para ejercerlos:{" "}
          <a
            href="mailto:hola@ecommerce-ai.website"
            className="underline underline-offset-4 hover:text-foreground"
          >
            hola@ecommerce-ai.website
          </a>
          . El procedimiento de baja y borrado está en{" "}
          <Link href="/data-deletion" className="underline underline-offset-4 hover:text-foreground">
            Eliminación de datos
          </Link>
          . Si la solicitud afecta datos de clientes de tu tienda, puede que debamos coordinar
          contigo como responsable.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "10. Cookies y sesión",
    body: (
      <p>
        Usamos cookies o almacenamiento local necesarios para la sesión autenticada y el
        funcionamiento del panel. No usamos publicidad de terceros en el panel. El sitio público
        puede usar métricas técnicas básicas de rendimiento o errores si las activamos; en ese caso
        se limitarán a lo imprescindible para operar.
      </p>
    ),
  },
  {
    id: "menores",
    title: "11. Menores",
    body: (
      <p>
        El servicio está dirigido a comercios y sus equipos adultos. No está pensado para que
        menores creen cuentas. Si crees que un menor nos facilitó datos, contáctanos para
        revisarlo.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "12. Cambios",
    body: (
      <p>
        Podemos actualizar esta política publicando la versión vigente en esta página, con la fecha
        de última actualización. Si el cambio es sustancial, podremos avisarte por el panel o por
        correo cuando sea razonable.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-28 pb-20 lg:px-10">
        <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Política de privacidad
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Última actualización: {UPDATED}</p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Explica qué datos trata Commerce AI, con qué fin, con quién los compartimos para operar el
          servicio y cómo puedes ejercer tus derechos.
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
