"use client";

import { COMPANY_TYPES, COMPANY_TYPE_LABELS, type CompanyType } from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { SessionUser } from "@/lib/session";
import { useSession } from "@/providers/session-provider";

const createCompanySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  companyType: z.enum(COMPANY_TYPES as [CompanyType, ...CompanyType[]], {
    message: "Selecciona el tipo de empresa",
  }),
});

type CreateCompanyValues = z.infer<typeof createCompanySchema>;

interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCompanyDialog({ open, onOpenChange }: CreateCompanyDialogProps) {
  const router = useRouter();
  const { refresh } = useSession();

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateCompanyValues>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: { name: "", companyType: undefined },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateCompanyValues) =>
      apiFetch<SessionUser>("/company", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      onOpenChange(false);
      reset();
      await refresh();
      router.push("/dashboard");
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear empresa</DialogTitle>
          <DialogDescription>
            Crea tu propia empresa y conviértete en su dueño.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="company-name">Nombre de la empresa</Label>
            <Input
              id="company-name"
              placeholder="Mi empresa"
              autoComplete="off"
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="company-type">Tipo de empresa</Label>
            <Select
              onValueChange={(value) => setValue("companyType", value as CompanyType)}
              aria-invalid={Boolean(errors.companyType)}
            >
              <SelectTrigger id="company-type" aria-label="Tipo de empresa">
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

          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof ApiClientError
                ? mutation.error.message
                : "No se pudo conectar con el servidor"}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
