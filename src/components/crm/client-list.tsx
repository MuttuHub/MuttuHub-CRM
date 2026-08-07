// Listado de clientes (PRD §4.5 / §4.6): búsqueda con debounce (350 ms),
// filtros combinables, vistas guardadas en localStorage, exportación Excel
// con los filtros activos, PDF (página de impresión dedicada) y apertura de
// la ficha en panel lateral con `?cliente=<id>` para deep-link/reanudar.
//
// Permisos (v1): los controles se muestran para cualquier rol; el servidor
// aplica el alcance (COLABORADOR) y los 403 llegan como toasts.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  RotateCcw,
  Search,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ENUM_VALUES,
  ESTADO_CLIENTE_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import type { EstadoCliente, PrioridadCliente, TipoCliente } from "@prisma/client";
import {
  esVencida,
  formatCOP,
  formatFecha,
  useClients,
  useUsers,
  type ClientFilters,
  type ClientListResponse,
  type ClientListRow,
} from "@/hooks/crm";
import {
  InitialsAvatar,
  PrioridadChip,
  ResponsableCell,
  ToneBadge,
} from "@/components/crm/shared";
import { NewClientButton } from "@/components/crm/client-form";
import {
  SavedViewsMenu,
  filtersEmpty,
  snapshotFilters,
} from "@/components/crm/saved-views";
import { ClientSheet } from "@/components/crm/client-sheet";

const PAGE_SIZE = 25;

type LocalFilters = {
  q: string;
  tipo: string;
  estado: string;
  prioridad: string;
  responsable: string;
  desde: string;
  hasta: string;
  valorMin: string;
  valorMax: string;
};

const EMPTY_LOCAL: LocalFilters = {
  q: "",
  tipo: "",
  estado: "",
  prioridad: "",
  responsable: "",
  desde: "",
  hasta: "",
  valorMin: "",
  valorMax: "",
};

function toFilters(local: LocalFilters): ClientFilters {
  const out: ClientFilters = {};
  if (local.q.trim()) out.q = local.q.trim();
  if (local.tipo) out.tipo = local.tipo;
  if (local.estado) out.estado = local.estado;
  if (local.prioridad) out.prioridad = local.prioridad;
  if (local.responsable) out.responsable = local.responsable;
  if (local.desde) out.desde = local.desde;
  if (local.hasta) out.hasta = local.hasta;
  if (local.valorMin) out.valorMin = local.valorMin;
  if (local.valorMax) out.valorMax = local.valorMax;
  return out;
}

function toLocal(f: ClientFilters): LocalFilters {
  return {
    q: f.q ?? "",
    tipo: f.tipo ?? "",
    estado: f.estado ?? "",
    prioridad: f.prioridad ?? "",
    responsable: f.responsable ?? "",
    desde: f.desde ?? "",
    hasta: f.hasta ?? "",
    valorMin: f.valorMin ?? "",
    valorMax: f.valorMax ?? "",
  };
}

function buildQueryString(filters: ClientFilters): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") sp.set(key, value);
  }
  return sp.toString();
}

export function ClientList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteParam = searchParams.get("cliente");

  const [local, setLocal] = useState<LocalFilters>({ ...EMPTY_LOCAL });
  const [applied, setApplied] = useState<ClientFilters>({});
  const [page, setPage] = useState(1);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];
  const listQuery = useClients(applied);

  // Debounce del buscador (350 ms).
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      setApplied((a) => ({ ...a, q: local.q.trim() || undefined }));
      setPage(1);
    }, 350);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [local.q]);

  function commit(partial: Partial<LocalFilters>) {
    setLocal((l) => ({ ...l, ...partial }));
    setApplied((a) => ({ ...a, ...toFilters({ ...EMPTY_LOCAL, ...partial }) }));
    setPage(1);
  }

  function clearFilters() {
    setLocal({ ...EMPTY_LOCAL });
    setApplied({});
    setPage(1);
  }

  function applyView(viewFilters: ClientFilters) {
    const next: LocalFilters = { ...EMPTY_LOCAL, ...toLocal(viewFilters) };
    setLocal(next);
    setApplied(snapshotFilters(viewFilters));
    setPage(1);
  }

  /* ── Ficha: `?cliente=<id>` es la fuente de verdad del panel ── */
  function openFicha(id: string) {
    router.replace(`/clientes?cliente=${id}`, { scroll: false });
  }
  function closeFicha() {
    router.replace("/clientes", { scroll: false });
  }

  async function exportExcel() {
    const qs = buildQueryString(applied);
    try {
      const res = await fetch(`/api/v1/clients/export?${qs}`);
      if (!res.ok) {
        let msg = "No pudimos generar el archivo.";
        try {
          const body = (await res.json()) as { error?: string };
          msg = body.error ?? msg;
        } catch {
          /* fallback message */
        }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clientes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportación completada: clientes.xlsx");
    } catch {
      toast.error("No pudimos generar el archivo.");
    }
  }

  function openPdf() {
    const qs = buildQueryString(applied);
    window.open(`/print/clientes?${qs}`, "_blank", "noopener");
  }

  const hasActive = !filtersEmpty(applied);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SavedViewsMenu filters={applied} onApply={applyView} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportExcel()}
            className="h-9 rounded-[13px] border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPdf}
            className="h-9 rounded-[13px] border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileText className="size-4 text-destructivo" strokeWidth={1.8} />
            PDF
          </Button>
          <NewClientButton users={users} onSaved={() => void listQuery.refetch()} />
        </div>
      </div>

      <FiltersCard
        local={local}
        users={users}
        loadingUsers={usersQuery.isLoading}
        onChange={commit}
        onClear={clearFilters}
        hasActive={hasActive}
      />

      {listQuery.isError ? (
        <SinConexionCard onRetry={() => void listQuery.refetch()} />
      ) : (
        <ClientTableCard
          query={listQuery}
          page={page}
          onPage={setPage}
          onOpenFicha={openFicha}
        />
      )}

      <ClientSheet clientId={clienteParam} onClose={closeFicha} />
    </div>
  );
}

/* ── Fila de filtros ───────────────────────────────────────────────────── */

const SELECT_CLASS =
  "h-9 w-full rounded-[12px] border-ink-200 bg-white px-3 text-[13px]";

function FiltersCard({
  local,
  users,
  loadingUsers,
  onChange,
  onClear,
  hasActive,
}: {
  local: LocalFilters;
  users: { id: string; nombre: string }[];
  loadingUsers: boolean;
  onChange: (partial: Partial<LocalFilters>) => void;
  onClear: () => void;
  hasActive: boolean;
}) {
  return (
    <section className="rounded-[22px] border border-ink-200 bg-white p-4 lg:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
            strokeWidth={1.8}
          />
          <Input
            value={local.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Buscar por nombre, contacto o bitácora…"
            aria-label="Buscar clientes"
            className="h-10 rounded-[12px] border-ink-200 bg-white pl-9 text-[13px]"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Select value={local.tipo} onValueChange={(v) => onChange({ tipo: v === "todos" ? "" : (v ?? "") })}>
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[150px]")}>
              <SelectValue placeholder="Tipo de cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {ENUM_VALUES.TipoCliente.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_CLIENTE_LABELS[t as TipoCliente].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={local.estado} onValueChange={(v) => onChange({ estado: v === "todos" ? "" : (v ?? "") })}>
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[150px]")}>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {ENUM_VALUES.EstadoCliente.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_CLIENTE_LABELS[e as EstadoCliente].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={local.prioridad} onValueChange={(v) => onChange({ prioridad: v === "todos" ? "" : (v ?? "") })}>
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[130px]")}>
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Toda prioridad</SelectItem>
              {ENUM_VALUES.PrioridadCliente.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORIDAD_CLIENTE_LABELS[p as PrioridadCliente].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={local.responsable}
            onValueChange={(v) => onChange({ responsable: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[160px]")}>
              <SelectValue placeholder={loadingUsers ? "Cargando…" : "Responsable"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los responsables</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Label htmlFor="fecha-desde" className="sr-only">
              Desde
            </Label>
            <Input
              id="fecha-desde"
              type="date"
              value={local.desde}
              onChange={(e) => onChange({ desde: e.target.value })}
              aria-label="Primer contacto desde"
              className="h-10 w-[148px] rounded-[12px] border-ink-200 bg-white px-3 text-[12.5px]"
            />
            <span className="text-[12px] text-ink-500">a</span>
            <Label htmlFor="fecha-hasta" className="sr-only">
              Hasta
            </Label>
            <Input
              id="fecha-hasta"
              type="date"
              value={local.hasta}
              onChange={(e) => onChange({ hasta: e.target.value })}
              aria-label="Primer contacto hasta"
              className="h-10 w-[148px] rounded-[12px] border-ink-200 bg-white px-3 text-[12.5px]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Label htmlFor="valor-min" className="sr-only">
              Valor mínimo
            </Label>
            <Input
              id="valor-min"
              type="number"
              min="0"
              inputMode="numeric"
              value={local.valorMin}
              onChange={(e) => onChange({ valorMin: e.target.value })}
              placeholder="Valor min"
              className="h-10 w-[118px] rounded-[12px] border-ink-200 bg-white px-3 font-mono text-[12px]"
            />
            <span className="text-[12px] text-ink-500">a</span>
            <Label htmlFor="valor-max" className="sr-only">
              Valor máximo
            </Label>
            <Input
              id="valor-max"
              type="number"
              min="0"
              inputMode="numeric"
              value={local.valorMax}
              onChange={(e) => onChange({ valorMax: e.target.value })}
              placeholder="Valor max"
              className="h-10 w-[118px] rounded-[12px] border-ink-200 bg-white px-3 font-mono text-[12px]"
            />
          </div>
        </div>
      </div>

      {hasActive && (
        <div className="mt-3 flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 px-2 text-[12.5px] font-semibold text-ink-600"
          >
            <RotateCcw className="size-3" strokeWidth={1.9} />
            Limpiar filtros
          </Button>
        </div>
      )}
    </section>
  );
}

/* ── Tarjeta de la tabla ───────────────────────────────────────────────── */

function ClientTableCard({
  query,
  page,
  onPage,
  onOpenFicha,
}: {
  query: { isLoading: boolean; data?: ClientListResponse };
  page: number;
  onPage: (p: number) => void;
  onOpenFicha: (id: string) => void;
}) {
  const { isLoading, data } = query;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
      {isLoading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-[12px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyClients />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Cliente
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Tipo
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Estado
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Prioridad
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Responsable
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Valor potencial
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Próximo compromiso
                  </TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((cliente) => (
                  <ClientRow
                    key={cliente.id}
                    cliente={cliente}
                    onOpen={() => onOpenFicha(cliente.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationFooter
            page={page}
            totalPages={totalPages}
            desde={desde}
            hasta={hasta}
            total={total}
            onPage={onPage}
          />
        </>
      )}
    </section>
  );
}

function ClientRow({
  cliente,
  onOpen,
}: {
  cliente: ClientListRow;
  onOpen: () => void;
}) {
  const nextVencido = cliente.next_compromiso
    ? esVencida(cliente.next_compromiso.fecha_entrega)
    : false;

  return (
    <TableRow
      onClick={onOpen}
      className="cursor-pointer hover:bg-rose-50/40"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="pl-5">
        <div className="flex items-center gap-3">
          <InitialsAvatar nombre={cliente.nombre} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink-950">
              {cliente.nombre}
            </div>
            <div className="truncate text-[12px] text-ink-600">
              {[cliente.empresa, cliente.ubicacion].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <ToneBadge
          tone={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].tone}
          label={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].label}
        />
      </TableCell>
      <TableCell>
        <ToneBadge
          tone={ESTADO_CLIENTE_LABELS[cliente.estado].tone}
          label={ESTADO_CLIENTE_LABELS[cliente.estado].label}
        />
      </TableCell>
      <TableCell>
        <PrioridadChip prioridad={cliente.prioridad} />
      </TableCell>
      <TableCell>
        <ResponsableCell nombre={cliente.responsable_nombre} />
      </TableCell>
      <TableCell className="text-right">
        <span className="font-mono text-[12.5px] font-medium text-ink-900 tabular-nums">
          {formatCOP(cliente.valor_potencial)}
        </span>
      </TableCell>
      <TableCell>
        {cliente.next_compromiso ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[12px] tabular-nums",
              nextVencido ? "font-bold text-destructivo" : "text-ink-600",
            )}
          >
            {formatFecha(cliente.next_compromiso.fecha_entrega)}
            {nextVencido && (
              <span className="inline-flex h-[19px] items-center rounded-full bg-destructivo-bg px-2 text-[10px] font-bold text-destructivo">
                Vencido
              </span>
            )}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-500">—</span>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Abrir ficha de ${cliente.nombre}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-ink-500 hover:text-rose-700"
        >
          <Eye className="size-4" strokeWidth={1.8} />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/* ── Paginación (≤5 páginas visibles + elipsis) ────────────────────────── */

function pageList(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("…");
    out.push(p);
  }
  return out;
}

function PaginationFooter({
  page,
  totalPages,
  desde,
  hasta,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  desde: number;
  hasta: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-5 py-3.5">
      <p className="text-[12.5px] text-ink-600">
        Mostrando <span className="font-semibold text-ink-900">{desde}–{hasta}</span> de{" "}
        <span className="font-semibold text-ink-900">{total}</span> clientes
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 rounded-[10px] px-2.5 text-[12.5px] font-semibold"
        >
          Anterior
        </Button>
        {pageList(page, totalPages).map((p, i) =>
          typeof p === "number" ? (
            <Button
              key={`${p}-${i}`}
              variant={p === page ? "default" : "ghost"}
              size="sm"
              onClick={() => onPage(p)}
              className={cn(
                "h-8 min-w-8 rounded-[10px] px-2 text-[12.5px] font-bold",
                p === page && "bg-ink-950 text-white hover:bg-ink-800",
              )}
            >
              {p}
            </Button>
          ) : (
            <span key={`e-${i}`} className="px-1 text-[12px] text-ink-500">
              …
            </span>
          ),
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="h-8 rounded-[10px] px-2.5 text-[12.5px] font-semibold"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/* ── Estados: sin conexión / vacío ─────────────────────────────────────── */

function SinConexionCard({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-white p-8">
      <div className="max-w-[46ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
          <LoaderCircle className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          Plataforma no conectada
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          Configura <code className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-800">.env</code>{" "}
          con Supabase o inicia sesión para cargar la cartera de clientes.
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-5 rounded-[13px] px-4 font-semibold">
          Reintentar
        </Button>
      </div>
    </section>
  );
}

function EmptyClients() {
  return (
    <div className="grid min-h-[300px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700">
          <UsersRound className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          No encontramos clientes
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
          Ajusta los filtros o crea el primer cliente con el botón{" "}
          <span className="font-semibold text-ink-900">{'"Nuevo cliente"'}</span>.
        </p>
      </div>
    </div>
  );
}

