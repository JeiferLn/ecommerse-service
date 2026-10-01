import { Sparkle } from "lucide-react";

const ITEMS = [
  "Responde consultas de stock",
  "Arma el carrito en el chat",
  "Cita tus políticas de envío",
  "Cobra con Mercado Pago",
  "Descuenta el stock al pagar",
  "Pasa la charla a tu equipo",
  "Atiende 24/7",
];

export function CapabilityTicker() {
  return (
    <div className="group relative overflow-hidden border-y border-border py-5 mask-[linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <p className="sr-only">{ITEMS.join(". ")}.</p>
      <div
        aria-hidden
        className="marquee-track flex w-max items-center group-hover:paused"
      >
        {[...ITEMS, ...ITEMS].map((item, index) => (
          <span key={index} className="flex items-center gap-8 pr-8 text-sm text-muted-foreground">
            {item}
            <Sparkle className="size-3.5 text-primary" />
          </span>
        ))}
      </div>
    </div>
  );
}
