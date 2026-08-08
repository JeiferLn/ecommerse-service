"use client";

import {
  canEditCompany,
  SHIPPING_SCOPE_LABELS,
  SHIPPING_SCOPES,
  type CompanyDetails,
  type ShippingScope,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LocationSelects, type LocationValue } from "@/components/location-selects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function TagList({
  items,
  onRemove,
  disabled,
}: {
  items: string[];
  onRemove: (value: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Ninguno aún.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs"
        >
          <span>{item}</span>
          {!disabled && (
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => onRemove(item)}
              aria-label={`Quitar ${item}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CompanyCommerceSettingsForm() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canEdit = Boolean(user && canEditCompany(user.role));

  const {
    data: company,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId),
  });

  const [location, setLocation] = useState<LocationValue>({
    countryCode: "",
    region: "",
    city: "",
  });
  const [shippingScopes, setShippingScopes] = useState<ShippingScope[]>([]);
  const [shippingCarriers, setShippingCarriers] = useState<string[]>([]);
  const [carrierDraft, setCarrierDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!company) {
      return;
    }
    setLocation({
      countryCode: company.commerce.countryCode ?? "",
      region: company.commerce.shippingRegion ?? "",
      city: company.commerce.shippingCity ?? "",
    });
    setShippingScopes(company.commerce.shippingScopes);
    setShippingCarriers(company.commerce.shippingCarriers);
    setDirty(false);
  }, [company]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CompanyDetails>("/company/commerce", {
        method: "PATCH",
        body: JSON.stringify({
          countryCode: location.countryCode || null,
          shippingRegion: location.region.trim() || null,
          shippingCity: location.city.trim() || null,
          shippingScopes,
          shippingCarriers,
        }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["company", user?.companyId], updated);
      setDirty(false);
    },
  });

  if (!user?.companyId) {
    return null;
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando envíos…</p>;
  }

  if (error || !company) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiClientError
          ? error.message
          : "No se pudo cargar la configuración de envíos"}
      </p>
    );
  }

  const addCarrier = () => {
    const value = carrierDraft.trim();
    if (!value) {
      return;
    }
    if (!shippingCarriers.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setShippingCarriers([...shippingCarriers, value]);
      setDirty(true);
    }
    setCarrierDraft("");
  };

  return (
    <Card
      id="envios-y-pagos"
      className="scroll-mt-6 border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm"
    >
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <Truck className="size-5" aria-hidden />
          Envíos
        </CardTitle>
        <CardDescription>
          El bot necesita ubicación, cobertura y transportadoras para orientar al cliente. El pago se
          manejará por pasarela de la plataforma (no se configura aquí).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-5">
        {!company.commerce.isConfigured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            Aún incompleto: hasta que configures envíos, WhatsApp permanece bloqueado.
          </p>
        )}

        <LocationSelects
          idPrefix="commerce"
          variant="company"
          lockCountry={Boolean(company.commerce.countryCode)}
          value={location}
          disabled={!canEdit || mutation.isPending}
          onChange={(next) => {
            setLocation(next);
            setDirty(true);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Departamento y municipio son la base de la tienda (obligatorios si ofreces envío local) y
          sirven para validar destinos en el checkout. El cliente elige su propio país / depto /
          municipio al pagar.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Alcance de envíos</legend>
          <div className="flex flex-col gap-2">
            {SHIPPING_SCOPES.map((scope) => {
              const checked = shippingScopes.includes(scope);
              return (
                <label
                  key={scope}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm",
                    checked && "border-primary/40 bg-primary/5",
                    (!canEdit || mutation.isPending) && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    disabled={!canEdit || mutation.isPending}
                    onChange={() => {
                      setShippingScopes(toggleInList(shippingScopes, scope));
                      setDirty(true);
                    }}
                  />
                  {SHIPPING_SCOPE_LABELS[scope]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="commerce-carrier">Empresas de transporte</Label>
          <div className="flex gap-2">
            <Input
              id="commerce-carrier"
              placeholder="Ej. Servientrega, Interrapidisimo…"
              value={carrierDraft}
              disabled={!canEdit || mutation.isPending}
              onChange={(event) => setCarrierDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCarrier();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || mutation.isPending || !carrierDraft.trim()}
              onClick={addCarrier}
            >
              <Plus className="size-4" aria-hidden />
              Añadir
            </Button>
          </div>
          <TagList
            items={shippingCarriers}
            disabled={!canEdit || mutation.isPending}
            onRemove={(value) => {
              setShippingCarriers(shippingCarriers.filter((item) => item !== value));
              setDirty(true);
            }}
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof ApiClientError
              ? mutation.error.message
              : "No se pudo guardar"}
          </p>
        )}
        {mutation.isSuccess && !dirty && (
          <p className="text-sm text-muted-foreground">Envíos guardados.</p>
        )}

        {canEdit ? (
          <Button
            type="button"
            className="w-fit"
            disabled={mutation.isPending || !dirty}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Guardando…" : "Guardar envíos"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Solo el dueño puede editar esta sección.</p>
        )}

        <p className="text-xs text-muted-foreground">
          También puedes volver desde WhatsApp:{" "}
          <Link href="/dashboard/whatsapp" className="underline underline-offset-4">
            conexión WhatsApp
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
