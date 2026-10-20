// Selection fields shared by the creation form and the "Editar datos generales" dialog: the strategic lines
// (one of them principal) and the municipios. Presentational only: the caller owns the selection and the rules.

"use client";

import { HelpHint } from "@/components/ui/help-hint";
import { Checkbox } from "@/components/ui/checkbox";

export type OpcionCatalogo = { id: string; nombre: string };

export function CampoLineas({
  lineas,
  lineaIds,
  principalIds,
  onToggleLinea,
  onTogglePrincipal,
  invalid = false,
  describedBy,
}: {
  lineas: OpcionCatalogo[];
  lineaIds: string[];
  principalIds: string[];
  onToggleLinea: (id: string, incluida: boolean) => void;
  onTogglePrincipal: (id: string, principal: boolean) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-campo="lineas"
      tabIndex={-1}
    >
      <legend className="flex items-center gap-1 text-sm leading-none font-medium">
        <span>
          Líneas estratégicas <span className="text-rose-500 dark:text-rose-400">*</span>
        </span>
        <HelpHint label="Línea estratégica principal">
          Marca las líneas en las que trabaja el proyecto. Exactamente una debe ser la principal.
        </HelpHint>
      </legend>
      <p className="text-[12px] text-ink-600">Marca al menos una y exactamente una como principal.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {lineas.map((linea) => (
          <div
            key={linea.id}
            className="flex items-center justify-between gap-3 rounded-inner border border-border bg-panel px-3 py-2"
          >
            {/* The wrapping label makes the name clickable. base-ui would otherwise point aria-labelledby at it and
                double the accessible name, so `aria-labelledby=""` keeps the explicit aria-label as the name. */}
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              <Checkbox
                checked={lineaIds.includes(linea.id)}
                onCheckedChange={(checked) => onToggleLinea(linea.id, checked === true)}
                aria-labelledby=""
                aria-label={`Incluir ${linea.nombre}`}
              />
              <span className="truncate text-[13px] text-ink-800">{linea.nombre}</span>
            </label>
            <div className="flex shrink-0 items-center gap-1.5">
              <Checkbox
                checked={principalIds.includes(linea.id)}
                onCheckedChange={(checked) => onTogglePrincipal(linea.id, checked === true)}
                aria-label={`Principal ${linea.nombre}`}
              />
              <span className="text-[12px] text-ink-600">Principal</span>
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function CampoMunicipios({
  municipios,
  municipioIds,
  onToggle,
  invalid = false,
  describedBy,
}: {
  municipios: OpcionCatalogo[];
  municipioIds: string[];
  onToggle: (id: string, incluido: boolean) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-campo="municipios"
      tabIndex={-1}
    >
      <legend className="flex items-center gap-1 text-sm leading-none font-medium">
        <span>
          Municipios <span className="text-rose-500 dark:text-rose-400">*</span>
        </span>
        <HelpHint label="Municipios">
          Marca los municipios donde se ejecuta el proyecto. Debes elegir al menos uno.
        </HelpHint>
      </legend>
      {municipios.length === 0 ? (
        // Production shipped with an empty catalog: the fieldset rendered no
        // options and creation was impossible with no explanation. Name the
        // cause and where to fix it instead of leaving a dead control.
        <p
          role="alert"
          className="rounded-12 border border-alerta-border bg-alerta-bg px-3 py-2 text-[13px] text-alerta"
        >
          No hay municipios activos en el catálogo. Un administrador debe cargarlos en Administración → Catálogos
          antes de que se pueda crear un proyecto.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {municipios.map((municipio) => (
            <label key={municipio.id} className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={municipioIds.includes(municipio.id)}
                onCheckedChange={(checked) => onToggle(municipio.id, checked === true)}
                aria-labelledby=""
                aria-label={`Municipio ${municipio.nombre}`}
              />
              <span className="truncate text-[13px] text-ink-800">{municipio.nombre}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
