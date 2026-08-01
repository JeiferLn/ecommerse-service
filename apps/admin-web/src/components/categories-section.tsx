"use client";

import { canManageCatalog } from "@commerce-ai/types";
import type { Category } from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export function CategoriesSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageCatalog(user.role));
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
    enabled: Boolean(user?.companyId),
  });

  const createMutation = useMutation({
    mutationFn: (categoryName: string) =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName }),
      }),
    onSuccess: () => {
      setName("");
      setMessage("Categoría creada");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo crear");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, categoryName }: { id: string; categoryName: string }) =>
      apiFetch<Category>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: categoryName }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setName("");
      setMessage("Categoría actualizada");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo actualizar");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<null>(`/categories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setMessage("Categoría eliminada");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo eliminar");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (editingId) {
      updateMutation.mutate({ id: editingId, categoryName: name });
      return;
    }
    createMutation.mutate(name);
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
  }

  if (!user?.companyId) {
    return <p className="text-sm text-muted-foreground">Selecciona una empresa para continuar.</p>;
  }

  return (
    <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold">Categorías</CardTitle>
        <CardDescription>
          Organiza tu catálogo. {canManage ? "Puedes crear y editar." : "Solo lectura."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <Label htmlFor="category-name">{editingId ? "Editar categoría" : "Nueva categoría"}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Calzado deportivo"
                disabled={createMutation.isPending || updateMutation.isPending}
              />
              <Button
                type="submit"
                disabled={
                  !name.trim() || createMutation.isPending || updateMutation.isPending
                }
              >
                {editingId
                  ? updateMutation.isPending
                    ? "Guardando…"
                    : "Guardar"
                  : createMutation.isPending
                    ? "Creando…"
                    : "Crear"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}

        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Cargando categorías…</p>}

        {!isLoading && categories && categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay categorías.</p>
        )}

        {!isLoading && categories && categories.length > 0 && (
          <ul className="flex flex-col gap-2">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{category.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{category.slug}</span>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(category)}
                    >
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la categoría “${category.name}”?`)) {
                          deleteMutation.mutate(category.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 aria-hidden />
                      Eliminar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
