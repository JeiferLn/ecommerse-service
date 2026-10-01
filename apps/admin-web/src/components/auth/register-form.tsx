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
import { ArrowLeft, ArrowRight, Check, ChevronRight } from "lucide-react";
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

const fieldClass = "h-11 rounded-lg";

const tagClass =
  "font-data rounded-md border border-border px-1.5 py-0.5 text-[10px] tracking-wider text-muted-foreground uppercase";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

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
        inert={step !== "form"}
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Plan</span>
          <button
            type="button"
            onClick={goToPlanStep}
            className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{PLAN_CODE_LABELS[selectedPlan]}</span>
                {selectedPlan === "free" ? <span className={tagClass}>Sin tarjeta</span> : null}
                {selectedPlan === "pro" ? <span className={tagClass}>Recomendado</span> : null}
              </span>
              <span className="font-data mt-1 block text-xs text-muted-foreground">
                {planPriceLabel(selectedPlanData, selectedPlan)}
                {selectedPlan !== "free"
                  ? ` · ${BILLING_INTERVAL_LABELS[selectedInterval]}`
                  : null}
              </span>
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
              Cambiar
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </button>
        </div>

        {selectedPlan !== "free" ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Ciclo de facturación</span>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
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
                      "rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                      selected
                        ? "bg-card font-medium text-foreground ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block">{BILLING_INTERVAL_LABELS[interval]}</span>
                    <span
                      className={cn(
                        "font-data mt-0.5 block text-[11px]",
                        interval === "year" && selected ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {interval === "year" ? "2 meses gratis" : "Mes a mes"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">
              Tu nombre
            </Label>
            <Input
              id="name"
              placeholder="Tu nombre"
              autoComplete="name"
              className={fieldClass}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            <FieldError id="name-error" message={errors.name?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@empresa.com"
              autoComplete="email"
              className={fieldClass}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            <FieldError id="email-error" message={errors.email?.message} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className={fieldClass}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <FieldError id="password-error" message={errors.password?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">
              Confirmar contraseña
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={fieldClass}
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
              {...register("confirmPassword")}
            />
            <FieldError id="confirmPassword-error" message={errors.confirmPassword?.message} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">
            Nombre de la empresa
          </Label>
          <Input
            id="companyName"
            placeholder="Mi tienda"
            className={fieldClass}
            aria-invalid={errors.companyName ? true : undefined}
            aria-describedby={errors.companyName ? "companyName-error" : undefined}
            {...register("companyName")}
          />
          <FieldError id="companyName-error" message={errors.companyName?.message} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="companyType">Tipo de empresa</Label>
            <Controller
              control={control}
              name="companyType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="companyType"
                    className="h-11! w-full rounded-lg"
                    aria-invalid={errors.companyType ? true : undefined}
                    aria-describedby={errors.companyType ? "companyType-error" : undefined}
                  >
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent className="site">
                    {COMPANY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {COMPANY_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError id="companyType-error" message={errors.companyType?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="countryCode">País</Label>
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="countryCode"
                    className="h-11! w-full rounded-lg"
                    aria-invalid={errors.countryCode ? true : undefined}
                    aria-describedby={errors.countryCode ? "countryCode-error" : undefined}
                  >
                    <SelectValue placeholder="País de la empresa" />
                  </SelectTrigger>
                  <SelectContent className="site">
                    {COMPANY_COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError id="countryCode-error" message={errors.countryCode?.message} />
          </div>
        </div>

        {mutation.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {mutation.error instanceof ApiClientError
              ? mutation.error.message
              : "No se pudo crear la cuenta"}
          </p>
        )}

        <Button type="submit" size="lg" disabled={mutation.isPending} className="mt-2 h-11 w-full">
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
        inert={step !== "plan"}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={goToFormStep}
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            aria-label="Volver al registro"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Elige tu plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Free no pide tarjeta. Pro y Business se activan tras pagar en Mercado Pago.
            </p>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-lg border border-border bg-card"
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
                  "flex w-full items-center gap-3 px-4 py-4 text-left transition-colors focus-visible:bg-muted focus-visible:outline-none",
                  index > 0 && "border-t border-border",
                  selected ? "bg-accent" : "hover:bg-muted",
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
                  {selected ? <Check className="size-3 stroke-3" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{PLAN_CODE_LABELS[code]}</span>
                    {highlighted && code !== "free" ? (
                      <span className={tagClass}>Recomendado</span>
                    ) : null}
                    {code === "free" ? <span className={tagClass}>Sin tarjeta</span> : null}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {planHint(code)}
                  </span>
                </span>

                <span className="font-data shrink-0 text-right text-sm">
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
