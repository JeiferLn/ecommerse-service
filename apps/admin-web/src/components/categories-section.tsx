"use client";

import { canManageCatalog } from "@commerce-ai/types";
import type { Category } from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { useSession } from "@/providers/session-provider";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function CategoriesSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageCatalog(user.role));
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
    enabled: Boolean(user?.companyId),
  });
  const rowsStagger = useStaggerOnce(Boolean(categories?.length));

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["categories"] });

  const createMutation = useMutation({
    mutationFn: (categoryName: string) =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName }),
      }),
    onSuccess: () => {
      setName("");
      setMessage({ text: "Categoría creada" });
      invalidate();
    },
    onError: (error: unknown) =>
      setMessage({ text: errorMessage(error, "No se pudo crear"), error: true }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, categoryName }: { id: string; categoryName: string }) =>
      apiFetch<Category>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: categoryName }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setMessage({ text: "Categoría actualizada" });
      invalidate();
    },
    onError: (error: unknown) =>
      setMessage({ text: errorMessage(error, "No se pudo actualizar"), error: true }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setMessage({ text: "Categoría eliminada" });
      invalidate();
    },
    onError: (error: unknown) =>
      setMessage({ text: errorMessage(error, "No se pudo eliminar"), error: true }),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (name.trim()) {
      createMutation.mutate(name.trim());
    }
  }

  function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (editingId && editingName.trim()) {
      updateMutation.mutate({ id: editingId, categoryName: editingName.trim() });
    }
  }

  if (!user) {
    return <SkeletonRows rows={4} columns={3} className="max-w-3xl" />;
  }

  if (!user.companyId) {
    return <p className="text-sm text-muted-foreground">Selecciona una empresa para continuar.</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {canManage ? (
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nueva categoría, ej. Calzado deportivo"
            aria-label="Nombre de la nueva categoría"
            disabled={createMutation.isPending}
            className="h-9"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={!name.trim() || createMutation.isPending}
          >
            <Plus aria-hidden />
            {createMutation.isPending ? "Creando…" : "Crear"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Solo lectura.</p>
      )}

      {message ? (
        <p
          key={message.text}
          role="status"
          className={
            message.error
              ? "slide-up-in text-sm text-destructive"
              : "slide-up-in text-sm text-muted-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}

      {isLoading ? <SkeletonRows rows={4} columns={3} /> : null}

      {!isLoading && categories && categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Aún no hay categorías"
          description="Agrupan tus productos y ayudan al asistente a recomendar."
          className="rounded-lg border border-dashed border-border"
        />
      ) : null}

      {categories && categories.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Identificador</TableHead>
              {canManage ? <TableHead className="text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody className={rowsStagger}>
            {categories.map((category) => {
              const editing = editingId === category.id;
              return (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">
                    {editing ? (
                      <form id={`edit-${category.id}`} onSubmit={handleUpdate}>
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          aria-label="Nuevo nombre"
                          className="h-8"
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                        />
                      </form>
                    ) : (
                      category.name
                    )}
                  </TableCell>
                  <TableCell className="hidden font-data text-[13px] text-muted-foreground sm:table-cell">
                    {category.slug}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <Button
                            type="submit"
                            form={`edit-${category.id}`}
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Guardar"
                            disabled={!editingName.trim() || updateMutation.isPending}
                          >
                            <Check aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Cancelar"
                            onClick={() => setEditingId(null)}
                          >
                            <X aria-hidden />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${category.name}`}
                            onClick={() => {
                              setEditingId(category.id);
                              setEditingName(category.name);
                              setMessage(null);
                            }}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Eliminar ${category.name}`}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar la categoría “${category.name}”?`)) {
                                deleteMutation.mutate(category.id);
                              }
                            }}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
