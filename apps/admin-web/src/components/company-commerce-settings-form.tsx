"use client";

import {
  canEditCompany,
  SHIPPING_SCOPE_LABELS,
  SHIPPING_SCOPES,
  type CompanyDetails,
  type ShippingScope,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { FormActions } from "@/components/form-actions";
import { FormSection } from "@/components/form-section";
import { LocationSelects, type LocationValue } from "@/components/location-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
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
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
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

  if (!user) {
    return <SkeletonText lines={5} className="max-w-xl" />;
  }

  if (!user.companyId) {
    return null;
  }

  if (isLoading) {
    return <SkeletonText lines={5} className="max-w-xl" />;
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

  const locked = !canEdit || mutation.isPending;

  return (
    <form
      id="envios-y-pagos"
      className="flex scroll-mt-6 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      {!company.commerce.isConfigured ? (
        <p className="mb-6 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Aún incompleto: el asistente no puede atender en WhatsApp hasta que configures envíos.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mb-6 text-sm text-muted-foreground">
          Solo el dueño puede editar esta sección.
        </p>
      ) : null}

      <FormSection
        title="Origen"
        description="Desde dónde despachas. Sirve para validar destinos en el checkout; el cliente elige su propia ubicación al pagar."
      >
        <LocationSelects
          idPrefix="commerce"
          variant="company"
          inline
          lockCountry={Boolean(company.commerce.countryCode)}
          value={location}
          disabled={locked}
          onChange={(next) => {
            setLocation(next);
            setDirty(true);
          }}
        />
      </FormSection>

      <FormSection title="Alcance" description="Hasta dónde llegan tus envíos.">
        <fieldset className="flex flex-col divide-y divide-border rounded-md border border-border">
          <legend className="sr-only">Alcance de envíos</legend>
          {SHIPPING_SCOPES.map((scope) => {
            const checked = shippingScopes.includes(scope);
            return (
              <label
                key={scope}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-muted/40",
                  locked && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked}
                  disabled={locked}
                  onChange={() => {
                    setShippingScopes(toggleInList(shippingScopes, scope));
                    setDirty(true);
                  }}
                />
                {SHIPPING_SCOPE_LABELS[scope]}
              </label>
            );
          })}
        </fieldset>
      </FormSection>

      <FormSection
        title="Transportadoras"
        description="Las empresas con las que envías. El asistente las menciona al cliente."
      >
        <div className="flex gap-2">
          <Input
            id="commerce-carrier"
            aria-label="Empresa de transporte"
            placeholder="Ej. Servientrega, Interrapidisimo…"
            value={carrierDraft}
            disabled={locked}
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
            disabled={locked || !carrierDraft.trim()}
            onClick={addCarrier}
          >
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </div>
        <TagList
          items={shippingCarriers}
          disabled={locked}
          onRemove={(value) => {
            setShippingCarriers(shippingCarriers.filter((item) => item !== value));
            setDirty(true);
          }}
        />
      </FormSection>

      {canEdit ? (
        <FormActions
          dirty={dirty}
          pending={mutation.isPending}
          saved={mutation.isSuccess}
          submitLabel="Guardar envíos"
          error={
            mutation.isError
              ? mutation.error instanceof ApiClientError
                ? mutation.error.message
                : "No se pudo guardar"
              : null
          }
        />
      ) : null}
    </form>
  );
}
