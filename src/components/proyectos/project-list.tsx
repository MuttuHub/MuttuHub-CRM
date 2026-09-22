// Listado de Proyectos (gestion-proyectos-workspace, Phase 2 — design.md T7,
// T9). Mirrors the visual/structural conventions of `client-list.tsx`
// (search input, filter selects, Table, PaginationFooter) but filters
// CLIENT-side: `GET /api/v1/projects` has no `q`/`estado`/`page` params
// (design T7) — volume is tens of rows, not worth a backend diff yet.
//
// Every write affordance is gated on the server-computed
// `puede_editar_proyecto` per row (never a locally re-derived role) — the
// "Nuevo proyecto" CTA is the only control gated on a client permission
// check (`canCreateProject`), because there is no row to compute it from.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LINEA_ESTRATEGICA_LABELS } from "@/lib/catalogs";
import { canCreateProject } from "@/lib/permissions";
import { useCurrentUser } from "@/hooks/kanban";
import { useProjects, type ProjectListRow } from "@/hooks/projects";
import type { EstadoProyecto } from "@prisma/client";

const ESTADO_PROYECTO_LABELS: Record<EstadoProyecto, string> = {
  PLANIFICACION: "Planificación",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
};

const PAGE_SIZE = 20;

/** Sentinel for "no filter" — base-ui's `Select` rejects an empty string
 * value, same workaround as `client-list.tsx`'s "todos" items. */
const TODOS = "todos";

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function ProjectList() {
  const projectsQuery = useProjects();
  const { data: currentUser } = useCurrentUser();

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(TODOS);
  const [lineaEstrategica, setLineaEstrategica] = useState(TODOS);
  const [cliente, setCliente] = useState(TODOS);
  const [responsable, setResponsable] = useState(TODOS);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const clientes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.cliente_nombre))).sort(),
    [rows],
  );
  const responsables = useMemo(
    () => Array.from(new Set(rows.map((r) => r.responsable_nombre))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (query && !`${r.codigo} ${r.nombre}`.toLowerCase().includes(query)) return false;
      if (estado !== TODOS && r.estado !== estado) return false;
      if (lineaEstrategica !== TODOS && r.linea_estrategica !== lineaEstrategica) return false;
      if (cliente !== TODOS && r.cliente_nombre !== cliente) return false;
      if (responsable !== TODOS && r.responsable_nombre !== responsable) return false;
      return true;
    });
  }, [rows, q, estado, lineaEstrategica, cliente, responsable]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const desde = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const canCreate = currentUser !== null && currentUser !== undefined && canCreateProject(currentUser);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[20px] font-bold text-ink-950">Proyectos</h2>
        </div>
        {canCreate && (
          <Button type="button" className="gap-1.5">
            <Plus className="size-4" strokeWidth={1.8} />
            Nuevo proyecto
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-[22px] border border-ink-200 bg-panel p-5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" strokeWidth={1.8} />
          <Input
            placeholder="Buscar por código o nombre…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select value={estado} onValueChange={(v) => { setEstado(v ?? TODOS); setPage(1); }}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ESTADO_PROYECTO_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lineaEstrategica} onValueChange={(v) => { setLineaEstrategica(v ?? TODOS); setPage(1); }}>
          <SelectTrigger className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda línea estratégica</SelectItem>
            {Object.entries(LINEA_ESTRATEGICA_LABELS).map(([value, entry]) => (
              <SelectItem key={value} value={value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cliente} onValueChange={(v) => { setCliente(v ?? TODOS); setPage(1); }}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los clientes</SelectItem>
            {clientes.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={responsable} onValueChange={(v) => { setResponsable(v ?? TODOS); setPage(1); }}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los responsables</SelectItem>
            {responsables.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[22px] border border-ink-200 bg-panel">
        {projectsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-12" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Línea estratégica</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Fechas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-ink-600">
                    No hay proyectos que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((row) => (
                <ProjectRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-5 py-3.5">
          <p className="text-[12.5px] text-ink-600">
            Mostrando <span className="font-semibold text-ink-900">{desde}–{hasta}</span> de{" "}
            <span className="font-semibold text-ink-900">{filtered.length}</span> proyectos
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ row }: { row: ProjectListRow }) {
  return (
    <TableRow>
      <TableCell className="font-semibold">{row.codigo}</TableCell>
      <TableCell>
        <Link href={`/proyectos/${row.id}`} className="hover:underline">
          {row.nombre}
        </Link>
      </TableCell>
      <TableCell>{row.cliente_nombre}</TableCell>
      <TableCell>{LINEA_ESTRATEGICA_LABELS[row.linea_estrategica].label}</TableCell>
      <TableCell>
        <Badge variant="secondary">{ESTADO_PROYECTO_LABELS[row.estado]}</Badge>
      </TableCell>
      <TableCell>{row.responsable_nombre}</TableCell>
      <TableCell>
        {formatFecha(row.fecha_inicio)} – {formatFecha(row.fecha_fin)}
      </TableCell>
      <TableCell className="text-right">
        {row.puede_editar_proyecto && (
          <Link
            href={`/proyectos/${row.id}`}
            data-action="edit"
            aria-label={`Editar ${row.codigo}`}
            className="inline-flex size-8 items-center justify-center rounded-10 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            <Pencil className="size-4" strokeWidth={1.8} />
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}
