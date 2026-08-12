// Listado de clientes (PRD §4.5 / §4.6): búsqueda con debounce (350 ms),
// filtros combinables, vistas guardadas en localStorage, exportación Excel
// con los filtros activos, PDF (página de impresión dedicada) y apertura de
// la ficha en panel lateral con `?cliente=<id>` para deep-link/reanudar.
//
// Permisos (v1): los controles se muestran para cualquier rol; el servidor
// aplica el alcance (COLABORADOR) y los 403 llegan como toasts.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { SinConexionCard } from "@/components/shared/sin-conexion-card";

// True when the Supabase env vars are missing (dev-only signal): the API
// returns 500 "Plataforma no configurada" — show the technical card.
const unconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

// URL contract: short params to keep the querystring light. `cliente` (ficha
// deep-link) is not part of the filter contract and is preserved separately.
const URL_PARAM_KEYS: { local: keyof LocalFilters; url: string }[] = [
  { local: "q", url: "q" },
  { local: "tipo", url: "tipo" },
  { local: "estado", url: "estado" },
  { local: "prioridad", url: "prioridad" },
  { local: "responsable", url: "responsable" },
  { local: "desde", url: "desde" },
  { local: "hasta", url: "hasta" },
  { local: "valorMin", url: "vmin" },
  { local: "valorMax", url: "vmax" },
];

/** Reads the filter params from the URL (used only at mount). */
function filtersFromParams(sp: Pick<URLSearchParams, "get">): LocalFilters {
  const local: LocalFilters = { ...EMPTY_LOCAL };
  for (const { local: key, url } of URL_PARAM_KEYS) {
    local[key] = sp.get(url) ?? "";
  }
  // Defense: a hand-crafted URL with `desde > hasta` must not 400 the list.
  if (local.desde && local.hasta && local.desde > local.hasta) {
    local.desde = "";
    local.hasta = "";
  }
  return local;
}

/** Builds the /clientes querystring for the applied filters + optional ficha. */
function urlQueryString(filters: ClientFilters, cliente: string | null): string {
  const sp = new URLSearchParams();
  for (const { local, url } of URL_PARAM_KEYS) {
    const value = filters[local];
    if (value !== undefined && value !== "") sp.set(url, value);
  }
  if (cliente) sp.set("cliente", cliente);
  const qs = sp.toString();
  return qs ? `/clientes?${qs}` : "/clientes";
}

/** Active filter count for the "Filtros" badge. `q` is not counted. */
function countActiveFilters(filters: ClientFilters): number {
  let n = 0;
  if (filters.tipo) n += 1;
  if (filters.estado) n += 1;
  if (filters.prioridad) n += 1;
  if (filters.responsable) n += 1;
  if (filters.desde || filters.hasta) n += 1;
  if (filters.valorMin || filters.valorMax) n += 1;
  return n;
}

/* ── Removable chips for the applied filters ──────────────────────────── */

type ActiveChip = { key: keyof LocalFilters; label: string };

const chipNumberFormatter = new Intl.NumberFormat("es-CO");

/** "12/08" — compact day/month, matching the date inputs' display. */
function chipFechaCorta(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

function chipValor(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? chipNumberFormatter.format(n) : v;
}

/**
 * Human-readable chips for every applied filter (search `q` excluded: it is
 * already visible in the input). Removing a chip resets that filter through
 * the same commit path as Aplicar/Limpiar todo.
 */
function buildActiveChips(
  applied: ClientFilters,
  users: { id: string; nombre: string }[],
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (applied.tipo) {
    chips.push({
      key: "tipo",
      label: `Tipo: ${TIPO_CLIENTE_LABELS[applied.tipo as TipoCliente]?.label ?? applied.tipo}`,
    });
  }
  if (applied.estado) {
    chips.push({
      key: "estado",
      label: `Estado: ${ESTADO_CLIENTE_LABELS[applied.estado as EstadoCliente]?.label ?? applied.estado}`,
    });
  }
  if (applied.prioridad) {
    chips.push({
      key: "prioridad",
      label: `Prioridad: ${PRIORIDAD_CLIENTE_LABELS[applied.prioridad as PrioridadCliente]?.label ?? applied.prioridad}`,
    });
  }
  if (applied.responsable) {
    const nombre = users.find((u) => u.id === applied.responsable)?.nombre;
    chips.push({
      key: "responsable",
      label: `Responsable: ${nombre ?? applied.responsable}`,
    });
  }
  if (applied.desde) chips.push({ key: "desde", label: `Desde: ${chipFechaCorta(applied.desde)}` });
  if (applied.hasta) chips.push({ key: "hasta", label: `Hasta: ${chipFechaCorta(applied.hasta)}` });
  if (applied.valorMin) chips.push({ key: "valorMin", label: `Valor min: ${chipValor(applied.valorMin)}` });
  if (applied.valorMax) chips.push({ key: "valorMax", label: `Valor max: ${chipValor(applied.valorMax)}` });
  return chips;
}

export function ClientList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteParam = searchParams.get("cliente");

  // Filters are seeded from the URL so they survive refresh/navigation.
  const [local, setLocal] = useState<LocalFilters>(() => filtersFromParams(searchParams));
  const [applied, setApplied] = useState<ClientFilters>(() => toFilters(filtersFromParams(searchParams)));
  const [page, setPage] = useState(1);

  const usersQuery = useUsers();
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const listQuery = useClients(applied);

  // Latest applied filters for the q-debounce timer (avoids stale closures).
  const appliedRef = useRef(applied);
  useEffect(() => {
    appliedRef.current = applied;
  }, [applied]);

  /** Mirrors the applied filters into the URL without polluting `cliente`. */
  const syncUrl = useCallback(
    (next: ClientFilters) => {
      router.replace(urlQueryString(next, clienteParam), { scroll: false });
    },
    [router, clienteParam],
  );

  // Debounce del buscador (350 ms).
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      const next = { ...appliedRef.current, q: local.q.trim() || undefined };
      setApplied(next);
      setPage(1);
      syncUrl(next);
    }, 350);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [local.q, clienteParam, syncUrl]);

  function commit(partial: Partial<LocalFilters>) {
    setLocal((l) => ({ ...l, ...partial }));
    // Rango inválido: el input muestra lo tipeado pero NO se dispara el fetch
    // (el backend rechazaría con 400 de todas formas — defensa en capas).
    const next = { ...local, ...partial };
    if (next.desde && next.hasta && next.desde > next.hasta) {
      toast.error("La fecha final no puede ser anterior a la inicial.");
      return;
    }
    // BUG-002: `q` se propaga SOLO por el debounce de 350 ms (efecto de arriba).
    // Si lo aplicamos acá, cada tecla dispara un fetch. El resto de filtros sí
    // se aplican de inmediato (selects y rangos no necesitan debounce).
    const rest: Partial<LocalFilters> = { ...partial };
    delete rest.q;
    if (Object.keys(rest).length > 0) {
      // Each edited key is dropped from the applied set first, then the
      // non-empty values are re-assigned — this is what allows a chip or a
      // "Todas las vistas" select to CLEAR a single applied filter (the old
      // spread-only merge could not null out keys).
      const nextFilters: ClientFilters = { ...applied };
      for (const key of Object.keys(rest) as (keyof LocalFilters)[]) {
        delete nextFilters[key];
      }
      Object.assign(nextFilters, toFilters({ ...EMPTY_LOCAL, ...rest }));
      setApplied(nextFilters);
      syncUrl(nextFilters);
    }
    setPage(1);
  }

  function clearFilters() {
    setLocal({ ...EMPTY_LOCAL });
    setApplied({});
    syncUrl({});
    setPage(1);
  }

  function applyView(viewFilters: ClientFilters) {
    const next: LocalFilters = { ...EMPTY_LOCAL, ...toLocal(viewFilters) };
    const nextFilters = snapshotFilters(viewFilters);
    setLocal(next);
    setApplied(nextFilters);
    syncUrl(nextFilters);
    setPage(1);
  }

  /* ── Ficha: `?cliente=<id>` es la fuente de verdad del panel ── */
  function openFicha(id: string) {
    router.replace(urlQueryString(applied, id), { scroll: false });
  }
  function closeFicha() {
    router.replace(urlQueryString(applied, null), { scroll: false });
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

  const activeCount = countActiveFilters(applied);
  const activeChips = useMemo(() => buildActiveChips(applied, users), [applied, users]);

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
            className="h-9 rounded-lg border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPdf}
            className="h-9 rounded-lg border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
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
        activeCount={activeCount}
        chips={activeChips}
      />

      {listQuery.isError ? (
        <SinConexionCard unconfigured={unconfigured} onRetry={() => void listQuery.refetch()} />
      ) : (
        <ClientGridCard
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
  "h-9 w-full rounded-12 border-ink-200 bg-panel px-3 text-[13px]";

function FiltersCard({
  local,
  users,
  loadingUsers,
  onChange,
  onClear,
  activeCount,
  chips,
}: {
  local: LocalFilters;
  users: { id: string; nombre: string }[];
  loadingUsers: boolean;
  onChange: (partial: Partial<LocalFilters>) => void;
  onClear: () => void;
  activeCount: number;
  chips: ActiveChip[];
}) {
  const [open, setOpen] = useState(false);
  // Draft state: touching a control inside the popover must NOT fetch until
  // "Aplicar". Seeded from `local` (the applied filters) when the panel
  // opens with no pending edits; once the user edits, the draft survives
  // close/reopen so half-finished edits are never discarded. Any successful
  // apply or "Limpiar todo" resets the dirty flag so the next open reseeds
  // from the current applied state.
  const [draft, setDraft] = useState<LocalFilters>(local);
  const [dirty, setDirty] = useState(false);

  function patchDraft(patch: Partial<LocalFilters>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function handleOpenChange(next: boolean) {
    if (next && !dirty) setDraft(local);
    setOpen(next);
  }

  function applyDraft() {
    if (draft.desde && draft.hasta && draft.desde > draft.hasta) {
      toast.error("La fecha final no puede ser anterior a la inicial.");
      return;
    }
    // `local.q` is live-typed outside the popover: a stale draft.q must
    // never clobber whatever the user just wrote in the search box.
    onChange({ ...draft, q: local.q });
    setDirty(false);
    setOpen(false);
  }

  function clearAll() {
    setDraft({ ...EMPTY_LOCAL });
    setDirty(false);
    onClear();
  }

  const draftEmpty = filtersEmpty(toFilters(draft));

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-4 lg:p-5">
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
            className="h-10 rounded-12 border-ink-200 bg-panel pl-9 text-[13px]"
          />
        </div>

        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="h-10 rounded-12 border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
              >
                <SlidersHorizontal className="size-4 text-ink-600" strokeWidth={1.8} />
                Filtros{" "}
                {activeCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-600">
                    {activeCount === 1 ? "1 filtro" : `${activeCount} filtros`}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-[min(92vw,600px)]">
            <PopoverTitle className="font-display text-[15px] font-bold text-ink-950">
              Filtros
            </PopoverTitle>
            <PopoverDescription className="sr-only">
              Combina criterios para acotar la lista de clientes.
            </PopoverDescription>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select value={draft.tipo} onValueChange={(v) => patchDraft({ tipo: v === "todos" ? "" : (v ?? "") })}>
                <SelectTrigger className={cn(SELECT_CLASS)}>
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

              <Select value={draft.estado} onValueChange={(v) => patchDraft({ estado: v === "todos" ? "" : (v ?? "") })}>
                <SelectTrigger className={cn(SELECT_CLASS)}>
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

              <Select value={draft.prioridad} onValueChange={(v) => patchDraft({ prioridad: v === "todos" ? "" : (v ?? "") })}>
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                value={draft.responsable}
                onValueChange={(v) => patchDraft({ responsable: v === "todos" ? "" : (v ?? "") })}
              >
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                  value={draft.desde}
                  onChange={(e) => patchDraft({ desde: e.target.value })}
                  aria-label="Primer contacto desde"
                  className="h-10 min-w-0 flex-1 rounded-12 border-ink-200 bg-panel px-3 text-[12.5px]"
                />
                <span className="text-[12px] text-ink-500">a</span>
                <Label htmlFor="fecha-hasta" className="sr-only">
                  Hasta
                </Label>
                <Input
                  id="fecha-hasta"
                  type="date"
                  value={draft.hasta}
                  onChange={(e) => patchDraft({ hasta: e.target.value })}
                  aria-label="Primer contacto hasta"
                  className="h-10 min-w-0 flex-1 rounded-12 border-ink-200 bg-panel px-3 text-[12.5px]"
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
                  value={draft.valorMin}
                  onChange={(e) => patchDraft({ valorMin: e.target.value })}
                  placeholder="Valor min"
                  className="h-10 min-w-0 flex-1 rounded-12 border-ink-200 bg-panel px-3 font-mono text-[12px]"
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
                  value={draft.valorMax}
                  onChange={(e) => patchDraft({ valorMax: e.target.value })}
                  placeholder="Valor max"
                  className="h-10 min-w-0 flex-1 rounded-12 border-ink-200 bg-panel px-3 font-mono text-[12px]"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={draftEmpty}
                className="h-8 px-2 text-[12.5px] font-semibold text-ink-600"
              >
                <RotateCcw className="size-3" strokeWidth={1.9} />
                Limpiar todo
              </Button>
              <Button size="sm" onClick={applyDraft} className="h-8 rounded-lg px-4 text-[13px] font-semibold">
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Applied filters as removable chips (derived from `applied`, no
          extra fetches). Removing a chip resets that filter via the same
          commit path as Aplicar; the bulk "Limpiar todo" stays inside the
          popover, so no duplicate clear-all affordance is rendered here. */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-ink-100 py-1 pr-1 pl-2.5 text-[12px] font-semibold text-ink-800"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => onChange({ [chip.key]: "" })}
                aria-label={`Quitar filtro ${chip.label}`}
                className="grid size-5 place-items-center rounded-full text-ink-600 transition-colors hover:bg-ink-200 hover:text-ink-900"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Grilla de cards ──────────────────────────────────────────────────── */

function ClientGridCard({
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
    <section className="rounded-[22px] border border-ink-200 bg-panel">
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[18px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyClients />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
            {items.map((cliente) => (
              <ClientCard
                key={cliente.id}
                cliente={cliente}
                onOpen={() => onOpenFicha(cliente.id)}
              />
            ))}
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

function ClientCard({
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
    <article
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Abrir ficha de ${cliente.nombre}`}
      className="flex cursor-pointer flex-col gap-3.5 rounded-[18px] border border-ink-200 bg-panel p-4 shadow-[0_1px_2px_rgba(16,16,32,0.04)] transition-colors hover:border-rose-200 hover:bg-rose-50/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <InitialsAvatar nombre={cliente.nombre} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold text-ink-950">
            {cliente.nombre}
          </h3>
          <p className="truncate text-[12px] text-ink-600">
            {[cliente.empresa, cliente.ubicacion].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToneBadge
          tone={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].tone}
          label={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].label}
        />
        <ToneBadge
          tone={ESTADO_CLIENTE_LABELS[cliente.estado].tone}
          label={ESTADO_CLIENTE_LABELS[cliente.estado].label}
        />
        {cliente.prioridad && <PrioridadChip prioridad={cliente.prioridad} />}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ink-100 pt-3 text-[12px]">
        <div>
          <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Valor potencial
          </dt>
          <dd className="mt-0.5 font-mono text-[12.5px] font-medium text-ink-900 tabular-nums">
            {formatCOP(cliente.valor_potencial)}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Compromisos abiertos
          </dt>
          <dd className="mt-0.5 font-mono text-[12.5px] font-medium text-ink-900 tabular-nums">
            {cliente.compromisos_abiertos}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Responsable
          </dt>
          <dd className="mt-0.5">
            <ResponsableCell nombre={cliente.responsable_nombre} />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Próximo compromiso
          </dt>
          <dd className="mt-0.5">
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
          </dd>
        </div>
      </dl>

      <div className="flex justify-end border-t border-ink-100 pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="h-8 rounded-11 border-ink-200 bg-panel px-3 text-[12px] font-semibold text-ink-700 hover:bg-ink-100"
        >
          <Eye className="size-3.5" strokeWidth={1.8} />
          Ver detalle
        </Button>
      </div>
    </article>
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
          className="h-8 rounded-10 px-2.5 text-[12.5px] font-semibold"
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
                "h-8 min-w-8 rounded-10 px-2 text-[12.5px] font-bold",
                p === page && "bg-ink-950 text-white hover:bg-ink-800 dark:bg-ink-100 dark:text-white dark:hover:bg-ink-200",
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
          className="h-8 rounded-10 px-2.5 text-[12.5px] font-semibold"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/* ── Estado vacío ──────────────────────────────────────────────────────── */

function EmptyClients() {
  return (
    <div className="grid min-h-[300px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
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

