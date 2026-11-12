// «Corregir gasto» (S2/T6): el mismo `GastoForm` en modo corrección, abierto desde la lista de gastos. La API
// manda: el autor corrige su propio gasto y el Gestor (ADMINISTRADOR/GERENCIA) el de otra persona, y solo entonces
// el motivo es obligatorio. Los soportes no forman parte de una corrección.

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GastoForm } from "@/components/proyectos/gasto-form";
import type { ProjectBudgetRubro, ProjectExpense, ProjectListRow } from "@/hooks/projects";

export function EditarGastoDialog({
  proyecto,
  gasto,
  rubros,
  open,
  onOpenChange,
}: {
  proyecto: ProjectListRow;
  gasto: ProjectExpense;
  rubros: ProjectBudgetRubro[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(640px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Corregir gasto
          </DialogTitle>
          <DialogDescription>
            {`${gasto.numero_documento} · ${gasto.tercero_nombre}. Los soportes no cambian aquí.`}
          </DialogDescription>
        </DialogHeader>
        {/* Montado solo mientras está abierto: cada apertura parte de los valores actuales de la fila. */}
        {open && <GastoForm proyecto={proyecto} rubros={rubros} gasto={gasto} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
