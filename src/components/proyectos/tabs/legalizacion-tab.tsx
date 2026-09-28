// proyecto-legalizacion-tab, Phase 4 (design.md "Component Structure",
// spec.md "Pestaña Legalización con libro y filtros" — RF-06): ledger tab —
// 3 KPI cards, filter chips (Todos/Sin soporte/Observados), a scrollable
// ledger table and the "Registrar gasto" CTA. Follows the exact
// `tabs/financiero-tab.tsx` pattern: "use client", no Dialog/Card wrapper
// (the workspace's `<Tabs>` already supplies the chrome), explicit
// loading/empty/populated states.
//
// D1 (design.md): this component computes ZERO legalization-state logic —
// `estado_legalizacion` is rendered verbatim from `useExpenses`' response.
// The only client-side math here is display-only (sum for the "Legalizado
// en el periodo" KPI, counts for the other two) — never a state decision.
//
// Copy taken verbatim from the v6 design handoff ("Web app views
// creation/design_handoff_muttu_hub_v6/Muttu Hub v6.dc.html", `legKpis`/
// `legF`/the ledger header row: Mes, Compr., Fecha, Rubro, Concepto,
// Tercero, Débito, Soporte, Anotación — rendered here as "Comprobante",
// "Valor", "Estado", "Observación" for full words instead of the design
// mock's abbreviations, matching this repo's own financiero-tab convention
// of spelling out table headers rather than truncating them).

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCOP, formatFecha } from "@/hooks/crm";
import { useExpenses, type EstadoLegalizacion, type Gasto } from "@/hooks/projects";
import { ExpenseDialog } from "@/components/proyectos/expense-dialog";

const ESTADO_LABEL: Record<EstadoLegalizacion, string> = {
  con_soporte: "Con soporte",
  falta_soporte: "Falta soporte",
  observado: "Observado",
};

// Same verde/amarillo/rojo -> Tailwind token family financiero-tab.tsx uses
// for its semáforo chip (bg-exito/bg-alerta/bg-destructivo).
const ESTADO_CHIP_BG: Record<EstadoLegalizacion, string> = {
  con_soporte: "bg-exito",
  falta_soporte: "bg-alerta",
  observado: "bg-destructivo",
};

type Filtro = "todos" | "falta_soporte" | "observado";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "falta_soporte", label: "Sin soporte" },
  { value: "observado", label: "Observados" },
];

function mesDeFecha(fecha: string): string {
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "—";
  const mes = date.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
  return mes.charAt(0).toUpperCase() + mes.slice(1);
}

function EstadoChip({ estado }: { estado: EstadoLegalizacion }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white",
        ESTADO_CHIP_BG[estado],
      )}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}

function GastoRow({ gasto }: { gasto: Gasto }) {
  return (
    <tr
      data-testid="legalizacion-row"
      data-observado={gasto.observado ? "true" : "false"}
      className={cn("border-b border-ink-100 last:border-0", gasto.observado && "bg-destructivo-bg")}
    >
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">{mesDeFecha(gasto.fecha_gasto)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">
        {gasto.numero_comprobante ?? "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">{formatFecha(gasto.fecha_gasto)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">{gasto.linea.rubro.nombre}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">{gasto.concepto}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-800">{gasto.tercero ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] font-medium tabular-nums text-ink-800">
        {formatCOP(Number(gasto.monto_cop))}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <EstadoChip estado={gasto.estado_legalizacion} />
      </td>
      <td className="px-3 py-2.5 text-[12.5px] text-ink-700">{gasto.observacion ?? "—"}</td>
    </tr>
  );
}

function RegistrarGastoButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <Button type="button" onClick={onClick} className="min-h-11 rounded-lg px-3 font-bold">
        <Plus className="size-4" strokeWidth={2.2} />
        Registrar gasto
      </Button>
    </div>
  );
}

export function LegalizacionTab({ projectId }: { projectId: string }) {
  const expensesQuery = useExpenses(projectId);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (expensesQuery.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }

  const gastos = expensesQuery.data?.gastos ?? [];
  const lineas = expensesQuery.data?.lineas ?? [];

  if (gastos.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <RegistrarGastoButton onClick={() => setDialogOpen(true)} />
        <p className="text-[12.5px] text-ink-600">Este proyecto no tiene gastos registrados todavía.</p>
        <ExpenseDialog projectId={projectId} lineas={lineas} open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    );
  }

  const totalLegalizado = gastos.reduce((sum, g) => sum + Number(g.monto_cop), 0);
  const conSoporte = gastos.filter((g) => g.estado_legalizacion === "con_soporte").length;
  const observados = gastos.filter((g) => g.observado).length;

  const filtrados = gastos.filter((g) => {
    if (filtro === "todos") return true;
    if (filtro === "falta_soporte") return g.estado_legalizacion === "falta_soporte";
    return g.observado;
  });

  return (
    <div className="flex flex-col gap-4">
      <RegistrarGastoButton onClick={() => setDialogOpen(true)} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div data-testid="legalizacion-kpi-card" className="rounded-14 border border-ink-200 bg-panel px-4 py-3">
          <p className="text-[18px] font-bold text-ink-950">{formatCOP(totalLegalizado)}</p>
          <p className="text-[12px] text-ink-600">Legalizado en el periodo</p>
        </div>
        <div data-testid="legalizacion-kpi-card" className="rounded-14 border border-ink-200 bg-panel px-4 py-3">
          <p className="text-[18px] font-bold text-exito">
            {conSoporte} de {gastos.length}
          </p>
          <p className="text-[12px] text-ink-600">Gastos con soporte</p>
        </div>
        <div data-testid="legalizacion-kpi-card" className="rounded-14 border border-ink-200 bg-panel px-4 py-3">
          <p className="text-[18px] font-bold text-destructivo">{observados}</p>
          <p className="text-[12px] text-ink-600">Gastos observados</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            data-testid={`legalizacion-filtro-${f.value}`}
            onClick={() => setFiltro(f.value)}
            className={cn(
              "min-h-11 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
              filtro === f.value
                ? "border-ink-950 bg-ink-950 text-white"
                : "border-ink-200 bg-panel text-ink-700",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div data-testid="legalizacion-tabla-scroll" className="overflow-x-auto rounded-14 border border-ink-200">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-600">
              <th className="px-3 py-2.5">Mes</th>
              <th className="px-3 py-2.5">Comprobante</th>
              <th className="px-3 py-2.5">Fecha</th>
              <th className="px-3 py-2.5">Rubro</th>
              <th className="px-3 py-2.5">Concepto</th>
              <th className="px-3 py-2.5">Tercero</th>
              <th className="px-3 py-2.5">Valor</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">Observación</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((gasto) => (
              <GastoRow key={gasto.id} gasto={gasto} />
            ))}
          </tbody>
        </table>
      </div>

      <ExpenseDialog projectId={projectId} lineas={lineas} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
