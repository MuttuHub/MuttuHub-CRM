"use client";

// Selector de municipios en dos niveles (2026-10-19): primero el departamento y después el municipio de
// ese departamento. El catálogo tiene los 1122 municipios de Colombia, así que una lista plana es
// inmanejable; 33 departamentos y, como máximo, 125 municipios por departamento sí se recorren.
//
// Se usa en el paso General del asistente, en el diálogo de edición de datos generales (selección
// múltiple, con chips) y en el filtro del portafolio (selección única). No conoce la API: recibe el
// catálogo y la selección, y devuelve cada cambio por `onToggle`.

import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MunicipioOpcion = {
  id: string;
  nombre: string;
  departamento?: string | null;
};

const SIN_DEPARTAMENTO = "Sin departamento";

export function MunicipioPicker({
  municipios,
  seleccionados,
  onToggle,
  multiple = true,
  invalid = false,
  describedBy,
}: {
  municipios: readonly MunicipioOpcion[];
  seleccionados: readonly string[];
  onToggle: (id: string, incluido: boolean) => void;
  multiple?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [departamento, setDepartamento] = useState<string>("");
  const [municipioId, setMunicipioId] = useState<string>("");
  const baseId = useId();

  const departamentos = useMemo(() => {
    const set = new Set<string>();
    for (const municipio of municipios) set.add(municipio.departamento ?? SIN_DEPARTAMENTO);
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [municipios]);

  const delDepartamento = useMemo(() => {
    if (!departamento) return [];
    return municipios
      .filter((municipio) => (municipio.departamento ?? SIN_DEPARTAMENTO) === departamento)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [municipios, departamento]);

  const elegidos = useMemo(
    () => municipios.filter((municipio) => seleccionados.includes(municipio.id)),
    [municipios, seleccionados],
  );

  function elegir(id: string) {
    if (id === "") return;
    if (multiple) {
      if (!seleccionados.includes(id)) onToggle(id, true);
    } else {
      onToggle(id, true);
    }
    setMunicipioId("");
  }

  return (
    <div className="flex flex-col gap-2">
      {multiple && elegidos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Municipios seleccionados">
          {elegidos.map((municipio) => (
            <li key={municipio.id}>
              <button
                type="button"
                onClick={() => onToggle(municipio.id, false)}
                aria-label={`Quitar ${municipio.nombre}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-100 px-2.5 py-1 text-[12.5px] text-ink-800 hover:bg-ink-200"
              >
                {municipio.nombre}
                <X className="size-3" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={departamento}
          onValueChange={(siguiente) => {
            setDepartamento(siguiente ?? "");
            setMunicipioId("");
          }}
        >
          <SelectTrigger
            id={`${baseId}-departamento`}
            size="sm"
            aria-label="Departamento"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="w-full px-3 text-base md:text-[13px]"
          >
            <SelectValue placeholder="Selecciona el departamento" />
          </SelectTrigger>
          <SelectContent>
            {departamentos.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={municipioId} onValueChange={(siguiente) => elegir(siguiente ?? "")}>
          <SelectTrigger
            id={`${baseId}-municipio`}
            size="sm"
            aria-label="Municipio"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={departamento === ""}
            className="w-full px-3 text-base md:text-[13px]"
          >
            <SelectValue
              placeholder={departamento === "" ? "Primero elige el departamento" : "Selecciona el municipio"}
            />
          </SelectTrigger>
          <SelectContent>
            {delDepartamento.map((municipio) => (
              <SelectItem key={municipio.id} value={municipio.id}>
                {municipio.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
