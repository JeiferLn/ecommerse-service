"use client";

import type { Category } from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

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

const CATEGORIES_KEY = ["categories"];

interface CategoryPickerProps {
  value: string;
  onChange: (categoryId: string) => void;
  enabled: boolean;
  disabled?: boolean;
  canCreate?: boolean;
}

export function CategoryPicker({
  value,
  onChange,
  enabled,
  disabled = false,
  canCreate = false,
}: CategoryPickerProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const { data: categories } = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => apiFetch<Category[]>("/categories"),
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: (categoryName: string) =>
      apiFetch<Category>("/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName }),
      }),
    onSuccess: (created) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_KEY, (current) =>
        [...(current ?? []), created].sort((a, b) => a.name.localeCompare(b.name, "es")),
      );
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      onChange(created.id);
      closeCreator();
    },
  });

  function closeCreator() {
    setCreating(false);
    setName("");
    createMutation.reset();
  }

  const validName = name.trim().length >= 2;

  function submit() {
    const trimmed = name.trim();
    if (validName && !createMutation.isPending) {
      createMutation.mutate(trimmed);
    }
  }

  // Vive dentro del <form> del producto: Enter no debe enviarlo.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeCreator();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={creating ? "new-category-name" : undefined}>Categoría</Label>
        {canCreate && !disabled && !creating ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Nueva
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              id="new-category-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej. Calzado deportivo"
              maxLength={100}
              disabled={createMutation.isPending}
              aria-invalid={createMutation.isError || undefined}
              className="h-8"
            />
            <Button
              type="button"
              size="icon-sm"
              aria-label="Crear categoría"
              disabled={!validName || createMutation.isPending}
              onClick={submit}
            >
              <Check aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancelar"
              disabled={createMutation.isPending}
              onClick={closeCreator}
            >
              <X aria-hidden />
            </Button>
          </div>
          <p
            role={createMutation.isError ? "alert" : undefined}
            className={
              createMutation.isError ? "text-xs text-destructive" : "text-xs text-muted-foreground"
            }
          >
            {createMutation.isError
              ? createMutation.error instanceof ApiClientError
                ? createMutation.error.message
                : "No se pudo crear la categoría"
              : "Se crea y queda seleccionada para este producto."}
          </p>
        </div>
      ) : (
        <Select
          value={value || "none"}
          onValueChange={(next) => onChange(next === "none" ? "" : next)}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Categoría" className="w-full">
            <SelectValue placeholder="Sin categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin categoría</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
