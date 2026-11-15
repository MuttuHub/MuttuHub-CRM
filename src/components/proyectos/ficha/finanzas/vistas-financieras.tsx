// Finanzas › Resumen: el selector «Por actividad / Por rubro» de S10 (EV-06). «Por rubro» es la vista de
// siempre (la monta este archivo sin tocarla); «Por actividad» agrupa la misma hoja por objetivo y por
// «Gestión del proyecto». El selector es un grupo de radios nativo con su leyenda: se llega con el teclado y
// anuncia con `role="status"` la vista elegida, además del estado del propio radio.

"use client";

import { useId, useState } from "react";
import { PorActividad } from "@/components/proyectos/ficha/finanzas/por-actividad";
import { ProjectFinanciero } from "@/components/proyectos/project-financiero";
import { CAPTURE_CHOICE } from "@/components/proyectos/ui";
import type { ProjectListRow } from "@/hooks/projects";

type Vista = "rubro" | "actividad";

const OPCIONES: readonly { valor: Vista; etiqueta: string }[] = [
  { valor: "rubro", etiqueta: "Por rubro" },
  { valor: "actividad", etiqueta: "Por actividad" },
];

export function VistasFinancieras({
  proyecto,
  onVerActividades,
  onVerGastos,
}: {
  proyecto: ProjectListRow;
  /** «Ver actividades» del aviso de posible retraso: lo resuelve la ficha. */
  onVerActividades?: () => void;
  /** «Ver todos los gastos»: la ficha cambia al segmento Gastos. */
  onVerGastos?: () => void;
}) {
  const [vista, setVista] = useState<Vista>("rubro");
  const grupo = useId();

  return (
    <div data-testid="vistas-financieras" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[12px] text-ink-600">Vista de finanzas</legend>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {OPCIONES.map((opcion) => (
              <label key={opcion.valor} className={CAPTURE_CHOICE}>
                <input
                  type="radio"
                  name={grupo}
                  value={opcion.valor}
                  checked={vista === opcion.valor}
                  onChange={() => setVista(opcion.valor)}
                />
                {opcion.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
        {/* Anuncia la vista elegida al cambiarla: el radio solo dice su estado, no el nombre del panel. */}
        <p role="status" aria-live="polite" className="sr-only">
          {vista === "rubro" ? "Vista por rubro" : "Vista por actividad"}
        </p>
      </div>

      {vista === "rubro" ? (
        <ProjectFinanciero proyecto={proyecto} onVerActividades={onVerActividades} onVerGastos={onVerGastos} />
      ) : (
        <PorActividad proyecto={proyecto} />
      )}
    </div>
  );
}
