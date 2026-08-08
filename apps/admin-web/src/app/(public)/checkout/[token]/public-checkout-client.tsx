"use client";

import { CheckCircle2, Clock3, Loader2, MapPin, Package, XCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { CheckoutOrderView, CheckoutPaymentStart, OrderStatus } from "@commerce-ai/types";

import { BrandMark } from "@/components/brand-mark";
import { LocationSelects, type LocationValue } from "@/components/location-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiFetch } from "@/lib/api";

const PAID_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

function isPaidStatus(status: OrderStatus): boolean {
  return PAID_STATUSES.includes(status);
}

export default function PublicCheckoutClient() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = params.token;
  const returnStatus = searchParams.get("status");

  const [order, setOrder] = useState<CheckoutOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pollAttempts = useRef(0);

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [location, setLocation] = useState<LocationValue>({
    countryCode: "",
    region: "",
    city: "",
  });
  const [shippingAddress, setShippingAddress] = useState("");

  const applyOrder = useCallback((data: CheckoutOrderView) => {
    setOrder(data);
    setShippingName(data.shippingName ?? "");
    setShippingPhone(data.shippingPhone ?? "");
    setLocation({
      countryCode: data.shippingCountry ?? data.shippingCoverage.countryCode ?? "",
      region: data.shippingRegion ?? "",
      city: data.shippingCity ?? "",
    });
    setShippingAddress(data.shippingAddress ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CheckoutOrderView>(`/checkout/${token}`);
      applyOrder(data);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "No pudimos cargar este checkout.";
      setError(message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [token, applyOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tras volver de MP con success, re-consultar hasta que el webhook marque paid.
  useEffect(() => {
    if (returnStatus !== "success" || !order || isPaidStatus(order.status)) {
      setConfirming(false);
      return;
    }
    if (order.status !== "awaiting_payment" && order.status !== "confirmed") {
      return;
    }

    setConfirming(true);
    pollAttempts.current = 0;
    const timer = window.setInterval(() => {
      pollAttempts.current += 1;
      void (async () => {
        try {
          const data = await apiFetch<CheckoutOrderView>(`/checkout/${token}`);
          applyOrder(data);
          if (isPaidStatus(data.status) || pollAttempts.current >= 12) {
            window.clearInterval(timer);
            setConfirming(false);
          }
        } catch {
          if (pollAttempts.current >= 12) {
            window.clearInterval(timer);
            setConfirming(false);
          }
        }
      })();
    }, 2500);

    return () => window.clearInterval(timer);
  }, [returnStatus, order?.status, token, applyOrder]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!order || isPaidStatus(order.status)) {
      return;
    }
    if (!location.countryCode || !location.region.trim() || !location.city.trim()) {
      setError("Completa país, departamento y municipio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch<CheckoutPaymentStart>(`/checkout/${token}`, {
        method: "POST",
        body: JSON.stringify({
          shippingName,
          shippingPhone,
          shippingCountry: location.countryCode,
          shippingRegion: location.region,
          shippingCity: location.city,
          shippingAddress,
          confirmPayment: true,
        }),
      });
      applyOrder(data.order);
      window.location.assign(data.paymentUrl);
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "No pudimos iniciar el pago.";
      setError(message);
      setSubmitting(false);
    }
  }

  const canPay =
    Boolean(location.countryCode) &&
    Boolean(location.region.trim()) &&
    Boolean(location.city.trim());

  const paid = order ? isPaidStatus(order.status) : false;

  const returnBanner =
    returnStatus === "success" && !paid ? (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/80 p-8 text-center shadow-brand backdrop-blur-md">
        <Clock3 className="size-10 text-primary" aria-hidden />
        <p className="font-heading text-xl font-semibold">
          {confirming ? "Confirmando tu pago…" : "Pago recibido"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {confirming
            ? "Estamos esperando la confirmación de Mercado Pago. Esto puede tardar unos segundos."
            : "Si el cobro ya se acreditó, refresca en un momento o revisa el estado en WhatsApp."}
        </p>
        {confirming ? <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /> : null}
      </div>
    ) : returnStatus === "pending" && !paid ? (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/80 p-8 text-center shadow-brand backdrop-blur-md">
        <Clock3 className="size-10 text-primary" aria-hidden />
        <p className="font-heading text-xl font-semibold">Pago pendiente</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Mercado Pago está procesando tu pago. Te avisaremos por WhatsApp cuando se confirme.
        </p>
      </div>
    ) : returnStatus === "failure" && !paid ? (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/80 p-8 text-center shadow-brand backdrop-blur-md">
        <XCircle className="size-10 text-destructive" aria-hidden />
        <p className="font-heading text-xl font-semibold">Pago no completado</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Puedes corregir los datos e intentar de nuevo con el botón Pagar.
        </p>
      </div>
    ) : null;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden px-4 py-10 sm:px-6">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-112 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--brand-glow)_0%,transparent_70%)] opacity-35 blur-2xl"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-8">
        <BrandMark size="md" className="animate-rise self-center" />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Cargando pedido…
          </div>
        ) : error && !order ? (
          <div className="animate-rise rounded-2xl border border-border/80 bg-card/80 p-6 text-center shadow-brand backdrop-blur-md">
            <p className="font-heading text-xl font-semibold text-foreground">
              Checkout no disponible
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : order ? (
          <div className="animate-rise flex flex-col gap-6">
            <header className="space-y-1 text-center sm:text-left">
              <p className="text-sm text-muted-foreground">{order.companyName}</p>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Checkout · {order.number}
              </h1>
              <p className="text-sm text-muted-foreground">
                {paid
                  ? "Este pedido ya fue pagado."
                  : "Completa el envío y paga con Mercado Pago."}
              </p>
            </header>

            <section className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-brand backdrop-blur-md">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                <Package className="size-4 text-primary" aria-hidden />
                Resumen
              </div>
              <ul className="space-y-2 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {item.productName} ({item.variantName}) ×{item.quantity}
                    </span>
                    <span className="shrink-0 font-medium">
                      ${item.lineTotal.toFixed(2)} {order.currency}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between border-t border-border/70 pt-3 text-base font-semibold">
                <span>Total</span>
                <span>
                  ${order.total.toFixed(2)} {order.currency}
                </span>
              </div>
            </section>

            <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{order.shippingCoverage.summary}</span>
            </div>

            {paid ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/80 p-8 text-center shadow-brand backdrop-blur-md">
                <CheckCircle2 className="size-10 text-primary" aria-hidden />
                <p className="font-heading text-xl font-semibold">¡Pago confirmado!</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Tu pedido {order.number} quedó registrado. La tienda te contactará por WhatsApp
                  para el envío.
                </p>
              </div>
            ) : (
              <>
                {returnBanner}
                <form
                  onSubmit={onSubmit}
                  className="space-y-4 rounded-2xl border border-border/80 bg-card/80 p-5 shadow-brand backdrop-blur-md"
                >
                  <div className="space-y-2">
                    <Label htmlFor="shippingName">Nombre completo</Label>
                    <Input
                      id="shippingName"
                      value={shippingName}
                      onChange={(e) => setShippingName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingPhone">Teléfono</Label>
                    <Input
                      id="shippingPhone"
                      type="tel"
                      value={shippingPhone}
                      onChange={(e) => setShippingPhone(e.target.value)}
                      required
                      autoComplete="tel"
                    />
                  </div>

                  <LocationSelects
                    idPrefix="checkout"
                    variant="customer"
                    value={location}
                    required
                    onChange={setLocation}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="shippingAddress">Dirección</Label>
                    <Input
                      id="shippingAddress"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      required
                      autoComplete="street-address"
                    />
                  </div>

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  <Button type="submit" className="h-11 w-full" disabled={submitting || !canPay}>
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Abriendo Mercado Pago…
                      </>
                    ) : (
                      "Pagar con Mercado Pago"
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Serás redirigido a Checkout Pro de Mercado Pago de forma segura.
                  </p>
                </form>
              </>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
