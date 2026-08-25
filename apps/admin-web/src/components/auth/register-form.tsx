"use client";

import type { BillingInterval, PlanCode, PlanView, RegisterResult } from "@commerce-ai/types";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
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

const fieldLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function planPriceLabel(plan: PlanView | undefined, code: PlanCode): string {
  if (code === "free") return "15 días gratis";
  if (!plan) return "Consulta precios";
  return `$${Math.round(plan.priceUsdCents / 100)} USD/mes`;
}

function planHint(code: PlanCode): string {
  if (code === "free") return "Ideal para probar el asistente";
  if (code === "pro") return "Para tiendas en crecimiento";
  return "Para operaciones a escala";
}

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
type RegisterStep = "form" | "plan";

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [step, setStep] = useState<RegisterStep>("form");
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    };
  }, []);

  const selectedPlan = watch("planCode");
  const selectedInterval = watch("billingInterval");

  const { data: plans } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<PlanView[]>("/billing/plans"),
    staleTime: 60_000,
  });

  const plansByCode = Object.fromEntries((plans ?? []).map((p) => [p.code, p])) as Partial<
    Record<PlanCode, PlanView>
  >;
  const selectedPlanData = plansByCode[selectedPlan];

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
      if (result.checkoutRequired && result.initPoint) {
        window.location.assign(result.initPoint);
        return;
      }

      if (result.checkoutRequired && !result.initPoint) {
        throw new Error(
          "No se pudo abrir el pago de Mercado Pago. Revisa la configuración o inténtalo de nuevo.",
        );
      }

      await refresh();
      router.push("/");
      router.refresh();
    },
  });

  const goToPlanStep = () => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setStep("plan");
  };

  const goToFormStep = () => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setStep("form");
  };

  const selectPlan = (code: PlanCode) => {
    setValue("planCode", code);
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => {
      setStep("form");
      returnTimer.current = null;
    }, 420);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Form step */}
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className={cn(
          "flex flex-col gap-5 transition-all duration-300 ease-out",
          step === "form"
            ? "relative translate-x-0 opacity-100"
            : "pointer-events-none absolute inset-x-0 top-0 -translate-x-6 opacity-0",
        )}
        aria-hidden={step !== "form"}
      >
        <div className="flex flex-col gap-2">
          <Label className={fieldLabelClass}>Plan</Label>
          <button
            type="button"
            onClick={goToPlanStep}
            className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3.5 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-sm font-semibold">
                  {PLAN_CODE_LABELS[selectedPlan]}
                </span>
                {selectedPlan === "free" ? (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                    Sin tarjeta
                  </span>
                ) : selectedPlan === "pro" ? (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                    Popular
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {planPriceLabel(selectedPlanData, selectedPlan)}
                {selectedPlan !== "free"
                  ? ` · ${BILLING_INTERVAL_LABELS[selectedInterval]}`
                  : null}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              Cambiar
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        {selectedPlan !== "free" ? (
          <div className="flex flex-col gap-2">
            <Label className={fieldLabelClass}>Ciclo de facturación</Label>
            <div
              className="grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1"
              role="radiogroup"
              aria-label="Ciclo de facturación"
            >
              {BILLING_INTERVALS.map((interval) => {
                const selected = selectedInterval === interval;
                return (
                  <button
                    key={interval}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setValue("billingInterval", interval)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-center text-sm transition-all",
                      selected
                        ? "bg-background font-semibold text-primary shadow-sm ring-1 ring-border dark:bg-[#282a33] dark:ring-white/10"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block">{BILLING_INTERVAL_LABELS[interval]}</span>
                    {interval === "year" ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-primary">
                        2 meses gratis
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] font-medium opacity-70">
                        Mes a mes
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className={fieldLabelClass}>
              Tu nombre
            </Label>
            <Input
              id="name"
              placeholder="Tu nombre"
              autoComplete="name"
              className="h-12 rounded-lg"
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className={fieldLabelClass}>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@empresa.com"
              autoComplete="email"
              className="h-12 rounded-lg"
              {...register("email")}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className={fieldLabelClass}>
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="h-12 rounded-lg"
              {...register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword" className={fieldLabelClass}>
              Confirmar contraseña
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="h-12 rounded-lg"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyName" className={fieldLabelClass}>
            Nombre de la empresa
          </Label>
          <Input
            id="companyName"
            placeholder="Mi tienda"
            className="h-12 rounded-lg"
            {...register("companyName")}
          />
          {errors.companyName && (
            <p className="text-sm text-destructive">{errors.companyName.message}</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className={fieldLabelClass}>Tipo de empresa</Label>
            <Controller
              control={control}
              name="companyType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-12! rounded-lg">
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

          <div className="flex flex-col gap-1.5">
            <Label className={fieldLabelClass}>País</Label>
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-12! rounded-lg">
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
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof ApiClientError
              ? mutation.error.message
              : "No se pudo crear la cuenta"}
          </p>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="premium-btn-primary mt-1 h-12 w-full gap-2 rounded-xl text-sm font-semibold tracking-wide text-white uppercase"
        >
          {mutation.isPending
            ? selectedPlan === "free"
              ? "Creando cuenta…"
              : "Abriendo pago…"
            : selectedPlan === "free"
              ? "Crear cuenta"
              : "Continuar al pago"}
          {!mutation.isPending && <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </form>

      {/* Plan picker step */}
      <div
        className={cn(
          "flex flex-col gap-5 transition-all duration-300 ease-out",
          step === "plan"
            ? "relative translate-x-0 opacity-100"
            : "pointer-events-none absolute inset-x-0 top-0 translate-x-6 opacity-0",
        )}
        aria-hidden={step !== "plan"}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={goToFormStep}
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Volver al registro"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <div>
            <h2 className="font-heading text-xl font-bold tracking-tight">Elige tu plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Free no pide tarjeta. Pro y Business se activan tras pagar en Mercado Pago.
            </p>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-2xl border border-border/70 bg-muted/30"
          role="radiogroup"
          aria-label="Plan"
        >
          {PLAN_CODES.map((code, index) => {
            const selected = selectedPlan === code;
            const plan = plansByCode[code];
            const highlighted = Boolean(plan?.highlighted) || code === "pro";

            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectPlan(code)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                  index > 0 && "border-t border-border/60",
                  selected ? "bg-primary/10" : "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/35",
                  )}
                  aria-hidden
                >
                  {selected ? <Check className="size-3 stroke-[3]" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-sm font-semibold">
                      {PLAN_CODE_LABELS[code]}
                    </span>
                    {highlighted && code !== "free" ? (
                      <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                        Popular
                      </span>
                    ) : null}
                    {code === "free" ? (
                      <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                        Sin tarjeta
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {planHint(code)}
                  </span>
                </span>

                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                  {planPriceLabel(plan, code)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RegisterForm() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <RegisterFormInner />
    </Suspense>
  );
}
