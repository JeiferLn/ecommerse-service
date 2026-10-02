"use client";

import type {
  PlatformSettings,
  PlatformWhatsAppSettings,
  UpdatePlatformSettingsRequest,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { FormSection } from "@/components/form-section";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const QUERY_KEY = ["admin-platform-settings"];
const E164 = /^\+[1-9]\d{7,14}$/;

type SendMode = "simulated" | "real";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlatformSettingsRequest) =>
      apiFetch<PlatformSettings>("/admin/platform-settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      void queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
  });
}

function SharedNumberForm({ whatsapp }: { whatsapp: PlatformWhatsAppSettings }) {
  const update = useUpdateSettings();
  const saved = whatsapp.sharedNumberSource === "panel" ? (whatsapp.sharedNumber ?? "") : "";
  const [number, setNumber] = useState(saved);

  useEffect(() => setNumber(saved), [saved]);

  const value = number.trim();
  const valid = value === "" || E164.test(value);
  const dirty = value !== saved;
  const movesStores =
    dirty &&
    whatsapp.sharedStoresCount > 0 &&
    (value || whatsapp.envSharedNumber) !== whatsapp.sharedNumber;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (valid && dirty) update.mutate({ sharedWhatsAppNumber: value || null });
  }

  let hint: string;
  if (whatsapp.sharedNumberSource === "env") {
    hint = `Hoy se usa el del .env (${whatsapp.sharedNumber}). Guárdalo aquí para cambiarlo sin reiniciar la API.`;
  } else if (whatsapp.envSharedNumber) {
    hint = `Si lo dejas vacío se usa el del .env (${whatsapp.envSharedNumber}).`;
  } else if (whatsapp.sharedNumber) {
    hint = "Formato internacional con +, sin el prefijo whatsapp:.";
  } else {
    hint = "Sin número compartido, las tiendas no pueden activar su canal de WhatsApp.";
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="shared-number">Número del sender en Twilio</Label>
        <Input
          id="shared-number"
          inputMode="tel"
          placeholder={whatsapp.envSharedNumber ?? "+15554447456"}
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          aria-invalid={!valid}
          aria-describedby="shared-number-hint"
          className="max-w-xs font-data"
        />
        <p id="shared-number-hint" className="text-xs text-pretty text-muted-foreground">
          {valid ? hint : "Usa formato E.164 con +: +15554447456"}
        </p>
      </div>

      {movesStores ? (
        <p className="rounded-md border border-border bg-warning-soft p-3 text-sm text-pretty">
          {whatsapp.sharedStoresCount === 1
            ? "La tienda que lo usa pasa al número nuevo"
            : `Las ${whatsapp.sharedStoresCount} tiendas que lo usan pasan al número nuevo`}
          : sus enlaces de WhatsApp cambian y los clientes deben escribir al nuevo.
        </p>
      ) : null}

      {update.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(update.error, "No se pudo guardar")}
        </p>
      ) : null}

      <Button type="submit" className="w-fit" disabled={!valid || !dirty || update.isPending}>
        {update.isPending ? "Guardando…" : "Guardar número"}
      </Button>
    </form>
  );
}

function SendModeControl({ whatsapp }: { whatsapp: PlatformWhatsAppSettings }) {
  const update = useUpdateSettings();
  const mode: SendMode = whatsapp.simulateSend ? "simulated" : "real";
  const realWithoutCredentials = !whatsapp.simulateSend && !whatsapp.credentialsConfigured;

  return (
    <div className="flex flex-col gap-3">
      {whatsapp.simulateSendEditable ? (
        <Segmented
          label="Modo de envío"
          value={mode}
          onChange={(next) => {
            if (next !== mode) update.mutate({ whatsappSimulateSend: next === "simulated" });
          }}
          options={[
            { value: "simulated", label: "Simulado" },
            { value: "real", label: "Real por Twilio" },
          ]}
        />
      ) : (
        <StatusPill tone={whatsapp.simulateSend ? "attention" : "positive"} className="w-fit">
          {whatsapp.simulateSend ? "Simulado" : "Real por Twilio"}
        </StatusPill>
      )}

      <p key={mode} className="fade-swap text-sm text-pretty text-muted-foreground">
        {whatsapp.simulateSend
          ? "Los mensajes quedan en Conversaciones pero no llegan al cliente."
          : "Las respuestas del asistente y de los asesores salen por WhatsApp de verdad."}
      </p>

      {realWithoutCredentials ? (
        <p className="text-sm text-destructive">
          Faltan TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en apps/api-py/.env: los envíos se seguirán
          simulando.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {whatsapp.simulateSendEditable
          ? whatsapp.simulateSendSource === "panel"
            ? "Elegido en este panel."
            : "Tomado del .env (WHATSAPP_SIMULATE_SEND)."
          : "En producción solo se cambia en el .env (WHATSAPP_SIMULATE_SEND)."}
        {whatsapp.simulateSendEditable && whatsapp.simulateSendSource === "panel" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ whatsappSimulateSend: null })}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Usar el del .env
          </Button>
        ) : null}
      </div>

      {update.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(update.error, "No se pudo cambiar el modo de envío")}
        </p>
      ) : null}
    </div>
  );
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate font-data text-[13px]" title={url}>
        {url}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
        <span key={String(copied)} className="fade-swap">
          {copied ? "Copiado" : "Copiar"}
        </span>
      </Button>
    </div>
  );
}

function TwilioStatus({ whatsapp }: { whatsapp: PlatformWhatsAppSettings }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Webhook de mensajes entrantes</span>
        {whatsapp.webhookUrl ? (
          <>
            <WebhookUrl url={whatsapp.webhookUrl} />
            <p className="text-xs text-pretty text-muted-foreground">
              Pégala en Twilio, en el sender de WhatsApp, como &quot;When a message comes in&quot;
              (POST).
            </p>
          </>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            Sin URL pública: define API_PUBLIC_URL o TWILIO_WEBHOOK_URL (por ejemplo, con ngrok).
          </p>
        )}
      </div>

      <dl className="flex flex-col divide-y divide-border">
        <StatusRow label="Credenciales (SID y token)">
          <StatusPill tone={whatsapp.credentialsConfigured ? "positive" : "negative"}>
            {whatsapp.credentialsConfigured ? "Configuradas" : "Faltan"}
          </StatusPill>
        </StatusRow>
        <StatusRow label="Firma del webhook">
          <StatusPill tone={whatsapp.signatureValidation ? "positive" : "attention"}>
            {whatsapp.signatureValidation ? "Se valida" : "Sin validar (solo desarrollo)"}
          </StatusPill>
        </StatusRow>
        <StatusRow label="Botones y listas">
          <StatusPill tone={whatsapp.interactiveEnabled ? "positive" : "neutral"}>
            {whatsapp.interactiveEnabled ? "Activos" : "Solo texto"}
          </StatusPill>
        </StatusRow>
        <StatusRow label="Plantilla del botón de pago">
          <StatusPill tone={whatsapp.checkoutTemplateConfigured ? "positive" : "neutral"}>
            {whatsapp.checkoutTemplateConfigured ? "Configurada" : "Sin plantilla, enlace en texto"}
          </StatusPill>
        </StatusRow>
      </dl>
    </div>
  );
}

export function AdminPlatformSettingsSection() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  useEffect(() => {
    if (!sessionLoading && user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, sessionLoading, router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<PlatformSettings>("/admin/platform-settings"),
    enabled: user?.role === "admin",
  });

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title="Configuración"
        description="Ajustes de la plataforma que comparten todas las tiendas. Las credenciales de Twilio viven en apps/api-py/.env y aquí solo se muestra si están."
      />

      {sessionLoading || isLoading ? <SkeletonText lines={6} /> : null}

      {isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">No se pudo cargar la configuración.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <FormSection
            title="Número compartido de WhatsApp"
            description={
              <>
                Lo usan las tiendas sin número propio; cada una se identifica por el código #tienda
                de su enlace.{" "}
                {data.whatsapp.sharedStoresCount === 1
                  ? "Hoy lo usa 1 tienda."
                  : `Hoy lo usan ${data.whatsapp.sharedStoresCount} tiendas.`}
              </>
            }
          >
            <SharedNumberForm whatsapp={data.whatsapp} />
          </FormSection>

          <FormSection
            title="Envío de mensajes"
            description="En modo simulado la API no llama a Twilio. Útil para probar sin gastar mensajes."
          >
            <SendModeControl whatsapp={data.whatsapp} />
          </FormSection>

          <FormSection
            title="Twilio"
            description="Estado de la cuenta de plataforma. Estos valores se cambian en apps/api-py/.env."
          >
            <TwilioStatus whatsapp={data.whatsapp} />
          </FormSection>
        </>
      ) : null}
    </div>
  );
}
