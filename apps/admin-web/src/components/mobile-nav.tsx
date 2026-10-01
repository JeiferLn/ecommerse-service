"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { AdminNav } from "@/components/admin-sidebar";
import { CompanyNav } from "@/components/company-sidebar";
import { CompanySwitcher } from "@/components/company-switcher";
import { OnboardingSummary } from "@/components/onboarding-checklist";
import { Button } from "@/components/ui/button";
import { useSession } from "@/providers/session-provider";

/** Menú lateral deslizable para pantallas sin sidebar fijo. */
export function MobileNav() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  if (!user) {
    return null;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menú">
          <Menu className="size-5" aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 duration-220 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto border-r border-border bg-background p-3 shadow-lg duration-220 ease-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <div className="flex items-center justify-between px-1">
            <DialogPrimitive.Title className="text-sm font-semibold">Menú</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar menú">
                <X className="size-4" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Secciones del panel
          </DialogPrimitive.Description>
          {user.role === "admin" ? (
            <AdminNav onNavigate={close} />
          ) : (
            <>
              <div className="sm:hidden">
                <CompanySwitcher />
              </div>
              <CompanyNav onNavigate={close} />
              <div className="mt-auto border-t border-border pt-3">
                <OnboardingSummary onNavigate={close} />
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
