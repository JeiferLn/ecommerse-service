"use client";

import { Check, CreditCard, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Message = {
  from: "customer" | "store";
  time: string;
  text: string;
  attachment?: "product" | "payment" | "paid";
};

const MESSAGES: Message[] = [
  { from: "customer", time: "23:41", text: "Hola, ¿tienen la remera clásica blanca en talle M?" },
  {
    from: "store",
    time: "23:41",
    text: "Sí, quedan 12 en talle M. ¿Te la agrego al carrito?",
    attachment: "product",
  },
  { from: "customer", time: "23:42", text: "Sí, una. ¿Hacen envíos a domicilio?" },
  {
    from: "store",
    time: "23:42",
    text: "Enviamos a todo el país. Te dejé 1 remera en el carrito. Escribe «confirmar pedido» cuando quieras.",
  },
  { from: "customer", time: "23:43", text: "confirmar pedido" },
  {
    from: "store",
    time: "23:43",
    text: "Listo. Tu pedido #1048 está reservado. Paga aquí:",
    attachment: "payment",
  },
  {
    from: "store",
    time: "23:45",
    text: "Pago recibido. Te avisamos cuando salga el envío.",
    attachment: "paid",
  },
];

const STATES = ["Consulta", "Carrito", "Esperando pago", "Pagado"] as const;

function stateFor(visible: number): number {
  if (visible >= 7) return 3;
  if (visible >= 5) return 2;
  if (visible >= 3) return 1;
  return 0;
}

const EVENTS = [
  { at: 1, time: "23:41", label: "Consulta por Remera clásica blanca" },
  { at: 3, time: "23:42", label: "1 unidad agregada al carrito" },
  { at: 5, time: "23:43", label: "Link de Mercado Pago enviado" },
  { at: 7, time: "23:45", label: "Pago confirmado" },
];

const STEP_MS = 1500;

export function SaleDemo({ className }: { className?: string }) {
  const [visible, setVisible] = useState(0);
  const [running, setRunning] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const play = useCallback(() => {
    setVisible(0);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      started.current = true;
      setVisible(MESSAGES.length);
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !started.current) {
          started.current = true;
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [play]);

  useEffect(() => {
    if (!running) return;
    if (visible >= MESSAGES.length) {
      setRunning(false);
      return;
    }
    const timer = setTimeout(() => setVisible((value) => value + 1), visible === 0 ? 400 : STEP_MS);
    return () => clearTimeout(timer);
  }, [running, visible]);

  const current = stateFor(visible);
  const finished = visible >= MESSAGES.length && !running;

  return (
    <div
      ref={rootRef}
      role="figure"
      aria-label="Ejemplo de una venta por WhatsApp de principio a fin"
      className={cn(
        "site-ink overflow-hidden rounded-3xl border border-border shadow-[0_40px_80px_-48px_oklch(0.2_0.012_60/0.55)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6">
        <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
          Ejemplo · Minimalist Store
        </p>
        <button
          type="button"
          onClick={play}
          disabled={running}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
            !finished && "pointer-events-none opacity-0",
          )}
          aria-hidden={!finished}
          tabIndex={finished ? 0 : -1}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Repetir
        </button>
      </div>

      <div className="grid lg:grid-cols-12">
        <div className="border-border px-4 py-6 sm:px-6 lg:col-span-7 lg:border-r lg:py-8">
          <ol className="flex flex-col gap-3">
            {MESSAGES.map((message, index) => {
              const shown = index < visible;
              const mine = message.from === "customer";
              return (
                <li
                  key={index}
                  aria-hidden={!shown}
                  className={cn(
                    "flex transition-all duration-300 ease-out motion-reduce:transition-none",
                    mine ? "justify-end" : "justify-start",
                    shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[75%]",
                      mine
                        ? "rounded-br-sm bg-foreground text-background"
                        : "rounded-bl-sm border border-border bg-card text-foreground",
                    )}
                  >
                    <p>{message.text}</p>
                    {message.attachment === "product" ? (
                      <div className="mt-3 flex items-center justify-between gap-6 rounded-lg border border-border px-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium">Remera clásica blanca</p>
                          <p className="font-data mt-0.5 text-xs text-muted-foreground">
                            Talle M · 12 en stock
                          </p>
                        </div>
                        <p className="font-data text-sm">$15.000</p>
                      </div>
                    ) : null}
                    {message.attachment === "payment" ? (
                      <div className="mt-3 flex items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
                        <CreditCard className="size-4" aria-hidden />
                        <span className="text-sm font-medium">Pagar $15.000 con Mercado Pago</span>
                      </div>
                    ) : null}
                    {message.attachment === "paid" ? (
                      <p className="font-data mt-2 inline-flex items-center gap-1.5 text-xs text-primary">
                        <Check className="size-3.5" aria-hidden />
                        Pedido #1048 pagado
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        "font-data mt-1.5 text-right text-[11px]",
                        mine ? "text-background/60" : "text-muted-foreground",
                      )}
                    >
                      {message.time}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <aside
          aria-label="Pedido en el panel"
          className="border-t border-border px-5 py-6 sm:px-6 lg:col-span-5 lg:border-t-0 lg:py-8"
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">Pedido #1048</p>
            <p className="font-data text-xs text-muted-foreground">WhatsApp</p>
          </div>

          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Estado del pedido">
            {STATES.map((state, index) => (
              <li
                key={state}
                aria-current={index === current ? "step" : undefined}
                className="flex flex-col gap-2"
              >
                <span
                  className={cn(
                    "h-1 rounded-full transition-colors duration-500 motion-reduce:transition-none",
                    index <= current ? "bg-primary" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] leading-tight transition-colors duration-500 sm:text-xs",
                    index === current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {state}
                </span>
              </li>
            ))}
          </ol>

          <dl className="mt-8 border-t border-border text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
              <dt className="text-muted-foreground">Remera clásica blanca · M</dt>
              <dd className="font-data">
                {current >= 1 ? "1 × $15.000" : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
              <dt className="text-muted-foreground">Envío</dt>
              <dd>{current >= 1 ? "A domicilio" : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-medium">Total</dt>
              <dd className="font-data text-base">{current >= 1 ? "$15.000" : "—"}</dd>
            </div>
          </dl>

          <ol className="mt-6 flex flex-col gap-3" aria-label="Actividad">
            {EVENTS.map((event) => {
              const shown = visible >= event.at;
              return (
                <li
                  key={event.label}
                  aria-hidden={!shown}
                  className={cn(
                    "grid grid-cols-[3rem_1fr] gap-3 text-xs transition-opacity duration-300 motion-reduce:transition-none",
                    shown ? "opacity-100" : "opacity-0",
                  )}
                >
                  <span className="font-data text-muted-foreground">{event.time}</span>
                  <span>{event.label}</span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
