import { Check, X } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { cn } from "@/lib/utils";

type Line = { from: "customer" | "store"; time: string; text: string } | { gap: string };

const LOST: Line[] = [
  { from: "customer", time: "23:41", text: "Hola, ¿tienen la remera clásica en talle M?" },
  { gap: "9 h 33 min sin respuesta" },
  { from: "store", time: "09:14", text: "¡Hola! Sí, nos queda. ¿Sigues interesada?" },
  { from: "customer", time: "09:20", text: "Ya la compré en otra tienda, gracias." },
];

const WON: Line[] = [
  { from: "customer", time: "23:41", text: "Hola, ¿tienen la remera clásica en talle M?" },
  { from: "store", time: "23:41", text: "Sí, quedan 12 en M. ¿Te la agrego al carrito?" },
  { from: "customer", time: "23:42", text: "Sí, una. confirmar pedido" },
  { from: "store", time: "23:45", text: "Pago recibido. Tu pedido #1048 está confirmado." },
];

function Chat({ lines, muted }: { lines: Line[]; muted?: boolean }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {lines.map((line, index) =>
        "gap" in line ? (
          <li key={index} className="flex items-center gap-3 py-2" aria-label={line.gap}>
            <span className="h-px flex-1 border-t border-dashed border-border" />
            <span className="font-data text-[11px] text-destructive">{line.gap}</span>
            <span className="h-px flex-1 border-t border-dashed border-border" />
          </li>
        ) : (
          <li
            key={index}
            className={cn("flex", line.from === "customer" ? "justify-end" : "justify-start")}
          >
            <p
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed",
                line.from === "customer"
                  ? "rounded-br-sm bg-foreground text-background"
                  : "rounded-bl-sm border border-border bg-background",
                muted && "opacity-70",
              )}
            >
              {line.text}
              <span
                className={cn(
                  "font-data ml-2 text-[10px]",
                  line.from === "customer" ? "text-background/60" : "text-muted-foreground",
                )}
              >
                {line.time}
              </span>
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

export function LostVsWon() {
  return (
    <div className="grid gap-16 lg:grid-cols-12 lg:gap-10">
      <Reveal className="lg:col-span-5">
        <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
          El costo de no responder
        </p>
        <h2 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight lg:text-6xl">
          Cada mensaje sin responder es una venta{" "}
          <span className="font-accent font-normal tracking-normal italic">para otro.</span>
        </h2>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
          Tus clientes escriben de noche, en el almuerzo y el domingo. Le compran a quien contesta
          primero. Haz que siempre seas tú.
        </p>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
        <Reveal delay={100}>
          <article className="flex h-full flex-col rounded-xl border border-border bg-muted p-5">
            <header className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-medium">Sin asistente</h3>
              <span className="font-data text-[11px] text-muted-foreground uppercase">Ejemplo</span>
            </header>
            <Chat lines={LOST} muted />
            <p className="mt-auto flex items-center gap-2 border-t border-border pt-4 text-sm text-destructive">
              <X className="size-4" aria-hidden />
              Venta perdida
            </p>
          </article>
        </Reveal>
        <Reveal delay={250}>
          <article className="site-ink flex h-full flex-col rounded-xl border border-border p-5 shadow-[0_30px_60px_-40px_oklch(0.2_0.012_60/0.6)]">
            <header className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-medium">Con Commerce AI</h3>
              <span className="font-data text-[11px] text-muted-foreground uppercase">Ejemplo</span>
            </header>
            <Chat lines={WON} />
            <p className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 text-sm text-primary">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4" aria-hidden />
                Venta cerrada en 4 minutos
              </span>
              <span className="font-data">+$15.000</span>
            </p>
          </article>
        </Reveal>
      </div>
    </div>
  );
}
