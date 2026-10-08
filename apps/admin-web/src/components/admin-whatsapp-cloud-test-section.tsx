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
  provider: string;
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
  const [text, setText] = useState("Hola, prueba de Commerce AI");
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
        description="Envía un mensaje real desde tu número de WhatsApp en Twilio. La app dispara el envío y el celular lo recibe."
      />

      <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={configured ? "positive" : "attention"} className="w-fit">
            {configured ? "Twilio configurado" : "Faltan credenciales de Twilio"}
          </StatusPill>
        </div>

        {!configured && !statusQuery.isLoading ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-pretty text-muted-foreground">
            En <span className="font-data text-foreground">apps/api-py/.env</span> hacen falta{" "}
            <span className="font-data text-foreground">TWILIO_ACCOUNT_SID</span> y{" "}
            <span className="font-data text-foreground">TWILIO_AUTH_TOKEN</span>. El número que
            envía es el sender de WhatsApp de esa cuenta de Twilio.
          </p>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="size-4 text-primary" aria-hidden />
            E-commerce AI · envío por Twilio
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-from">Número que envía (Twilio)</Label>
            <Input
              id="wa-from"
              name="from"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1415…"
              value={fromNumber}
              onChange={(event) => setFromNumber(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              El sender de WhatsApp de tu cuenta de Twilio, en formato internacional con +.
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
              El WhatsApp que debe recibir el mensaje. Si el sender es el sandbox de Twilio, ese
              número tiene que haber aceptado el código de unión.
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
