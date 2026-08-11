"use client";

import type { BillingInterval, PlanCode, RegisterResult } from "@commerce-ai/types";
import {
  BILLING_INTERVALS,
  BILLING_INTERVAL_LABELS,
  COMPANY_COUNTRIES,
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  PLAN_CODE_LABELS,
  PLAN_CODES,
  type CompanyType,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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

const countryCodes = COMPANY_COUNTRIES.map((country) => country.code) as [
  string,
  ...string[],
];

const registerSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    email: z.string().email("Ingresa un email válido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
    companyName: z.string().min(2, "El nombre de la empresa debe tener al menos 2 caracteres"),
    companyType: z.enum(COMPANY_TYPES as [CompanyType, ...CompanyType[]], {
      message: "Selecciona el tipo de empresa",
    }),
    countryCode: z.enum(countryCodes, {
      message: "Selecciona el país de la empresa",
    }),
    planCode: z.enum(PLAN_CODES as [PlanCode, ...PlanCode[]]),
    billingInterval: z.enum(BILLING_INTERVALS as [BillingInterval, ...BillingInterval[]]),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

type RegisterValues = z.infer<typeof registerSchema>;

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const planFromQuery = searchParams.get("plan");
  const intervalFromQuery = searchParams.get("interval");
  const initialPlan: PlanCode =
    planFromQuery === "pro" || planFromQuery === "business" || planFromQuery === "free"
      ? planFromQuery
      : "free";
  const initialInterval: BillingInterval =
    intervalFromQuery === "year" ? "year" : "month";

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      companyName: "",
      companyType: undefined,
      countryCode: undefined,
      planCode: initialPlan,
      billingInterval: initialInterval,
    },
  });

  useEffect(() => {
    setValue("planCode", initialPlan);
    setValue("billingInterval", initialInterval);
  }, [initialPlan, initialInterval, setValue]);

  const selectedPlan = watch("planCode");
  const selectedInterval = watch("billingInterval");

  const mutation = useMutation({
    mutationFn: async (values: RegisterValues) => {
      const result = await apiFetch<RegisterResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          companyName: values.companyName,
          companyType: values.companyType,
          countryCode: values.countryCode,
          planCode: values.planCode,
          billingInterval: values.planCode === "free" ? undefined : values.billingInterval,
        }),
      });
      return result;
    },
    onSuccess: async (result) => {
      // Plan de pago: la cuenta aún no existe; ir directo a Mercado Pago.
      if (result.checkoutRequired && result.initPoint) {
        window.location.assign(result.initPoint);
        return;
      }

      if (result.checkoutRequired && !result.initPoint) {
        throw new Error(
          "No se pudo abrir el pago de Mercado Pago. Revisa la configuración o inténtalo de nuevo.",
        );
      }

      // Free (u otro caso con sesión): entra al panel.
      await refresh();
      router.push("/");
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label>Plan</Label>
        <p className="text-xs text-muted-foreground">
          Con Free empiezas 15 días sin pagar. Si eliges Pro o Business, primero completas el pago en
          Mercado Pago y recién entonces se crea tu cuenta.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLAN_CODES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setValue("planCode", code)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                selectedPlan === code
                  ? "border-primary bg-primary/5"
                  : "border-border/70 hover:bg-accent/40",
              )}
            >
              <span className="font-medium">{PLAN_CODE_LABELS[code]}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {code === "free" ? "Trial 15 días" : code === "pro" ? "$39 USD/mes" : "$99 USD/mes"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedPlan !== "free" ? (
        <div className="flex flex-col gap-2">
          <Label>Ciclo de facturación</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {BILLING_INTERVALS.map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => setValue("billingInterval", interval)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  selectedInterval === interval
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:bg-accent/40",
                )}
              >
                <span className="font-medium">{BILLING_INTERVAL_LABELS[interval]}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {interval === "year" ? "2 meses gratis" : "Renovación cada mes"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Tu nombre</Label>
        <Input id="name" placeholder="Tu nombre" autoComplete="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@empresa.com"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Nombre de la empresa</Label>
        <Input id="companyName" placeholder="Mi tienda" {...register("companyName")} />
        {errors.companyName && (
          <p className="text-sm text-destructive">{errors.companyName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tipo de empresa</Label>
        <Controller
          control={control}
          name="companyType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {COMPANY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.companyType && (
          <p className="text-sm text-destructive">{errors.companyType.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>País</Label>
        <Controller
          control={control}
          name="countryCode"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="País de la empresa" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.countryCode && (
          <p className="text-sm text-destructive">{errors.countryCode.message}</p>
        )}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiClientError
            ? mutation.error.message
            : "No se pudo crear la cuenta"}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending
          ? selectedPlan === "free"
            ? "Creando cuenta…"
            : "Abriendo pago…"
          : selectedPlan === "free"
            ? "Crear cuenta"
            : "Continuar al pago"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <RegisterFormInner />
    </Suspense>
  );
}
