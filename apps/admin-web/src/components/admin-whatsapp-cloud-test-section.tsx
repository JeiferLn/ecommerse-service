"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

type CloudTestStatus = {
  configured: boolean;
  displayPhoneNumber: string | null;
  phoneNumberIdConfigured: boolean;
  graphApiVersion: string;
};

type CloudTestSendResult = {
  messageId: string | null;
  from: string;
  to: string;
  text: string;
  provider: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function AdminWhatsAppCloudTestSection() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const [fromNumber, setFromNumber] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [text, setText] = useState("Hola, prueba de Meta");
  const [result, setResult] = useState<CloudTestSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, sessionLoading, router]);

  const statusQuery = useQuery({
    queryKey: ["admin-whatsapp-cloud-test"],
    queryFn: () => apiFetch<CloudTestStatus>("/admin/whatsapp-cloud-test"),
    enabled: user?.role === "admin",
  });

  useEffect(() => {
    const preset = statusQuery.data?.displayPhoneNumber;
    if (preset && !fromNumber) {
      setFromNumber(preset);
    }
  }, [statusQuery.data?.displayPhoneNumber, fromNumber]);

  const send = useMutation({
    mutationFn: () =>
      apiFetch<CloudTestSendResult>("/admin/whatsapp-cloud-test/send", {
        method: "POST",
        body: JSON.stringify({
          fromDisplayNumber: fromNumber.trim(),
          to: toNumber.trim(),
          text: text.trim(),
        }),
      }),
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: (data) => setResult(data),
    onError: (err) => setError(errorMessage(err, "No se pudo enviar el mensaje")),
  });

  if (sessionLoading || (user && user.role !== "admin")) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  const configured = statusQuery.data?.configured ?? false;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send.mutate();
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="WhatsApp Test"
        description="Envía un mensaje real con la Cloud API de Meta (número de prueba). Ideal para el video de App Review: la app envía y WhatsApp lo recibe."
      />

      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={configured ? "positive" : "attention"} className="w-fit">
            {configured ? "Cloud API configurada" : "Falta configurar .env"}
          </StatusPill>
          {statusQuery.data?.graphApiVersion ? (
            <span className="font-data text-xs text-muted-foreground">
              Graph {statusQuery.data.graphApiVersion}
            </span>
          ) : null}
        </div>

        {!configured && !statusQuery.isLoading ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-pretty text-muted-foreground">
            En{" "}
            <span className="font-data text-foreground">apps/api-py/.env</span> pon el token
            temporal, Phone number ID y número de prueba de{" "}
            <span className="text-foreground">Meta → WhatsApp → API Setup</span>:{" "}
            <span className="font-data text-foreground">META_WA_ACCESS_TOKEN</span>,{" "}
            <span className="font-data text-foreground">META_WA_PHONE_NUMBER_ID</span>,{" "}
            <span className="font-data text-foreground">META_WA_DISPLAY_PHONE_NUMBER</span>. El
            destino debe estar en la lista de números de prueba de Meta.
          </p>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="size-4 text-primary" aria-hidden />
            E-commerce AI · prueba Cloud API
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-from">Número que envía (prueba Meta)</Label>
            <Input
              id="wa-from"
              name="from"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1555…"
              value={fromNumber}
              onChange={(event) => setFromNumber(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              El número de prueba que ves en API Setup. El envío real usa el Phone number ID del
              .env.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-to">Número destino (tu WhatsApp)</Label>
            <Input
              id="wa-to"
              name="to"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+57300…"
              value={toNumber}
              onChange={(event) => setToNumber(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Debe estar agregado como número de prueba en el panel de Meta.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-text">Mensaje</Label>
            <Textarea
              id="wa-text"
              name="text"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-pretty">
              <p className="font-medium text-foreground">Enviado</p>
              <p className="mt-1 text-muted-foreground">
                De <span className="font-data text-foreground">{result.from}</span> a{" "}
                <span className="font-data text-foreground">{result.to}</span>
              </p>
              <p className="mt-1 text-foreground">«{result.text}»</p>
              {result.messageId ? (
                <p className="mt-2 font-data text-xs text-muted-foreground">
                  messageId: {result.messageId}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" disabled={send.isPending || !configured} className="w-full sm:w-auto">
            {send.isPending ? "Enviando…" : "Enviar WhatsApp"}
          </Button>
        </form>
      </div>
    </div>
  );
}
