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

type Filter = "all" | "awaiting" | "assigned";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "awaiting", label: "Esperando número" },
  { id: "assigned", label: "Con número" },
];

const REQUIREMENT_LABELS: { key: keyof AdminCompanyRow["requirements"]; label: string }[] = [
  { key: "products", label: "Productos" },
  { key: "shipping", label: "Envíos" },
  { key: "knowledge", label: "Documentos" },
  { key: "payments", label: "Pagos" },
];

function matchesFilter(company: AdminCompanyRow, filter: Filter): boolean {
  if (filter === "awaiting") return company.awaitingNumber;
  if (filter === "assigned") return Boolean(company.whatsapp);
  return true;
}

function WhatsAppStatus({ company }: { company: AdminCompanyRow }) {
  if (company.whatsapp) {
    return (
      <span className="flex flex-col">
        <span className="font-data text-sm">{company.whatsapp.twilioWhatsAppNumber}</span>
        <span
          className={cn(
            "text-xs",
            company.whatsapp.isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {company.whatsapp.isActive ? "Asistente activo" : "En pausa"}
        </span>
      </span>
    );
  }
  if (company.awaitingNumber) {
    return (
      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
        Esperando número
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Requisitos pendientes</span>;
}

function Requirements({ company }: { company: AdminCompanyRow }) {
  const done = REQUIREMENT_LABELS.filter((item) => company.requirements[item.key]).length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`${done} de 4 requisitos`}>
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

  useEffect(() => {
    setNumber(company?.whatsapp?.twilioWhatsAppNumber ?? "");
    setDisplay(company?.whatsapp?.displayPhoneNumber ?? "");
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
          <SheetTitle>
            {company?.whatsapp ? "Número de WhatsApp" : "Asignar número de WhatsApp"}
          </SheetTitle>
          <SheetDescription>{company?.name}</SheetDescription>
        </SheetHeader>

        {company ? <Requirements company={company} /> : null}

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
            <Label htmlFor="assign-display">Número visible para clientes (opcional)</Label>
            <Input
              id="assign-display"
              placeholder="+57 300 111 2233"
              value={display}
              onChange={(event) => setDisplay(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Se usa para el enlace wa.me de la tienda.</p>
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
            {assign.isPending ? "Guardando…" : company?.whatsapp ? "Guardar cambios" : "Asignar número"}
          </Button>
        </form>

        {company?.whatsapp ? (
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              Al retirar el número, la tienda deja de recibir mensajes en WhatsApp.
            </p>
            {confirmRemove ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={unassign.isPending}
                  onClick={() => unassign.mutate()}
                >
                  {unassign.isPending ? "Retirando…" : "Sí, retirar número"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-fit" onClick={() => setConfirmRemove(true)}>
                Retirar número
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
    assigned: companies.filter((company) => company.whatsapp).length,
  };
  const rows = companies.filter((company) => matchesFilter(company, filter));

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Empresas"
        description="Revisa qué tiendas cumplen los requisitos y asígnales su número de WhatsApp."
      />

      <Segmented
        label="Filtrar empresas"
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((item) => ({ value: item.id, label: item.label, count: counts[item.id] }))}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando empresas…</p> : null}
        {isError ? (
          <p className="p-6 text-sm text-destructive">No se pudo cargar el listado de empresas.</p>
        ) : null}
        {data && rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {filter === "awaiting"
              ? "Ninguna tienda está esperando número."
              : "No hay empresas en esta vista."}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <table className="w-full min-w-205 text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-medium">Empresa</th>
                <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                <th scope="col" className="px-4 py-3 font-medium">Requisitos</th>
                <th scope="col" className="px-4 py-3 font-medium">WhatsApp</th>
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
                    <Button
                      size="sm"
                      variant={company.awaitingNumber ? "default" : "outline"}
                      onClick={() => setEditing(company)}
                    >
                      {company.whatsapp ? "Editar" : "Asignar número"}
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
