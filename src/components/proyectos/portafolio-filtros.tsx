"use client";

// Carril Y · Y1 (RF-31): barra de filtros del portafolio. Es un componente controlado: recibe el set
// completo (`ProjectFilters`) y lo devuelve entero en cada cambio, omitiendo las claves vacías para que
// la clave de cache del listado solo cambie cuando cambia un filtro de verdad. Los catálogos salen de
// los hooks existentes (clientes, líneas, municipios y usuarios) y solo se piden al montar la barra.
// En móvil los filtros viven en un plegable «Filtros (n)»; de `sm` en adelante están a la vista.

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display";
import { MunicipioPicker } from "@/components/proyectos/municipio-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClientOptions } from "@/hooks/kanban";
import { useMunicipalities, useStrategicLines, type ProjectFilters } from "@/hooks/projects";
import { useUsers } from "@/hooks/crm";
import { cn } from "@/lib/utils";
import type { EstadoProyecto } from "@prisma/client";

/** Mismo orden que el enum `EstadoProyecto` (lo comparte el listado). */
const ESTADOS: EstadoProyecto[] = [
  "PLANIFICACION",
  "BORRADOR",
  "EN_EJECUCION",
  "SUSPENDIDO",
  "CERRADO",
  "CANCELADO",
];

/** Valor centinela del «sin filtro»: `Select` necesita un string, el filtro viaja sin la clave. */
const TODOS = "todos";

/** Cuántos filtros están activos; decide el «Limpiar filtros» y el conteo del plegable. */
export function contarFiltros(filtros: ProjectFilters): number {
  return [
    filtros.estado,
    filtros.cliente_id,
    filtros.linea_id,
    filtros.municipio_id,
    filtros.responsable_id,
  ].filter(Boolean).length;
}

type Opcion = { value: string; label: string };

/** Un filtro: rótulo accesible, placeholder que hace de «todos» y las opciones del catálogo. */
function FiltroSelect({
  nombre,
  placeholder,
  value,
  options,
  onChange,
  className,
}: {
  nombre: string;
  placeholder: string;
  value: string;
  options: readonly Opcion[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(siguiente) => onChange(siguiente === TODOS ? "" : (siguiente ?? ""))}>
      <SelectTrigger
        size="sm"
        aria-label={`Filtrar por ${nombre}`}
        className={cn("w-full px-3 text-base md:text-[13px] sm:w-auto", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{placeholder}</SelectItem>
        {options.map((opcion) => (
          <SelectItem key={opcion.value} value={opcion.value}>
            {opcion.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


/**
 * Filtro de municipio con búsqueda. El catálogo de Colombia tiene 1122 filas, así que un Select con una
 * opción por municipio abre una lista inmanejable; este popover reutiliza el buscador del asistente.
 */
function FiltroMunicipio({
  municipios,
  value,
  onChange,
  className,
}: {
  municipios: readonly { id: string; nombre: string; departamento?: string | null }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = municipios.find((municipio) => municipio.id === value)?.nombre;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Filtrar por municipio"
            className={cn("w-full justify-start px-3 text-base md:text-[13px] sm:w-auto", className)}
          >
            {actual ?? "Todos los municipios"}
          </Button>
        }
      />
      <PopoverContent className="w-72 p-3">
        <MunicipioPicker
          municipios={municipios}
          seleccionados={value ? [value] : []}
          multiple={false}
          onToggle={(id, incluido) => {
            onChange(incluido ? id : "");
            setAbierto(false);
          }}
        />
        {value !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              onChange("");
              setAbierto(false);
            }}
          >
            <X className="size-3.5" strokeWidth={2} />
            Quitar filtro de municipio
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PortafolioFiltros({
  filtros,
  onChange,
}: {
  filtros: ProjectFilters;
  onChange: (filtros: ProjectFilters) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const clientes = useClientOptions();
  const lineas = useStrategicLines();
  const municipios = useMunicipalities();
  const usuarios = useUsers();

  const activos = contarFiltros(filtros);
  const cambiar = (clave: keyof ProjectFilters) => (valor: string) => {
    const siguiente: ProjectFilters = { ...filtros };
    if (valor) siguiente[clave] = valor;
    else delete siguiente[clave];
    onChange(siguiente);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sm:hidden"
        aria-expanded={abierto}
        aria-controls="portafolio-filtros"
        onClick={() => setAbierto((abierto) => !abierto)}
      >
        <SlidersHorizontal className="size-3.5" strokeWidth={2} />
        {activos > 0 ? `Filtros (${activos})` : "Filtros"}
      </Button>

      <div
        id="portafolio-filtros"
        className={cn(
          "w-full grid-cols-1 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap",
          abierto ? "grid" : "hidden sm:flex",
        )}
      >
        <FiltroSelect
          nombre="estado"
          placeholder="Todos los estados"
          value={filtros.estado ?? ""}
          options={ESTADOS.map((estado) => ({
            value: estado,
            label: ESTADO_PROYECTO_META[estado].label,
          }))}
          onChange={cambiar("estado")}
          className="sm:w-[190px]"
        />
        <FiltroSelect
          nombre="cliente"
          placeholder="Todos los clientes"
          value={filtros.cliente_id ?? ""}
          options={(clientes.data ?? []).map((cliente) => ({ value: cliente.id, label: cliente.nombre }))}
          onChange={cambiar("cliente_id")}
          className="sm:w-[220px]"
        />
        <FiltroSelect
          nombre="línea estratégica"
          placeholder="Todas las líneas"
          value={filtros.linea_id ?? ""}
          options={(lineas.data ?? []).map((linea) => ({ value: linea.id, label: linea.nombre }))}
          onChange={cambiar("linea_id")}
          className="sm:w-[190px]"
        />
        <FiltroMunicipio
          municipios={municipios.data ?? []}
          value={filtros.municipio_id ?? ""}
          onChange={cambiar("municipio_id")}
          className="sm:w-[190px]"
        />
        <FiltroSelect
          nombre="responsable"
          placeholder="Todos los responsables"
          value={filtros.responsable_id ?? ""}
          options={(usuarios.data ?? []).map((usuario) => ({ value: usuario.id, label: usuario.nombre }))}
          onChange={cambiar("responsable_id")}
          className="sm:w-[190px]"
        />
        {activos > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => onChange({})}
          >
            <X className="size-3.5" strokeWidth={2} />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
