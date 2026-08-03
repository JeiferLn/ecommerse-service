"use client";

import {
  canEditCompany,
  COMPANY_COUNTRIES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  SHIPPING_SCOPE_LABELS,
  SHIPPING_SCOPES,
  type CompanyDetails,
  type PaymentMethod,
  type ShippingScope,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const [countryCode, setCountryCode] = useState<string>("");
  const [shippingScopes, setShippingScopes] = useState<ShippingScope[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [shippingCarriers, setShippingCarriers] = useState<string[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [carrierDraft, setCarrierDraft] = useState("");
  const [bankDraft, setBankDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!company) {
      return;
    }
    setCountryCode(company.commerce.countryCode ?? "");
    setShippingScopes(company.commerce.shippingScopes);
    setPaymentMethods(company.commerce.paymentMethods);
    setShippingCarriers(company.commerce.shippingCarriers);
    setBanks(company.commerce.banks);
    setDirty(false);
  }, [company]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CompanyDetails>("/company/commerce", {
        method: "PATCH",
        body: JSON.stringify({
          countryCode: countryCode || null,
          shippingScopes,
          paymentMethods,
          shippingCarriers,
          banks,
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
    return <p className="text-sm text-muted-foreground">Cargando envíos y pagos…</p>;
  }

  if (error || !company) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiClientError
          ? error.message
          : "No se pudo cargar la configuración de envíos y pagos"}
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

  const addBank = () => {
    const value = bankDraft.trim();
    if (!value) {
      return;
    }
    if (!banks.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setBanks([...banks, value]);
      setDirty(true);
    }
    setBankDraft("");
  };

  return (
    <Card id="envios-y-pagos" className="scroll-mt-6 border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <Truck className="size-5" aria-hidden />
          Envíos y pagos
        </CardTitle>
        <CardDescription>
          El bot necesita esto para cerrar ventas sin un asesor. Define país, cobertura, transportadoras
          y cómo cobran para que el cliente pueda elegir en el chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-5">
        {!company.commerce.isConfigured && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            Aún incompleto: hasta que lo configures, el asistente no inventará métodos y pedirá un
            asesor si el cliente quiere pagar o enviar.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="commerce-country">País de la tienda</Label>
          <Select
            value={countryCode || undefined}
            onValueChange={(value) => {
              setCountryCode(value);
              setDirty(true);
            }}
            disabled={!canEdit || mutation.isPending}
          >
            <SelectTrigger id="commerce-country" aria-label="País">
              <SelectValue placeholder="Selecciona el país" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {COMPANY_COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Métodos de pago</legend>
          <div className="flex flex-col gap-2">
            {PAYMENT_METHODS.map((method) => {
              const checked = paymentMethods.includes(method);
              return (
                <label
                  key={method}
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
                      setPaymentMethods(toggleInList(paymentMethods, method));
                      setDirty(true);
                    }}
                  />
                  {PAYMENT_METHOD_LABELS[method]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="commerce-bank">Bancos / medios para transferir</Label>
          <p className="text-xs text-muted-foreground">
            Obligatorio si aceptas transferencia (Bancolombia, Nequi, BBVA…).
          </p>
          <div className="flex gap-2">
            <Input
              id="commerce-bank"
              placeholder="Ej. Bancolombia, Nequi…"
              value={bankDraft}
              disabled={!canEdit || mutation.isPending}
              onChange={(event) => setBankDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addBank();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || mutation.isPending || !bankDraft.trim()}
              onClick={addBank}
            >
              <Plus className="size-4" aria-hidden />
              Añadir
            </Button>
          </div>
          <TagList
            items={banks}
            disabled={!canEdit || mutation.isPending}
            onRemove={(value) => {
              setBanks(banks.filter((item) => item !== value));
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
          <p className="text-sm text-muted-foreground">Envíos y pagos guardados.</p>
        )}

        {canEdit ? (
          <Button
            type="button"
            className="w-fit"
            disabled={mutation.isPending || !dirty}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Guardando…" : "Guardar envíos y pagos"}
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
