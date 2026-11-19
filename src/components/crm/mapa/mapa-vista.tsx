"use client";

// V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8): the «Mapa» section, the UI half
// of `GET /api/v1/clients/map`. Mirrors the v7 prototype: a grid of departamento tiles (code, name,
// count, heat by color-mix of the brand token), a side panel for the selected departamento (stats
// and its aliados) and, apart, the aliados «sin departamento». The server counts only clients that
// carry a departamento and never places one from its free-text ubicación; nothing is recomputed
// here. Filters use the clients list's own params (estado, responsable), so visibility is the
// list's: reads are global (PR 3).

import { useState } from "react";
import Link from "next/link";
import type { EstadoCliente } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ENUM_VALUES, ESTADO_CLIENTE_LABELS } from "@/lib/catalogs";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  useMapaAliados,
  useUsers,
  type MapaCliente,
  type MapaDepartamento,
  type MapaFilters,
} from "@/hooks/crm";

const ERROR_MESSAGE = "No pudimos cargar el mapa de aliados. Inténtalo de nuevo.";
const TODOS = "todos";

/**
 * Heat of a tile, 0..100: 0 for an empty departamento, otherwise a floor of 18 so a single aliado
 * is still visible, growing linearly to 100 at the busiest departamento.
 */
export function intensidadCalor(aliados: number, max: number): number {
  if (aliados <= 0 || max <= 0) return 0;
  return Math.round(18 + (82 * aliados) / max);
}

function aliadosTexto(n: number): string {
  return `${n} ${n === 1 ? "aliado" : "aliados"}`;
}

/** The departamento shown first: the busiest one (catalogue order breaks ties). */
function departamentoInicial(departamentos: MapaDepartamento[]): string | null {
  let mejor: MapaDepartamento | null = null;
  for (const d of departamentos) if (!mejor || d.aliados > mejor.aliados) mejor = d;
  return mejor?.departamento ?? null;
}

export function MapaVista() {
  const [filters, setFilters] = useState<MapaFilters>({});
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const query = useMapaAliados(filters);
  const users = useUsers().data ?? [];
  const data = query.data;

  function setFiltro(key: keyof MapaFilters, value: string | null) {
    setFilters((f) => {
      const next = { ...f };
      if (!value || value === TODOS) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const filtros = (
    <div className="flex flex-wrap items-end gap-3" aria-label="Filtros del mapa" role="group">
      <div className="flex w-48 flex-col gap-1.5">
        <Label id="mapa-filtro-estado">Estado</Label>
        <Select value={filters.estado ?? TODOS} onValueChange={(v) => setFiltro("estado", v)}>
          <SelectTrigger aria-labelledby="mapa-filtro-estado" className="w-full px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {(ENUM_VALUES.EstadoCliente as readonly EstadoCliente[]).map((e) => (
              <SelectItem key={e} value={e}>
                {ESTADO_CLIENTE_LABELS[e].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-56 flex-col gap-1.5">
        <Label id="mapa-filtro-responsable">Responsable</Label>
        <Select value={filters.responsable ?? TODOS} onValueChange={(v) => setFiltro("responsable", v)}>
          <SelectTrigger aria-labelledby="mapa-filtro-responsable" className="w-full px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los responsables</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {filtros}
        <div role="status" aria-label="Cargando mapa de aliados" className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-inner" />
          <Skeleton className="h-24 w-full rounded-inner" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {filtros}
        <div
          role="alert"
          className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          {ERROR_MESSAGE}
        </div>
      </div>
    );
  }

  if (!data || (data.departamentos.length === 0 && data.total === 0)) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {filtros}
        <div className="surface p-2">
          <EmptyState
            title="Aún no hay departamentos en el catálogo"
            description="Los departamentos salen del catálogo de municipios (Administración). Cuando existan y los aliados tengan uno asignado, aquí aparecerá la cobertura."
          />
        </div>
      </div>
    );
  }

  const elegido =
    data.departamentos.find((d) => d.departamento === seleccion) ??
    data.departamentos.find((d) => d.departamento === departamentoInicial(data.departamentos)) ??
    null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {filtros}

      <p className="text-[12.5px] text-ink-600">
        <span className="font-semibold text-ink-950 tabular-nums">{data.con_departamento}</span> de{" "}
        <span className="tabular-nums">{data.total}</span> aliados tienen departamento. Los demás se
        listan aparte: el mapa no los ubica a partir del texto libre de la ubicación.
      </p>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <section aria-labelledby="mapa-cobertura" className="surface flex min-w-0 flex-col gap-3 p-4 lg:p-5">
          <h2 id="mapa-cobertura" className="font-display text-[15px] font-bold text-ink-950">
            Cobertura por departamento
          </h2>
          {data.departamentos.length === 0 ? (
            <p className="text-[13px] text-ink-600">
              El catálogo de municipios todavía no tiene departamentos.
            </p>
          ) : (
            <div
              role="group"
              aria-label="Departamentos"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
            >
              {data.departamentos.map((d) => (
                <DepartamentoTile
                  key={d.departamento}
                  departamento={d}
                  max={data.max_aliados}
                  activo={elegido?.departamento === d.departamento}
                  onSelect={() => setSeleccion(d.departamento)}
                />
              ))}
            </div>
          )}
        </section>

        {elegido && <PanelDepartamento departamento={elegido} />}
      </div>

      <section aria-labelledby="mapa-sin-departamento" className="surface flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mapa-sin-departamento" className="font-display text-[15px] font-bold text-ink-950">
            Sin departamento
          </h2>
          <span className="font-display text-[18px] font-bold text-ink-950 tabular-nums">
            {data.sin_departamento.aliados}
          </span>
        </div>
        <p className="text-[12.5px] text-ink-600">
          Aliados sin departamento asignado. Asígnalo desde su ficha para que cuenten en el mapa.
        </p>
        <ListaAliados
          clientes={data.sin_departamento.clientes}
          vacio="Todos los aliados con estos filtros tienen departamento."
          mostrarUbicacion
        />
      </section>
    </div>
  );
}

function DepartamentoTile({
  departamento,
  max,
  activo,
  onSelect,
}: {
  departamento: MapaDepartamento;
  max: number;
  activo: boolean;
  onSelect: () => void;
}) {
  const calor = intensidadCalor(departamento.aliados, max);
  const oscuro = calor >= 60;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={activo}
      aria-label={`${departamento.departamento}: ${aliadosTexto(departamento.aliados)}`}
      style={{
        backgroundColor: `color-mix(in srgb, var(--accent-brand) ${calor}%, var(--panel))`,
      }}
      className={cn(
        "flex min-h-[84px] min-w-0 flex-col justify-between gap-1 rounded-12 border p-3 text-left transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        activo ? "border-ink-950 shadow-sm" : "border-ink-200 hover:border-ink-400",
        oscuro ? "text-white" : "text-ink-950",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("text-[11px] font-semibold tabular-nums", oscuro ? "text-white/80" : "text-ink-500")}>
          {departamento.codigo ?? ""}
        </span>
        <span className="font-display text-[20px] leading-none font-bold tabular-nums">
          {departamento.aliados}
        </span>
      </span>
      <span className="truncate text-[12.5px] font-semibold">{departamento.departamento}</span>
    </button>
  );
}

function PanelDepartamento({ departamento }: { departamento: MapaDepartamento }) {
  const tituloId = "mapa-panel-titulo";
  return (
    <section aria-labelledby={tituloId} className="surface flex min-w-0 flex-col gap-3 p-4">
      <h2 id={tituloId} className="font-display text-[15px] font-bold text-ink-950">
        {departamento.departamento}
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        <div className="surface-inner flex flex-col gap-1 p-3">
          <dt className="text-[12px] font-medium text-ink-600">Aliados</dt>
          <dd className="font-display text-[22px] font-bold text-ink-950 tabular-nums">{departamento.aliados}</dd>
        </div>
        <div className="surface-inner flex flex-col gap-1 p-3">
          <dt className="text-[12px] font-medium text-ink-600">Proyectos</dt>
          <dd className="font-display text-[22px] font-bold text-ink-950 tabular-nums">{departamento.proyectos}</dd>
        </div>
      </dl>
      <ListaAliados
        clientes={departamento.clientes}
        vacio="Ningún aliado de este departamento con los filtros actuales."
      />
    </section>
  );
}

function ListaAliados({
  clientes,
  vacio,
  mostrarUbicacion = false,
}: {
  clientes: MapaCliente[];
  vacio: string;
  mostrarUbicacion?: boolean;
}) {
  if (clientes.length === 0) return <p className="text-[13px] text-ink-600">{vacio}</p>;
  return (
    <ul className="flex min-w-0 flex-col gap-2">
      {clientes.map((c) => {
        const estado = ESTADO_CLIENTE_LABELS[c.estado];
        return (
          <li key={c.id} className="min-w-0">
            <Link
              href={`/clientes?cliente=${c.id}`}
              className="surface-inner flex min-w-0 flex-col gap-1 p-3 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-[13.5px] font-semibold text-ink-950">{c.nombre}</span>
                <StatusChip tone={estado.tone}>{estado.label}</StatusChip>
              </span>
              <span className="truncate text-[12px] text-ink-600">
                {c.responsable_nombre} · {c.proyectos} {c.proyectos === 1 ? "proyecto" : "proyectos"}
                {mostrarUbicacion && c.ubicacion ? ` · ${c.ubicacion}` : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
