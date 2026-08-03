"use client";

import {
  canManageWhatsapp,
  type WhatsAppConnection,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageSquareText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const connectionSchema = z.object({
  phoneNumberId: z.string().min(1, "Phone Number ID es obligatorio"),
  accessToken: z.string().optional(),
  wabaId: z.string().optional(),
  displayPhoneNumber: z.string().optional(),
  isActive: z.boolean(),
});

type ConnectionValues = z.infer<typeof connectionSchema>;

const simulateSchema = z.object({
  from: z.string().min(5, "Indica el número del cliente (wa_id)"),
  text: z.string().min(1, "Escribe un mensaje"),
  customerName: z.string().optional(),
});

type SimulateValues = z.infer<typeof simulateSchema>;

export function WhatsAppConnectionSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageWhatsapp(user.role));

  const {
    data: connection,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["whatsapp-connection", user?.companyId],
    queryFn: () => apiFetch<WhatsAppConnection | null>("/whatsapp/connection"),
    enabled: Boolean(user?.companyId && canManage),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ConnectionValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      phoneNumberId: "",
      accessToken: "",
      wabaId: "",
      displayPhoneNumber: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (!connection) {
      return;
    }
    reset({
      phoneNumberId: connection.phoneNumberId,
      accessToken: "",
      wabaId: connection.wabaId ?? "",
      displayPhoneNumber: connection.displayPhoneNumber ?? "",
      isActive: connection.isActive,
    });
  }, [connection, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: ConnectionValues) => {
      const token = values.accessToken?.trim();
      if (!connection && !token) {
        throw new ApiClientError(400, "Access Token es obligatorio al crear la conexión");
      }
      return apiFetch<WhatsAppConnection>("/whatsapp/connection", {
        method: "PUT",
        body: JSON.stringify({
          phoneNumberId: values.phoneNumberId.trim(),
          ...(token ? { accessToken: token } : {}),
          wabaId: values.wabaId?.trim() || undefined,
          displayPhoneNumber: values.displayPhoneNumber?.trim() || undefined,
          isActive: values.isActive,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch<null>("/whatsapp/connection", { method: "DELETE" }),
    onSuccess: () => {
      reset({
        phoneNumberId: "",
        accessToken: "",
        wabaId: "",
        displayPhoneNumber: "",
        isActive: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });

  const simulateForm = useForm<SimulateValues>({
    resolver: zodResolver(simulateSchema),
    defaultValues: {
      from: "573001112233",
      text: "Hola, ¿tienen este producto?",
      customerName: "Cliente demo",
    },
  });

  const simulateMutation = useMutation({
    mutationFn: (values: SimulateValues) =>
      apiFetch<{ conversationId: string; messageId: string }>("/whatsapp/webhook/simulate", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp</CardTitle>
          <CardDescription>
            Solo owner y manager pueden configurar la conexión. Puedes ver el inbox de
            conversaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/whatsapp/inbox">Ir al inbox</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando conexión…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiClientError ? error.message : "No se pudo cargar la conexión"}
      </p>
    );
  }

  const isActive = watch("isActive");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard/whatsapp/inbox">
            <MessageSquareText className="size-4" aria-hidden />
            Abrir inbox
          </Link>
        </Button>
        {connection?.waMeLink && (
          <a
            href={connection.waMeLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            {connection.waMeLink}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conexión Cloud API</CardTitle>
          <CardDescription>
            Pega el Phone Number ID y el token de acceso de Meta para esta empresa. Una App Meta de
            plataforma; una conexión por empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="wa-phone-number-id">Phone Number ID</Label>
              <Input
                id="wa-phone-number-id"
                placeholder="test-phone-1"
                {...register("phoneNumberId")}
              />
              {errors.phoneNumberId && (
                <p className="text-sm text-destructive">{errors.phoneNumberId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="wa-token">Access Token</Label>
              <Input
                id="wa-token"
                type="password"
                autoComplete="off"
                placeholder={
                  connection
                    ? `Actual: ${connection.accessTokenMasked} (vacío = conservar)`
                    : "EAA… o dummy-token"
                }
                {...register("accessToken")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="wa-display">Número visible (wa.me)</Label>
                <Input
                  id="wa-display"
                  placeholder="+57 300 111 2233"
                  {...register("displayPhoneNumber")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="wa-waba">WABA ID (opcional)</Label>
                <Input id="wa-waba" placeholder="…" {...register("wabaId")} />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={isActive}
                onChange={(event) =>
                  setValue("isActive", event.target.checked, { shouldDirty: true })
                }
              />
              Conexión activa
            </label>

            {saveMutation.isError && (
              <p className="text-sm text-destructive">
                {saveMutation.error instanceof ApiClientError
                  ? saveMutation.error.message
                  : "No se pudo guardar"}
              </p>
            )}
            {saveMutation.isSuccess && (
              <p className="text-sm text-muted-foreground">Conexión guardada.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saveMutation.isPending || (!isDirty && Boolean(connection))}>
                {saveMutation.isPending ? "Guardando…" : "Guardar conexión"}
              </Button>
              {connection && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm("¿Eliminar la conexión WhatsApp de esta empresa?")) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Eliminar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simular mensaje entrante</CardTitle>
          <CardDescription>
            Inyecta un mensaje sintético sin Meta. Requiere conexión guardada. Genera conversación,
            mensaje inbound y auto-reply.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={simulateForm.handleSubmit((values) => simulateMutation.mutate(values))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="sim-from">Cliente (wa_id)</Label>
                <Input id="sim-from" {...simulateForm.register("from")} />
                {simulateForm.formState.errors.from && (
                  <p className="text-sm text-destructive">
                    {simulateForm.formState.errors.from.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sim-name">Nombre (opcional)</Label>
                <Input id="sim-name" {...simulateForm.register("customerName")} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sim-text">Mensaje</Label>
              <Textarea id="sim-text" rows={3} {...simulateForm.register("text")} />
              {simulateForm.formState.errors.text && (
                <p className="text-sm text-destructive">
                  {simulateForm.formState.errors.text.message}
                </p>
              )}
            </div>
            {simulateMutation.isError && (
              <p className="text-sm text-destructive">
                {simulateMutation.error instanceof ApiClientError
                  ? simulateMutation.error.message
                  : "No se pudo simular"}
              </p>
            )}
            {simulateMutation.isSuccess && (
              <p className="text-sm text-muted-foreground">
                Mensaje simulado. Revisa el{" "}
                <Link href="/dashboard/whatsapp/inbox" className="underline underline-offset-4">
                  inbox
                </Link>
                .
              </p>
            )}
            <Button type="submit" disabled={simulateMutation.isPending || !connection}>
              {simulateMutation.isPending ? "Simulando…" : "Simular mensaje entrante"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
