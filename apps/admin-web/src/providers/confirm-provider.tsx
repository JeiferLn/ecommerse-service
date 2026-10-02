"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : settle(false))}>
        {options ? (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base text-balance">{options.title}</DialogTitle>
              {options.description ? (
                <DialogDescription className="text-pretty">{options.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settle(false)}>
                {options.cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                type="button"
                variant={options.destructive ? "destructive" : "default"}
                autoFocus
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  }
  return confirm;
}
