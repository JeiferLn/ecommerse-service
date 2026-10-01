"use client";

import { Check, FileText, Minus, Plus, Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function CatalogFragment() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground">
        <Search className="size-4" aria-hidden />
        <span>remera blanca talle M</span>
      </div>
      <ul className="text-sm">
        <li className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div>
            <p className="font-medium">Remera clásica blanca</p>
            <p className="font-data mt-0.5 text-xs text-muted-foreground">M · 12 en stock</p>
          </div>
          <span className="font-data text-xs text-primary">Se ofrece</span>
        </li>
        <li className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-muted-foreground">
          <div>
            <p>Remera clásica negra</p>
            <p className="font-data mt-0.5 text-xs">M · agotada</p>
          </div>
          <span className="font-data text-xs">No se ofrece</span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3 text-muted-foreground">
          <div>
            <p>Remera oversize blanca</p>
            <p className="font-data mt-0.5 text-xs">Borrador · no activa</p>
          </div>
          <span className="font-data text-xs">No se ofrece</span>
        </li>
      </ul>
    </div>
  );
}

function PolicyFragment() {
  return (
    <div className="flex flex-col gap-3">
      <p className="ml-auto max-w-[80%] rounded-xl rounded-br-sm bg-foreground px-4 py-3 text-sm text-background">
        ¿Puedo cambiarla si no me queda?
      </p>
      <div className="max-w-[88%] rounded-xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed">
        <p>
          Sí. Puedes cambiarla dentro del plazo que indica nuestra política, con la prenda sin uso y
          con etiqueta.
        </p>
        <p className="font-data mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />
          Fuente: Política de devoluciones
        </p>
      </div>
    </div>
  );
}

function CartFragment() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium">Carrito</p>
        <p className="font-data text-xs text-muted-foreground">1 producto</p>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-4">
        <div>
          <p className="text-sm">Remera clásica blanca</p>
          <p className="font-data mt-0.5 text-xs text-muted-foreground">Talle M</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center rounded-md border border-border">
            <span className="flex size-7 items-center justify-center text-muted-foreground">
              <Minus className="size-3.5" aria-hidden />
            </span>
            <span className="font-data w-6 text-center text-sm">1</span>
            <span className="flex size-7 items-center justify-center text-muted-foreground">
              <Plus className="size-3.5" aria-hidden />
            </span>
          </span>
          <span className="font-data text-sm">$15.000</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
        <p className="font-data text-xs text-muted-foreground">El cliente escribe</p>
        <p className="font-data rounded-md bg-muted px-2 py-1 text-xs">confirmar pedido</p>
      </div>
    </div>
  );
}

function PaymentFragment() {
  const rows = [
    { time: "23:43", label: "Link de Mercado Pago enviado por WhatsApp" },
    { time: "23:45", label: "Mercado Pago confirma el pago" },
    { time: "23:45", label: "El pedido pasa a Pagado y descuenta stock" },
    { time: "23:45", label: "El cliente recibe la confirmación en el chat" },
  ];
  return (
    <ol className="rounded-xl border border-border bg-card">
      {rows.map((row, index) => (
        <li
          key={row.label}
          className={cn(
            "grid grid-cols-[3.5rem_1.25rem_1fr] items-center gap-3 px-4 py-3 text-sm",
            index > 0 && "border-t border-border",
          )}
        >
          <span className="font-data text-xs text-muted-foreground">{row.time}</span>
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          <span>{row.label}</span>
        </li>
      ))}
    </ol>
  );
}

const STEPS: { title: string; body: string; fragment: ReactNode }[] = [
  {
    title: "Pregunta",
    body: "El asistente busca en tus productos activos. Si no hay stock, no lo ofrece.",
    fragment: <CatalogFragment />,
  },
  {
    title: "Duda",
    body: "Envíos, cambios o garantías: responde con los documentos que subes y cita la fuente.",
    fragment: <PolicyFragment />,
  },
  {
    title: "Carrito",
    body: "El cliente arma el pedido escribiendo. Nada de formularios ni apps extra.",
    fragment: <CartFragment />,
  },
  {
    title: "Cobro",
    body: "Paga con Mercado Pago desde el chat. El pedido se marca solo cuando el pago se confirma.",
    fragment: <PaymentFragment />,
  },
];

export function SaleJourney() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.step);
            setActive(index);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const node of refs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-16 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
            Recorrido de una venta
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight lg:text-5xl">
            Del primer mensaje al pago, sin que intervengas.
          </h2>
          <ol className="mt-10 hidden flex-col border-l border-border lg:flex">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <a
                  href={`#paso-${index + 1}`}
                  aria-current={active === index ? "step" : undefined}
                  className={cn(
                    "-ml-px flex items-baseline gap-4 border-l py-2.5 pl-5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                    active === index
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="font-data text-xs">{`0${index + 1}`}</span>
                  {step.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-20 lg:col-span-7 lg:col-start-6 lg:gap-32">
        {STEPS.map((step, index) => (
          <article
            key={step.title}
            id={`paso-${index + 1}`}
            data-step={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            className="scroll-mt-28"
          >
            <p className="font-data text-xs text-muted-foreground">
              {`0${index + 1} / 0${STEPS.length}`}
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
              {step.body}
            </p>
            <div className="mt-8">{step.fragment}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
