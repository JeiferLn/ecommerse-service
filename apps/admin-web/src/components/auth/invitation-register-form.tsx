"use client";

import type { InvitationInfo } from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import { useSession } from "@/providers/session-provider";

const invitationSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

type InvitationValues = z.infer<typeof invitationSchema>;

export function InvitationRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { refresh } = useSession();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const { data: invitation, isLoading, error: queryError } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => apiFetch<InvitationInfo>(`/auth/invitation?token=${token}`),
    enabled: Boolean(token),
  });

  const mutation = useMutation({
    mutationFn: (values: InvitationValues) =>
      apiFetch<SessionUser>("/auth/register-invited", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          password: values.password,
          token,
        }),
      }),
    onSuccess: async () => {
      await refresh();
      router.push("/dashboard");
      router.refresh();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Validando invitación…</p>;
  }

  if (!invitation) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">
          {queryError instanceof ApiClientError
            ? queryError.message
            : "Esta invitación no es válida o ya expiró."}
        </p>
        <Button variant="outline" asChild>
          <a href="/register">Crear mi propia empresa</a>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
    >
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        Te han invitado a unirte a <span className="font-medium text-foreground">{invitation.companyName}</span>.
        Tu cuenta se creará con el email <span className="font-medium text-foreground">{invitation.email}</span>.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Tu nombre</Label>
        <Input id="name" placeholder="Tu nombre" autoComplete="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          placeholder="Mínimo 8 caracteres"
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
          placeholder="Repite la contraseña"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiClientError
            ? mutation.error.message
            : "No se pudo conectar con el servidor"}
        </p>
      )}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creando cuenta…" : "Aceptar invitación e ingresar"}
      </Button>
    </form>
  );
}
