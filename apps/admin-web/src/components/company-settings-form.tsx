"use client";

import {
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  canEditCompany,
  type CompanyDetails,
  type CompanyType,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .transform((value) => value.trim())
    .optional()
    .or(z.literal(""));

const updateCompanySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  companyType: z.enum(COMPANY_TYPES as [CompanyType, ...CompanyType[]], {
    message: "Selecciona el tipo de empresa",
  }),
  phone: optionalText(30, "El teléfono no puede exceder 30 caracteres"),
  contactEmail: z
    .string()
    .trim()
    .max(255, "El email no puede exceder 255 caracteres")
    .email("Ingresa un email de contacto válido")
    .or(z.literal(""))
    .optional(),
  website: optionalText(255, "El sitio web no puede exceder 255 caracteres"),
  address: optionalText(255, "La dirección no puede exceder 255 caracteres"),
  description: optionalText(1000, "La descripción no puede exceder 1000 caracteres"),
});

type UpdateCompanyValues = z.infer<typeof updateCompanySchema>;

function toFormValues(company: CompanyDetails): UpdateCompanyValues {
  return {
    name: company.name,
    companyType: company.type,
    phone: company.phone ?? "",
    contactEmail: company.contactEmail ?? "",
    website: company.website ?? "",
    address: company.address ?? "",
    description: company.description ?? "",
  };
}

export function CompanySettingsForm() {
  const { user, refresh } = useSession();
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

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdateCompanyValues>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: {
      name: "",
      companyType: undefined,
      phone: "",
      contactEmail: "",
      website: "",
      address: "",
      description: "",
    },
  });

  const companyType = watch("companyType");

  useEffect(() => {
    if (!company) {
      return;
    }
    reset(toFormValues(company));
  }, [company, reset]);

  const mutation = useMutation({
    mutationFn: (values: UpdateCompanyValues) =>
      apiFetch<CompanyDetails>("/company", {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["company", user?.companyId], updated);
      reset(toFormValues(updated));
      await refresh();
    },
  });

  if (!user?.companyId) {
    return (
      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-bold">Empresa</CardTitle>
          <CardDescription>No perteneces a una empresa activa.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando configuración…</p>;
  }

  if (error || !company) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiClientError
          ? error.message
          : "No se pudo cargar la información de la empresa"}
      </p>
    );
  }

  return (
    <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold">Datos de la empresa</CardTitle>
        <CardDescription>
          {canEdit
            ? "Actualiza el perfil, contacto y tipo de negocio de tu empresa."
            : "Solo el dueño puede editar estos datos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex max-w-xl flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-company-name">Nombre</Label>
            <Input
              id="settings-company-name"
              autoComplete="organization"
              disabled={!canEdit || mutation.isPending}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-company-type">Tipo de negocio</Label>
            <Select
              value={companyType}
              onValueChange={(value) =>
                setValue("companyType", value as CompanyType, { shouldDirty: true })
              }
              disabled={!canEdit || mutation.isPending}
            >
              <SelectTrigger id="settings-company-type" aria-label="Tipo de empresa">
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COMPANY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {COMPANY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.companyType && (
              <p className="text-sm text-destructive">{errors.companyType.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-company-phone">Teléfono</Label>
              <Input
                id="settings-company-phone"
                type="tel"
                placeholder="+57 300 000 0000"
                autoComplete="tel"
                disabled={!canEdit || mutation.isPending}
                {...register("phone")}
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-company-email">Email de contacto</Label>
              <Input
                id="settings-company-email"
                type="email"
                placeholder="hola@tuempresa.com"
                autoComplete="email"
                disabled={!canEdit || mutation.isPending}
                {...register("contactEmail")}
              />
              {errors.contactEmail && (
                <p className="text-sm text-destructive">{errors.contactEmail.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-company-website">Sitio web</Label>
            <Input
              id="settings-company-website"
              type="url"
              placeholder="https://tuempresa.com"
              autoComplete="url"
              disabled={!canEdit || mutation.isPending}
              {...register("website")}
            />
            {errors.website && <p className="text-sm text-destructive">{errors.website.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-company-address">Dirección</Label>
            <Input
              id="settings-company-address"
              placeholder="Calle, ciudad, país"
              autoComplete="street-address"
              disabled={!canEdit || mutation.isPending}
              {...register("address")}
            />
            {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-company-description">Descripción del negocio</Label>
            <Textarea
              id="settings-company-description"
              placeholder="Cuéntanos qué vende tu empresa, horarios, políticas o lo que quieras que sepa el asistente."
              disabled={!canEdit || mutation.isPending}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Creada el{" "}
            {new Date(company.createdAt).toLocaleDateString("es", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof ApiClientError
                ? mutation.error.message
                : "No se pudo conectar con el servidor"}
            </p>
          )}

          {mutation.isSuccess && !isDirty && (
            <p className="text-sm text-muted-foreground">Cambios guardados.</p>
          )}

          {canEdit && (
            <Button type="submit" disabled={mutation.isPending || !isDirty} className="w-fit">
              {mutation.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
