"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";

const forgotPasswordSchema = z.object({
  email: z.string().email("Ingresa un email válido"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordValues) =>
      apiFetch<null>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
    >
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

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiClientError
            ? mutation.error.message
            : "No se pudo conectar con el servidor"}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Enviando…" : "Enviar enlace de recuperación"}
      </Button>
    </form>
  );
}
