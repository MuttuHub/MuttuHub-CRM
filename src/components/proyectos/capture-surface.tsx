// Superficie de captura móvil (S10 WU4, D2): por debajo de `md` el formulario de registro (avance,
// medición, beneficiarios, gasto) se abre en una hoja inferior con controles de 44 px; en escritorio
// se queda en línea, como hasta ahora. El mismo contenido se monta UNA sola vez (nunca duplicado en
// el DOM) porque lleva estado y ids propios; por eso se decide con `matchMedia` y no con clases CSS.

"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Debajo de `md` (768 px en Tailwind). */
export const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** `true` solo en teléfono. En el servidor y sin `matchMedia` (jsdom viejo) responde `false` (escritorio). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function CaptureSurface({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  if (!mobile) return <>{children}</>;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-[22px] pb-4">
        <SheetHeader className="pb-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="min-w-0 px-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
