// Create-project dialog (S2.4, unit 2). The form body lives in `project-create-form.tsx` (shared with
// the `/proyectos/nuevo` stepper page); this file only owns the dialog chrome and the success
// confirmation with the link to the new project's ficha.

"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectCreateForm, type CreatedProject } from "@/components/proyectos/project-create-form";

// Re-exported so existing imports of the date helpers keep working.
export { fechaDeHoy, fechaMasMeses, valorDesdeDecimal } from "@/components/proyectos/project-create-form";

export type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opportunity to preselect once the eligible list loads (the "Convertir en
   * proyecto" entry point on the won opportunity). The rest of the form and its
   * validation are unchanged; the user can still pick another one.
   */
  initialOportunidadId?: string;
};

export function ProjectCreateDialog({
  open,
  onOpenChange,
  initialOportunidadId,
}: ProjectCreateDialogProps) {
  // Proyecto recién creado: el diálogo pasa a una confirmación con el enlace a su ficha.
  const [creado, setCreado] = useState<CreatedProject | null>(null);

  function cambiarApertura(siguiente: boolean) {
    if (!siguiente) setCreado(null);
    onOpenChange(siguiente);
  }

  if (creado) {
    return (
      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="sm:max-w-[min(480px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Proyecto creado
            </DialogTitle>
            <DialogDescription>Quedó en borrador. Ábrelo para completar su ficha.</DialogDescription>
          </DialogHeader>
          <div
            role="status"
            className="flex items-start gap-2 rounded-12 border border-ink-200 bg-ink-050 px-4 py-3 text-[13px] text-ink-800"
          >
            <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p>
              Proyecto creado
              {creado.codigo && <span className="font-mono font-semibold"> {creado.codigo}</span>}
              {creado.nombre && <span> · {creado.nombre}</span>}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiarApertura(false)}>
              Listo
            </Button>
            <Link
              href={`/proyectos/${creado.id}`}
              onClick={() => cambiarApertura(false)}
              className={buttonVariants({ variant: "default" })}
            >
              Abrir proyecto
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(720px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Nuevo proyecto
          </DialogTitle>
          <DialogDescription>
            Desde una oportunidad ganada o como proyecto independiente. Queda en borrador.
          </DialogDescription>
        </DialogHeader>

        <ProjectCreateForm
          variant="dialog"
          initialOportunidadId={initialOportunidadId}
          onCreated={setCreado}
          onCreatedWithoutId={() => onOpenChange(false)}
          onCancel={() => cambiarApertura(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
