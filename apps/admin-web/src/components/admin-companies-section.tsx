"use client";

import {
  PLAN_CODE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type AdminCompanyRow,
  type WhatsAppConnection,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

type Filter = "all" | "awaiting" | "online" | "onboarding";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "awaiting", label: "Pendientes" },
  { id: "online", label: "En línea" },
  { id: "onboarding", label: "Onboarding" },
];

const REQUIREMENT_LABELS: { key: keyof AdminCompanyRow["requirements"]; label: string }[] = [
  { key: "products", label: "Productos" },
  { key: "shipping", label: "Envíos" },
  { key: "payments", label: "Pagos" },
];

function matchesFilter(company: AdminCompanyRow, filter: Filter): boolean {
  if (filter === "awaiting") return company.awaitingNumber;
  if (filter === "online") return company.whatsapp?.onboardingStatus === "online";
  if (filter === "onboarding")
    return Boolean(company.whatsapp && company.whatsapp.onboardingStatus !== "online");
  return true;
}

function NumberRequestBadge() {
  return (
    <span className="w-fit rounded-md bg-primary/10 px-1.5 py-0.5 font-data text-xs font-medium text-primary">
      Pidió número empresarial
    </span>
  );
}

function WhatsAppStatus({ company }: { company: AdminCompanyRow }) {
  if (company.whatsapp) {
    const online = company.whatsapp.onboardingStatus === "online";
    return (
      <span className="flex flex-col gap-0.5">
        <span className="font-data text-sm">
          {online
            ? (company.whatsapp.twilioWhatsAppNumber ?? "Sin sender")
            : `Onboarding · ${company.whatsapp.onboardingStatus}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {company.whatsapp.connectionKind === "own_number"
            ? "Número propio"
            : "Número de la plataforma"}
        </span>
        <span
          className={cn(
            "text-xs",
            company.whatsapp.isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {company.whatsapp.isActive ? "Asistente activo" : "En pausa"}
        </span>
        {company.numberRequest ? <NumberRequestBadge /> : null}
      </span>
    );
  }
  if (company.numberRequest) {
    return <NumberRequestBadge />;
  }
  if (company.awaitingNumber) {
    return (
      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
        Lista, sin canal
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Requisitos pendientes</span>;
}

function Requirements({ company }: { company: AdminCompanyRow }) {
  const done = REQUIREMENT_LABELS.filter((item) => company.requirements[item.key]).length;
  return (
    <ul
      className="flex flex-wrap gap-1.5"
      aria-label={`${done} de ${REQUIREMENT_LABELS.length} requisitos`}
    >
      {REQUIREMENT_LABELS.map((item) => {
        const ok = company.requirements[item.key];
        return (
          <li
            key={item.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
              ok
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {ok ? (
              <Check className="size-3 text-primary" aria-hidden />
            ) : (
              <Minus className="size-3" aria-hidden />
            )}
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

function AssignNumberSheet({
  company,
  onOpenChange,
}: {
  company: AdminCompanyRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState("");
  const [display, setDisplay] = useState("");
  const [active, setActive] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const online =
    company?.whatsapp?.onboardingStatus === "online" ? company.whatsapp : null;

  useEffect(() => {
    const own = company?.whatsapp?.onboardingStatus === "online" ? company.whatsapp : null;
    const requested = company?.numberRequest?.phoneNumber ?? "";
    setNumber(own?.twilioWhatsAppNumber ?? requested);
    setDisplay(own?.displayPhoneNumber ?? company?.whatsapp?.displayPhoneNumber ?? requested);
    setActive(company?.whatsapp?.isActive ?? Boolean(company?.awaitingNumber));
    setConfirmRemove(false);
  }, [company]);

  const onDone = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    onOpenChange(false);
  };

  const assign = useMutation({
    mutationFn: () =>
      apiFetch<WhatsAppConnection>(`/admin/companies/${company?.id}/whatsapp-connection`, {
        method: "PUT",
        body: JSON.stringify({
          twilioWhatsAppNumber: number.trim(),
          displayPhoneNumber: display.trim() || undefined,
          isActive: active,
        }),
      }),
    onSuccess: onDone,
  });

  const unassign = useMutation({
    mutationFn: () =>
      apiFetch<null>(`/admin/companies/${company?.id}/whatsapp-connection`, { method: "DELETE" }),
    onSuccess: onDone,
  });

  const validNumber = /^\+[1-9]\d{7,14}$/.test(number.trim());
  const error = assign.error ?? unassign.error;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (validNumber) assign.mutate();
  }

  return (
    <Sheet open={Boolean(company)} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{online ? "Sender de WhatsApp" : "Asignar sender"}</SheetTitle>
          <SheetDescription>{company?.name}</SheetDescription>
        </SheetHeader>

        {company ? <Requirements company={company} /> : null}

        {company?.numberRequest ? (
          <div className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-pretty">
            <span className="font-medium">Pidió número empresarial</span>
            <span className="text-muted-foreground">
              Compra un número en Twilio, regístralo como sender de WhatsApp y asígnalo aquí. Al
              asignarlo, la solicitud se cierra.
            </span>
          </div>
        ) : null}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-number">Número del sender en Twilio</Label>
            <Input
              id="assign-number"
              inputMode="tel"
              placeholder="+573001112233"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              aria-invalid={number.length > 0 && !validNumber}
            />
            <p className="text-xs text-muted-foreground">
              Formato internacional con +, sin el prefijo whatsapp:.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-display">WhatsApp de la tienda (opcional)</Label>
            <Input
              id="assign-display"
              placeholder="+57 300 111 2233"
              value={display}
              onChange={(event) => setDisplay(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Número de contacto de la tienda; no recibe al bot. Si lo dejas vacío, se usa el del
              sender.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Activar el asistente al asignar
          </label>

          {error ? (
            <p className="text-sm text-destructive">
              {error instanceof ApiClientError ? error.message : "No se pudo guardar"}
            </p>
          ) : null}

          <Button type="submit" disabled={!validNumber || assign.isPending}>
            {assign.isPending ? "Guardando…" : online ? "Guardar cambios" : "Asignar sender"}
          </Button>
        </form>

        {company?.whatsapp ? (
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              Al retirar el canal, la tienda deja de recibir mensajes en WhatsApp hasta que vuelva a
              activarlo.
            </p>
            {confirmRemove ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={unassign.isPending}
                  onClick={() => unassign.mutate()}
                >
                  {unassign.isPending ? "Retirando…" : "Sí, retirar canal"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-fit" onClick={() => setConfirmRemove(true)}>
                Retirar canal
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function AdminCompaniesSection() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AdminCompanyRow | null>(null);

  useEffect(() => {
    if (!sessionLoading && user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, sessionLoading, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: () => apiFetch<AdminCompanyRow[]>("/admin/companies"),
    enabled: user?.role === "admin",
  });

  if (sessionLoading || (user && user.role !== "admin")) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  const companies = data ?? [];
  const counts: Record<Filter, number> = {
    all: companies.length,
    awaiting: companies.filter((company) => company.awaitingNumber).length,
    online: companies.filter((company) => company.whatsapp?.onboardingStatus === "online").length,
    onboarding: companies.filter(
      (company) => company.whatsapp && company.whatsapp.onboardingStatus !== "online",
    ).length,
  };
  const rows = companies.filter((company) => matchesFilter(company, filter));

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Empresas"
        description="Revisa qué tiendas cumplen los requisitos, el onboarding de WhatsApp y asígnales un sender de plataforma cuando lo pidan."
      />

      <Segmented
        label="Filtrar empresas"
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((item) => ({
          value: item.id,
          label: item.label,
          count: counts[item.id],
        }))}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando empresas…</p> : null}
        {isError ? (
          <p className="p-6 text-sm text-destructive">No se pudo cargar el listado de empresas.</p>
        ) : null}
        {data && rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {filter === "awaiting"
              ? "Ninguna tienda lista está sin activar su canal."
              : "No hay empresas en esta vista."}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <table className="w-full min-w-205 text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">
                  Empresa
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Plan
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Requisitos
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  WhatsApp
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <tr key={company.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="block font-medium">{company.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {company.ownerName} · {company.ownerEmail}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">
                      {company.planCode ? PLAN_CODE_LABELS[company.planCode] : "Sin plan"}
                    </span>
                    {company.subscriptionStatus ? (
                      <span className="block text-xs text-muted-foreground">
                        {SUBSCRIPTION_STATUS_LABELS[company.subscriptionStatus]}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Requirements company={company} />
                  </td>
                  <td className="px-4 py-3">
                    <WhatsAppStatus company={company} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(company)}>
                      {company.whatsapp?.onboardingStatus === "online" ? "Editar" : "Asignar sender"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <AssignNumberSheet
        company={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </div>
  );
}
