// «Registrar gasto» dialog of the ficha header (T9 / S9): the same `GastoForm` as Finanzas › Gastos, on top of
// any tab without switching it. The expense is registered «por validar»; the API stays the authority.

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { GastoForm } from "@/components/proyectos/gasto-form";
import { InlineError } from "@/components/proyectos/ui";
import { useProjectBudget, type ProjectListRow } from "@/hooks/projects";

export function RegistrarGastoDialog({
  proyecto,
  open,
  onOpenChange,
}: {
  proyecto: ProjectListRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(640px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Registrar gasto
          </DialogTitle>
          <DialogDescription>{`${proyecto.codigo} · cuenta como ejecutado al registrarlo.`}</DialogDescription>
        </DialogHeader>
        {/* Mounted (and fetching the budget) only while open: every opening starts with an empty form. */}
        {open && <Formulario proyecto={proyecto} onCerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ proyecto, onCerrar }: { proyecto: ProjectListRow; onCerrar: () => void }) {
  const budgetQuery = useProjectBudget(proyecto.id);
  // A failed read is said (T12): an empty list would claim the project has no rubros. When the budget was
  // already read, a later failed refresh keeps that form and only adds the message.
  const error = budgetQuery.isError ? (
    <InlineError message={errorMessage(budgetQuery.error, "No pudimos cargar el presupuesto. Inténtalo de nuevo.")} />
  ) : null;
  if (!budgetQuery.data) {
    // Wait for the rubros: an empty list would show «no hay rubros» for a moment.
    return error ?? <Skeleton className="h-40 w-full rounded-[12px]" />;
  }
  return (
    <>
      {error}
      <GastoForm proyecto={proyecto} rubros={budgetQuery.data.rubros} onDone={onCerrar} />
    </>
  );
}
