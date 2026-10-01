import { Moon, Sunrise } from "lucide-react";
import type { CSSProperties } from "react";

import { CountUp } from "@/components/site/count-up";
import { Reveal } from "@/components/site/reveal";

const ORDERS = [
  { minute: 10, time: "22:10", amount: 15000 },
  { minute: 48, time: "22:48", amount: 28000 },
  { minute: 105, time: "23:45", amount: 15000 },
  { minute: 152, time: "00:32", amount: 42500 },
  { minute: 195, time: "01:15", amount: 9900 },
  { minute: 258, time: "02:18", amount: 15000 },
  { minute: 340, time: "03:40", amount: 28000 },
  { minute: 535, time: "06:55", amount: 61200 },
  { minute: 570, time: "07:30", amount: 9900 },
];

const TOTAL = ORDERS.reduce((sum, order) => sum + order.amount, 0);
const WIDTH = 600;
const HEIGHT = 260;
const SPAN_MINUTES = 600;
const TICKS = ["22:00", "00:00", "02:00", "04:00", "06:00", "08:00"];

const x = (minute: number) => (minute / SPAN_MINUTES) * WIDTH;
const y = (amount: number) => HEIGHT - 12 - (amount / (TOTAL * 1.08)) * (HEIGHT - 24);

function buildPoints() {
  let sum = 0;
  return ORDERS.map((order) => {
    sum += order.amount;
    return { ...order, cx: x(order.minute), cy: y(sum), total: sum };
  });
}

const POINTS = buildPoints();

const LINE = POINTS.reduce(
  (path, point, index) => {
    const previousY = index === 0 ? y(0) : POINTS[index - 1]!.cy;
    return `${path} L${point.cx},${previousY} L${point.cx},${point.cy}`;
  },
  `M0,${y(0)}`,
).concat(` L${WIDTH},${POINTS[POINTS.length - 1]!.cy}`);

const AREA = `${LINE} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

export function NightRevenue() {
  return (
    <div className="grid gap-14 lg:grid-cols-12 lg:items-end lg:gap-10">
      <div className="lg:col-span-4">
        <Reveal>
          <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
            Mientras duermes
          </p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight lg:text-5xl">
            Cierras la tienda.{" "}
            <span className="font-accent font-normal tracking-normal text-primary italic">
              Las ventas no.
            </span>
          </h2>
        </Reveal>
        <Reveal delay={150} className="mt-10 border-t border-border pt-8">
          <CountUp
            value={TOTAL}
            prefix="$"
            className="font-data block text-5xl tracking-tight lg:text-6xl"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            en {ORDERS.length} pedidos pagados entre las 22:00 y las 08:00.
          </p>
          <p className="font-data mt-6 inline-flex rounded-md border border-border px-2 py-1 text-[11px] tracking-wider text-muted-foreground uppercase">
            Ejemplo de una noche
          </p>
        </Reveal>
      </div>

      <Reveal variant="none" className="lg:col-span-8">
        <figure className="rounded-xl border border-border bg-card p-5 sm:p-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Moon className="size-4" aria-hidden />
              Ingresos acumulados
            </span>
            <span className="inline-flex items-center gap-2">
              Amanece
              <Sunrise className="size-4" aria-hidden />
            </span>
          </div>

          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="mt-6 h-auto w-full overflow-visible"
            role="img"
            aria-label={`Ingresos acumulados de ejemplo: $${TOTAL.toLocaleString("es-CO")} en ${ORDERS.length} pedidos durante la noche`}
          >
            <defs>
              <linearGradient id="night-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.28 }} />
                <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                x2={WIDTH}
                y1={HEIGHT * ratio}
                y2={HEIGHT * ratio}
                className="stroke-border"
                strokeDasharray="2 6"
              />
            ))}
            <path d={AREA} fill="url(#night-area)" className="chart-fade" />
            <path
              d={LINE}
              pathLength={1}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              className="draw-line stroke-primary"
            />
            {POINTS.map((point, index) => (
              <g
                key={point.time}
                className="chart-fade"
                style={{ "--reveal-delay": `${600 + index * 170}ms` } as CSSProperties}
              >
                <circle cx={point.cx} cy={point.cy} r="9" opacity="0.15" className="fill-primary" />
                <circle cx={point.cx} cy={point.cy} r="3.5" className="fill-primary" />
              </g>
            ))}
          </svg>

          <div className="font-data mt-3 flex justify-between text-[11px] text-muted-foreground">
            {TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          <figcaption className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5 text-sm">
            {[POINTS[3]!, POINTS[5]!, POINTS[7]!].map((point) => (
              <div key={point.time}>
                <p className="font-data text-xs text-muted-foreground">{point.time}</p>
                <p className="font-data mt-1">{`+$${point.amount.toLocaleString("es-CO")}`}</p>
              </div>
            ))}
          </figcaption>
        </figure>
      </Reveal>
    </div>
  );
}
