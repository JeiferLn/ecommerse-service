"use client";

import {
  canManageWhatsapp,
  REQUIRED_KNOWLEDGE_TYPES,
  type CompanyDetails,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import Link from "next/link";

import { knowledgeUploadedCount } from "@/components/setup-requirements";
import { StatusPill } from "@/components/ui/status-pill";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

type StepState = "done" | "todo";

interface OnboardingStep {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  state: StepState;
  /** No cuenta para el progreso: solo mejora las respuestas. */
  optional?: boolean;
}

function buildSteps(company: CompanyDetails): OnboardingStep[] {
  const { onboarding } = company;
  const prerequisitesDone =
    onboarding.activeProducts > 0 && company.commerce.isConfigured && company.payments.isConfigured;
  const uploadedDocs = knowledgeUploadedCount(company);
  const totalDocs = REQUIRED_KNOWLEDGE_TYPES.length;

  return [
    {
      id: "products",
      title: "Carga tus productos",
      detail: "Al menos un producto activo con stock para que el asistente pueda ofrecerlo.",
      href: "/products",
      cta: "Ir a Productos",
      state: onboarding.activeProducts > 0 ? "done" : "todo",
    },
    {
      id: "shipping",
      title: "Configura tus envíos",
      detail: "Desde dónde despachas, a qué zonas llegas y con qué transportadoras.",
      href: "/settings/shipping",
      cta: "Ir a Envíos",
      state: company.commerce.isConfigured ? "done" : "todo",
    },
    {
      id: "payments",
      title: "Conecta Mercado Pago",
      detail: "Los pedidos se cobran directo en tu cuenta.",
      href: "/settings/payments",
      cta: "Ir a Pagos",
      state: company.payments.isConfigured ? "done" : "todo",
    },
    {
      id: "playground",
      title: "Prueba tu asistente",
      detail: "Escríbele como si fueras un cliente antes de que atienda de verdad.",
      href: "/assistant/playground",
      cta: "Probar ahora",
      state: onboarding.playgroundTried ? "done" : "todo",
    },
    {
      id: "channel",
      title: "Activa tu canal de WhatsApp",
      detail: onboarding.whatsappAssigned
        ? "Tu canal está en pausa. Reactívalo para que el asistente responda y cobre por ti."
        : prerequisitesDone
          ? "Tu tienda ya cumple los requisitos. Actívalo y recibe tu enlace para clientes."
          : "Disponible cuando tengas productos, envíos y Mercado Pago listos.",
      href: "/whatsapp",
      cta: onboarding.whatsappAssigned
        ? "Ir al canal"
        : prerequisitesDone
          ? "Activar canal"
          : "Ver canal",
      state: onboarding.whatsappAssigned && onboarding.whatsappActive ? "done" : "todo",
    },
    {
      id: "knowledge",
      title: "Sube tus documentos",
      detail: `${uploadedDocs} de ${totalDocs} cargados. Tu guía, preguntas frecuentes, garantías y políticas hacen que el asistente responda con más precisión.`,
      href: "/knowledge",
      cta: "Ir a Conocimiento",
      state: uploadedDocs === totalDocs ? "done" : "todo",
      optional: true,
    },
  ];
}

/** Pasos de puesta en marcha; solo para quien puede completarlos. */
export function useOnboarding() {
  const { user } = useSession();
  const enabled = Boolean(user?.companyId && user.role !== "admin" && canManageWhatsapp(user.role));
  const { data: company } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled,
  });

  if (!enabled || !company) {
    return null;
  }
  const steps = buildSteps(company);
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.state === "done").length;
  return { steps, done, total: required.length, complete: done === required.length };
}

function StepIcon({
  state,
  index,
  isNext,
  optional,
}: {
  state: StepState;
  index: number;
  isNext: boolean;
  optional?: boolean;
}) {
  if (optional && state !== "done") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
        <BookOpen className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Check className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
        isNext
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}

export function OnboardingChecklist() {
  const onboarding = useOnboarding();
  if (!onboarding || onboarding.complete) {
    return null;
  }

  const nextStep = onboarding.steps.find((step) => step.state === "todo" && !step.optional);
  const pending = onboarding.total - onboarding.done;

  return (
    <section
      id="puesta-en-marcha"
      aria-labelledby="puesta-en-marcha-title"
      className="scroll-mt-20 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h2 id="puesta-en-marcha-title" className="text-base font-semibold">
            Puesta en marcha
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {onboarding.done} de {onboarding.total} pasos listos.{" "}
            {pending === 1
              ? "Te falta 1 para que tu asistente venda por WhatsApp."
              : `Te faltan ${pending} para que tu asistente venda por WhatsApp.`}
          </p>
        </div>
        <Progress done={onboarding.done} total={onboarding.total} className="w-full sm:w-48" />
      </div>

      <ol className="divide-y divide-border border-t border-border">
        {onboarding.steps.map((step, index) => {
          const isNext = step.id === nextStep?.id;
          const done = step.state === "done";
          return (
            <li
              key={step.id}
              aria-current={isNext ? "step" : undefined}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3",
                isNext && "bg-accent/50",
                done && "text-muted-foreground",
              )}
            >
              <StepIcon state={step.state} index={index} isNext={isNext} optional={step.optional} />
              <div className="min-w-0 flex-1 basis-52">
                <p
                  className={cn(
                    "flex flex-wrap items-center gap-2 text-sm",
                    done ? "font-normal" : "font-medium",
                  )}
                >
                  {step.title}
                  {step.optional && !done ? <StatusPill>Opcional</StatusPill> : null}
                </p>
                {!done ? (
                  <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{step.detail}</p>
                ) : null}
              </div>
              {step.state === "todo" ? (
                <Link
                  href={step.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors max-sm:ml-10",
                    isNext
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {step.cta}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Progress({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="Progreso de la puesta en marcha"
      className={cn("h-1 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${(done / total) * 100}%` }}
      />
    </div>
  );
}

/** Resumen compacto para el sidebar. */
export function OnboardingSummary({ onNavigate }: { onNavigate?: () => void }) {
  const onboarding = useOnboarding();
  if (!onboarding || onboarding.complete) {
    return null;
  }
  return (
    <Link
      href="/#puesta-en-marcha"
      onClick={onNavigate}
      className="flex flex-col gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <span className="flex items-center justify-between text-sm">
        Puesta en marcha
        <span className="text-xs text-muted-foreground tabular-nums">
          {onboarding.done} de {onboarding.total}
        </span>
      </span>
      <Progress done={onboarding.done} total={onboarding.total} className="h-0.5" />
    </Link>
  );
}
