"use client";

import {
  canEditCompany,
  canManageCatalog,
  canManageKnowledge,
  REQUIRED_KNOWLEDGE_TYPES,
  type CompanyDetails,
  type UserRole,
} from "@commerce-ai/types";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

export interface SetupItem {
  id: "products" | "shipping" | "payments" | "knowledge";
  title: string;
  doneLabel: string;
  detail: string;
  href: string;
  cta: string;
  done: boolean;
  /** No bloquea: solo mejora las respuestas. */
  optional: boolean;
  /** El usuario actual tiene permiso para completarlo. */
  canAct: boolean;
  owner: string;
}

export function knowledgeUploadedCount(company: CompanyDetails): number {
  return company.knowledge.slots.filter((slot) => slot.uploaded).length;
}

export function getSetupItems(
  company: CompanyDetails,
  role: UserRole | undefined,
  { requirePayments }: { requirePayments: boolean },
): SetupItem[] {
  const uploaded = knowledgeUploadedCount(company);
  const total = REQUIRED_KNOWLEDGE_TYPES.length;
  const items: SetupItem[] = [
    {
      id: "products",
      title: "Activa al menos un producto",
      doneLabel: "Productos activos",
      detail: "Con stock y en estado Activo, para que el asistente pueda ofrecerlo.",
      href: "/products",
      cta: "Ir a Productos",
      done: company.onboarding.activeProducts > 0,
      optional: false,
      canAct: Boolean(role && canManageCatalog(role)),
      owner: "el dueño o un manager",
    },
    {
      id: "shipping",
      title: "Configura tus envíos",
      doneLabel: "Envíos configurados",
      detail: "Desde dónde despachas, a qué zonas llegas y con qué transportadoras.",
      href: "/settings/shipping",
      cta: "Ir a Envíos",
      done: company.commerce.isConfigured,
      optional: false,
      canAct: Boolean(role && canEditCompany(role)),
      owner: "el dueño",
    },
  ];
  if (requirePayments) {
    items.push({
      id: "payments",
      title: "Conecta Mercado Pago",
      doneLabel: "Mercado Pago conectado",
      detail: "Los pedidos se cobran directo en la cuenta de tu empresa.",
      href: "/settings/payments",
      cta: "Ir a Pagos",
      done: company.payments.isConfigured,
      optional: false,
      canAct: Boolean(role && canEditCompany(role)),
      owner: "el dueño",
    });
  }
  items.push({
    id: "knowledge",
    title: "Sube tus documentos",
    doneLabel: "Documentos cargados",
    detail: `${uploaded} de ${total} cargados. Con tu guía, preguntas frecuentes, garantías y políticas el asistente responde con más precisión.`,
    href: "/knowledge",
    cta: "Ir a Conocimiento",
    done: uploaded === total,
    optional: true,
    canAct: Boolean(role && canManageKnowledge(role)),
    owner: "el dueño o un manager",
  });
  return items;
}

export function missingRequiredItems(items: SetupItem[]): SetupItem[] {
  return items.filter((item) => !item.optional && !item.done);
}

/** Todo lo que falta, de una sola vez, para que nadie crea que ya terminó. */
export function SetupRequirements({
  company,
  requirePayments,
  purpose,
  className,
}: {
  company: CompanyDetails;
  requirePayments: boolean;
  /** Completa la frase "Te faltan N pasos para …". */
  purpose: string;
  className?: string;
}) {
  const { user } = useSession();
  const items = getSetupItems(company, user?.role, { requirePayments });
  const required = items.filter((item) => !item.optional);
  const missing = missingRequiredItems(items);
  const done = required.length - missing.length;
  const nextId = missing.find((item) => item.canAct)?.id;

  return (
    <section
      aria-labelledby="setup-requirements-title"
      className={cn("max-w-4xl overflow-hidden rounded-lg border border-border", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2 id="setup-requirements-title" className="text-base font-semibold">
            {missing.length === 1
              ? `Te falta 1 paso para ${purpose}`
              : `Te faltan ${missing.length} pasos para ${purpose}`}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {done} de {required.length} listos. Completa todos los pendientes de esta lista.
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-valuenow={done}
          aria-label="Requisitos completados"
          className="h-1 w-full overflow-hidden rounded-full bg-muted sm:w-48"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(done / required.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <SetupRow key={item.id} item={item} isNext={item.id === nextId} />
        ))}
      </ul>
    </section>
  );
}

function SetupRow({ item, isNext }: { item: SetupItem; isNext: boolean }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3",
        item.done && "text-muted-foreground",
      )}
    >
      {item.done ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="size-3.5" aria-hidden />
        </span>
      ) : item.optional ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <BookOpen className="size-3.5" aria-hidden />
        </span>
      ) : (
        <span
          className={cn(
            "size-6 shrink-0 rounded-full border-2",
            isNext ? "border-primary" : "border-border",
          )}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 basis-52">
        <p className={cn("flex flex-wrap items-center gap-2 text-sm", !item.done && "font-medium")}>
          {item.done ? item.doneLabel : item.title}
          {item.optional && !item.done ? <StatusPill>Recomendado</StatusPill> : null}
          {!item.optional && !item.done ? (
            <span className="text-xs font-normal text-warning">Pendiente</span>
          ) : null}
        </p>
        {!item.done ? (
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
            {item.canAct ? item.detail : `Lo completa ${item.owner}.`}
          </p>
        ) : null}
      </div>
      {!item.done && item.canAct ? (
        <Button
          asChild
          size="sm"
          variant={isNext ? "default" : "outline"}
          className="w-fit shrink-0 max-sm:ml-10"
        >
          <Link href={item.href}>
            {item.cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

/** Franja discreta cuando el asistente ya funciona pero faltan documentos. */
export function KnowledgeHint({
  company,
  className,
}: {
  company: CompanyDetails;
  className?: string;
}) {
  const { user } = useSession();
  const uploaded = knowledgeUploadedCount(company);
  const total = REQUIRED_KNOWLEDGE_TYPES.length;
  if (uploaded === total) {
    return null;
  }
  const canAct = Boolean(user && canManageKnowledge(user.role));
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm",
        className,
      )}
    >
      <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-muted-foreground">
        Sube tus documentos para respuestas más precisas ({uploaded} de {total} cargados).
      </span>
      {canAct ? (
        <Link
          href="/knowledge"
          className="font-medium underline-offset-4 transition-colors hover:underline"
        >
          Ir a Conocimiento
        </Link>
      ) : null}
    </div>
  );
}
