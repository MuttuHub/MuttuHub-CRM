// Listado de proyectos v2 (unidad 1: lectura; unidad 2: alta). Tabla con
// código, proyecto, cliente, estado, responsable, fechas con duración en
// semanas y valor total, más el filtro por estado y el CTA de creación.
//
// Alcance de lectura (S2.6 pendiente): hoy solo ADMINISTRADOR y GERENCIA ven
// el portafolio; cualquier otro rol recibe una lista vacía. Por eso el estado
// vacío no afirma "no hay proyectos" cuando el rol puede ser la causa: el
// servidor es la autoridad del alcance y el cliente solo elige las palabras.
//
// Permisos en el cliente: el rol del usuario actual sale de `useCurrentUser`
// (GET /api/v1/auth/me, ya cacheado por el header); con él y con el predicado
// puro `canViewPortfolio` se decide únicamente QUÉ TEXTO mostrar, nunca el
// acceso a datos.

"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { ResponsableCell, ToneBadge } from "@/components/crm/shared";
import { ExpenseValidationQueue } from "@/components/proyectos/expense-validation-queue";
import { ProjectCreateDialog } from "@/components/proyectos/project-create-dialog";
import {
  ESTADO_PROYECTO_META,
  formatFechaCalendario,
} from "@/components/proyectos/project-display";
import { ProjectFichaDialog } from "@/components/proyectos/project-ficha-dialog";
import { useCurrentUser } from "@/hooks/kanban";
import { useProjects, type ProjectFilters, type ProjectListRow } from "@/hooks/projects";
import { canCreateProject, canManageProjects, canViewPortfolio } from "@/lib/permissions";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import type { EstadoProyecto } from "@prisma/client";

/** Orden de la lista del filtro: el mismo del enum `EstadoProyecto`. */
const ESTADOS: EstadoProyecto[] = [
  "PLANIFICACION",
  "BORRADOR",
  "EN_EJECUCION",
  "SUSPENDIDO",
  "CERRADO",
  "CANCELADO",
];

const SIN_DATO = "—";

function formatRango(inicio: string | null, fin: string | null): string {
  return `${formatFechaCalendario(inicio)} – ${formatFechaCalendario(fin)}`;
}

/** Los decimales llegan como string: `toCents` los pasa a centavos exactos. */
function formatValorTotal(value: string | null): string {
  return value === null ? SIN_DATO : formatCOP(toCents(value));
}

export function ProjectList() {
  const [estado, setEstado] = useState("");
  // El diálogo se monta solo al abrir: así no se piden catálogos al cargar.
  const [crearAbierto, setCrearAbierto] = useState(false);
  // La ficha del proyecto también se monta solo al abrir, con el id de la fila.
  const [fichaId, setFichaId] = useState<string | null>(null);
  // El filtro viaja como query param: estado vacío = sin filtro.
  const filters = useMemo<ProjectFilters>(() => (estado ? { estado } : {}), [estado]);
  const query = useProjects(filters);
  const userQuery = useCurrentUser();

  // Los 403 y los errores del servidor se avisan con toast, no con pantalla:
  // el listado no pierde su encabezado ni el filtro.
  useEffect(() => {
    if (!query.isError) return;
    toast.error(
      query.error instanceof Error
        ? query.error.message
        : "No pudimos cargar los proyectos. Inténtalo de nuevo.",
    );
  }, [query.isError, query.error]);

  const usuario = userQuery.data;
  // Mismo `puede_ver_tablero_gerencial: false` que hoy resuelve el servidor
  // (S0.7/S2.6 pendientes). Un falso negativo solo cambia el texto del estado
  // vacío, nunca el acceso: el alcance real lo aplica la API.
  const puedeVerPortafolio = usuario
    ? canViewPortfolio({ id: usuario.id, rol: usuario.rol, puede_ver_tablero_gerencial: false })
    : null;
  // Ocultar el CTA para quien no es ADMINISTRADOR/GERENCIA es solo UX: la
  // autoridad sigue siendo la API, que responde 403 a cualquier otro rol tanto
  // en la creación como en el listado de elegibles.
  const puedeCrear = usuario ? canCreateProject({ id: usuario.id, rol: usuario.rol }) : false;
  // La cola de gastos por validar es solo de gestores (la API responde 403 al resto).
  const puedeValidar = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;

  const proyectos = query.data?.proyectos ?? [];
  const total = proyectos.length;
  const conteo = query.isError ? SIN_DATO : query.data ? (total === 1 ? "1 proyecto" : `${total} proyectos`) : "…";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {puedeValidar && <ExpenseValidationQueue />}

      <section className="rounded-[22px] border border-ink-200 bg-panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 p-4 lg:p-5">
          {/* Barra de herramientas, no un segundo título: el h1 lo pone el shell. */}
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11.5px] font-bold text-ink-600">
            {conteo}
          </span>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              Estado
            </span>
            <Select
              value={estado}
              onValueChange={(value) => setEstado(value === "todos" ? "" : (value ?? ""))}
            >
              <SelectTrigger
                aria-label="Filtrar por estado"
                className="h-9 w-[190px] rounded-12 border-ink-200 bg-panel px-3 text-[13px]"
              >
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {ESTADOS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ESTADO_PROYECTO_META[value].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {puedeCrear && (
              <Button size="lg" className="rounded-12" onClick={() => setCrearAbierto(true)}>
                <Plus className="size-4" />
                Nuevo proyecto
              </Button>
            )}
          </div>
        </header>

        {query.isError ? null : query.isLoading ? (
          <ProjectTableSkeleton />
        ) : proyectos.length === 0 ? (
          <EmptyProjects estado={estado} puedeVerPortafolio={puedeVerPortafolio} />
        ) : (
          <ProjectTable proyectos={proyectos} onOpenFicha={setFichaId} />
        )}
      </section>

      {crearAbierto && (
        <ProjectCreateDialog open onOpenChange={setCrearAbierto} />
      )}

      {fichaId !== null && (
        <ProjectFichaDialog projectId={fichaId} onClose={() => setFichaId(null)} />
      )}
    </div>
  );
}

/* ── Tabla ─────────────────────────────────────────────────────────────── */

function ProjectTable({
  proyectos,
  onOpenFicha,
}: {
  proyectos: ProjectListRow[];
  onOpenFicha: (id: string) => void;
}) {
  return (
    <Table className="min-w-[1020px]">
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Proyecto</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead>Fechas</TableHead>
          <TableHead className="text-right">Valor total</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proyectos.map((proyecto) => (
          <TableRow key={proyecto.id}>
            <TableCell className="font-mono text-[12px] font-semibold text-ink-700 tabular-nums">
              {proyecto.codigo}
            </TableCell>
            <TableCell className="max-w-[320px]">
              <p className="truncate font-semibold text-ink-950">{proyecto.nombre}</p>
              {proyecto.lineas.length > 0 && (
                <p className="truncate text-[11.5px] text-ink-600">
                  {proyecto.lineas.map((linea) => linea.nombre).join(" · ")}
                </p>
              )}
            </TableCell>
            <TableCell className="text-[13px] text-ink-800">{proyecto.cliente.nombre}</TableCell>
            <TableCell>
              <ToneBadge
                tone={ESTADO_PROYECTO_META[proyecto.estado].tone}
                label={ESTADO_PROYECTO_META[proyecto.estado].label}
              />
            </TableCell>
            <TableCell>
              {proyecto.responsable ? (
                <ResponsableCell nombre={proyecto.responsable.nombre} />
              ) : (
                <span className="text-[12.5px] text-ink-500">Sin asignar</span>
              )}
            </TableCell>
            <TableCell className="font-mono text-[12px] text-ink-600 tabular-nums">
              {formatRango(proyecto.fecha_inicio, proyecto.fecha_fin)}
              {proyecto.duracion_semanas !== null && (
                <span className="ml-1.5 text-ink-500">{proyecto.duracion_semanas} sem.</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-[12.5px] font-medium text-ink-900 tabular-nums">
              {formatValorTotal(proyecto.valor_total)}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenFicha(proyecto.id)}
                className="h-8 rounded-11 border-ink-200 bg-panel px-3 text-[12px] font-semibold text-ink-700 hover:bg-ink-100"
              >
                <Eye className="size-3.5" strokeWidth={1.8} />
                Ver detalle
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProjectTableSkeleton() {
  return (
    <div className="space-y-3 p-4 lg:p-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

/* ── Estado vacío ──────────────────────────────────────────────────────── */

/**
 * Cuatro mensajes para cuatro causas: el rol (que hoy puede ser la causa real
 * del vacío — REQ-ACC-02), la espera del rol, el filtro activo y el portafolio
 * de verdad vacío. El eje de rol gana sobre el filtro: para quien no ve el
 * portafolio, un filtro activo NO es prueba de que existan proyectos en otros
 * estados, así que ese texto nunca aparece.
 */
function emptyCopy(
  estado: string,
  puedeVerPortafolio: boolean | null,
): { title: string; body: string } {
  if (puedeVerPortafolio === false) {
    return {
      title: "Aún no tienes proyectos visibles",
      body: estado
        ? "El filtro por estado sigue activo, pero tu rol no ve el portafolio completo: hoy lo ven administración y gerencia, y tu acceso puede llegar por membresía a un proyecto."
        : "Hoy el portafolio lo ven administración y gerencia; tu acceso puede llegar por membresía a un proyecto.",
    };
  }
  if (puedeVerPortafolio === null) {
    return {
      title: "No hay proyectos para mostrar",
      body: estado
        ? "El filtro por estado sigue activo, pero puede que todavía no exista ningún proyecto o que tu rol no vea el portafolio completo."
        : "Puede que todavía no exista ninguno o que tu rol no vea el portafolio completo.",
    };
  }
  if (estado) {
    return {
      title: "No encontramos proyectos con este estado",
      body: "Prueba con otro estado o vuelve a «Todos los estados» para ver el portafolio completo.",
    };
  }
  return {
    title: "Todavía no hay proyectos",
    body: "Cuando se registre el primer proyecto aparecerá en este listado.",
  };
}

function EmptyProjects({
  estado,
  puedeVerPortafolio,
}: {
  estado: string;
  puedeVerPortafolio: boolean | null;
}) {
  const { title, body } = emptyCopy(estado, puedeVerPortafolio);

  return (
    <div className="grid min-h-[300px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
          <FolderKanban className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{body}</p>
      </div>
    </div>
  );
}
