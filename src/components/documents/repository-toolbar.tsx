// Barra del explorador (S1): atrás/adelante, ruta de carpetas (destino de
// carpetas arrastradas), búsqueda, Filtros, orden y vista lista/cuadrícula.
// Debajo, los filtros activos como chips removibles (S6).

"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ChevronRight,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { DOC_CATEGORIES } from "@/lib/catalogs";
import { useDocCategories } from "@/hooks/documents";
import type { DocumentOrder } from "@/lib/api/documents";
import { useFolderDropTarget } from "@/components/documents/folder-tree";

/** Filtros del popover (los que se muestran como chips). */
export type FilterFields = {
  categoria: string;
  etiqueta: string;
  autor: string;
  cliente: string;
  desde: string;
  hasta: string;
};

const FILTER_KEYS: (keyof FilterFields)[] = [
  "categoria",
  "etiqueta",
  "autor",
  "cliente",
  "desde",
  "hasta",
];

export const EMPTY_FILTER_FIELDS: FilterFields = {
  categoria: "",
  etiqueta: "",
  autor: "",
  cliente: "",
  desde: "",
  hasta: "",
};

const ORDER_OPTIONS: { value: DocumentOrder; label: string }[] = [
  { value: "reciente", label: "Más recientes" },
  { value: "antiguo", label: "Más antiguos" },
  { value: "nombre_asc", label: "Nombre A–Z" },
  { value: "nombre_desc", label: "Nombre Z–A" },
];

type Option = { id: string; nombre: string };
type MoveFolder = (folderId: string, targetId: string | null) => void;
type CanMoveFolder = (sourceId: string, targetId: string | null) => boolean;

function RootDropTarget({
  onMoveFolder,
  canMoveFolder,
  children,
}: {
  onMoveFolder: MoveFolder;
  canMoveFolder: CanMoveFolder;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    null,
    undefined,
    onMoveFolder,
    canMoveFolder,
    "ruta",
  );
  return (
    <span
      ref={setNodeRef}
      {...handlers}
      className={cn(
        "inline-flex items-center rounded-6 px-1",
        isOver && "bg-exito-bg ring-2 ring-exito/40",
      )}
    >
      {children}
    </span>
  );
}

function Breadcrumb({
  trail,
  onNavigate,
  onMoveFolder,
  canMoveFolder,
}: {
  trail: { id: string; nombre: string }[];
  onNavigate: (id: string | null) => void;
  onMoveFolder: MoveFolder;
  canMoveFolder: CanMoveFolder;
}) {
  return (
    <nav aria-label="Ruta de carpetas" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {trail.length === 0 ? (
        <RootDropTarget onMoveFolder={onMoveFolder} canMoveFolder={canMoveFolder}>
          <span className="shrink-0 font-semibold text-ink-950">Todas</span>
        </RootDropTarget>
      ) : (
        <>
          <RootDropTarget onMoveFolder={onMoveFolder} canMoveFolder={canMoveFolder}>
            <button
              type="button"
              onClick={() => onNavigate(null)}
              aria-label="Ir a Todas"
              className="shrink-0 text-ink-600 hover:text-ink-900"
            >
              Todas
            </button>
          </RootDropTarget>
          {trail.map((segmento, i) => {
            const esActual = i === trail.length - 1;
            return (
              <span key={segmento.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} />
                {esActual ? (
                  <span aria-current="page" className="truncate font-semibold text-ink-950">
                    {segmento.nombre}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(segmento.id)}
                    className="truncate text-ink-600 hover:text-ink-900"
                  >
                    {segmento.nombre}
                  </button>
                )}
              </span>
            );
          })}
        </>
      )}
    </nav>
  );
}

const SELECT_CLASS = "h-10 w-full px-3 text-base md:text-[13px]";

function FiltersPopover({
  fields,
  personas,
  clientes,
  etiquetaOptions,
  onChange,
  onClear,
}: {
  fields: FilterFields;
  personas: Option[];
  clientes: Option[];
  etiquetaOptions: string[];
  onChange: (partial: Partial<FilterFields>) => void;
  onClear: () => void;
}) {
  // Catálogo en vivo (con fallback a las constantes de fábrica mientras carga).
  const categoriesQuery = useDocCategories();
  const categories = categoriesQuery.data?.map((c) => c.nombre) ?? [...DOC_CATEGORIES];
  const activos = FILTER_KEYS.filter((k) => fields[k] !== "").length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="px-3 text-[13px] font-semibold text-ink-800">
            <SlidersHorizontal className="size-4 text-ink-600" strokeWidth={1.8} />
            Filtros{" "}
            {activos > 0 && (
              <span className="ml-0.5 grid min-w-[18px] place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {activos}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[min(92vw,560px)]">
        <PopoverTitle className="font-display text-[15px] font-bold text-ink-950">
          Filtros de documentos
        </PopoverTitle>
        <PopoverDescription className="sr-only">
          Combina criterios para acotar el repositorio.
        </PopoverDescription>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            value={fields.categoria}
            onValueChange={(v) => onChange({ categoria: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={SELECT_CLASS}>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Etiquetas de la página cargada (no hay endpoint de etiquetas único);
              el servidor sí filtra por la etiqueta real. */}
          <Select
            value={fields.etiqueta}
            onValueChange={(v) => onChange({ etiqueta: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={SELECT_CLASS}>
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las etiquetas</SelectItem>
              {etiquetaOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={fields.autor}
            onValueChange={(v) => onChange({ autor: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={SELECT_CLASS}>
              <SelectValue placeholder={personas.length === 0 ? "Cargando…" : "Autor"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los autores</SelectItem>
              {personas.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={fields.cliente}
            onValueChange={(v) => onChange({ cliente: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={SELECT_CLASS}>
              <SelectValue placeholder={clientes.length === 0 ? "Cargando…" : "Cliente"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 sm:col-span-2">
            <Label htmlFor="doc-desde" className="sr-only">
              Desde
            </Label>
            <Input
              id="doc-desde"
              type="date"
              value={fields.desde}
              onChange={(e) => onChange({ desde: e.target.value })}
              aria-label="Documentos desde"
              className="h-10 min-w-0 flex-1 px-3 text-base md:text-[12.5px]"
            />
            <span className="text-[12px] text-ink-500">a</span>
            <Label htmlFor="doc-hasta" className="sr-only">
              Hasta
            </Label>
            <Input
              id="doc-hasta"
              type="date"
              value={fields.hasta}
              onChange={(e) => onChange({ hasta: e.target.value })}
              aria-label="Documentos hasta"
              className="h-10 min-w-0 flex-1 px-3 text-base md:text-[12.5px]"
            />
          </div>
        </div>

        {activos > 0 && (
          <div className="mt-4 flex justify-end border-t border-ink-100 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="px-2 text-[12.5px] font-semibold text-ink-600"
            >
              <RotateCcw className="size-3" strokeWidth={1.9} />
              Limpiar filtros
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ExplorerToolbar({
  canBack,
  canForward,
  onBack,
  onForward,
  searching,
  trail,
  onNavigate,
  onMoveFolder,
  canMoveFolder,
  q,
  onQ,
  searchPlaceholder,
  fields,
  personas,
  clientes,
  etiquetaOptions,
  onFilters,
  onClearFilters,
  orden,
  onOrden,
  vista,
  onVista,
}: {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  searching: boolean;
  trail: { id: string; nombre: string }[];
  onNavigate: (id: string | null) => void;
  onMoveFolder: MoveFolder;
  canMoveFolder: CanMoveFolder;
  q: string;
  onQ: (q: string) => void;
  searchPlaceholder: string;
  fields: FilterFields;
  personas: Option[];
  clientes: Option[];
  etiquetaOptions: string[];
  onFilters: (partial: Partial<FilterFields>) => void;
  onClearFilters: () => void;
  orden: DocumentOrder;
  onOrden: (orden: DocumentOrder) => void;
  vista: "grid" | "lista";
  onVista: (vista: "grid" | "lista") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
      <div className="flex min-w-0 items-center gap-1 text-[13.5px]">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Atrás"
          disabled={!canBack}
          onClick={onBack}
          className="size-8 text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-4" strokeWidth={1.9} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Adelante"
          disabled={!canForward}
          onClick={onForward}
          className="size-8 text-ink-500 hover:text-ink-800"
        >
          <ArrowRight className="size-4" strokeWidth={1.9} />
        </Button>
        <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-border" />
        {searching ? (
          <span className="font-semibold text-ink-950">Resultados de búsqueda</span>
        ) : (
          <Breadcrumb
            trail={trail}
            onNavigate={onNavigate}
            onMoveFolder={onMoveFolder}
            canMoveFolder={canMoveFolder}
          />
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {/* Full row on phones so the filter and sort buttons wrap below instead of squeezing it. */}
        <div className="relative min-w-0 basis-full sm:w-[260px] sm:flex-none sm:basis-auto">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
            strokeWidth={1.8}
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Buscar documentos"
            className="h-10 pl-9 text-base md:text-[13px]"
          />
        </div>
        <FiltersPopover
          fields={fields}
          personas={personas}
          clientes={clientes}
          etiquetaOptions={etiquetaOptions}
          onChange={onFilters}
          onClear={onClearFilters}
        />
        <Select value={orden} onValueChange={(v) => onOrden((v as DocumentOrder) ?? "reciente")}>
          <SelectTrigger
            size="sm"
            aria-label="Ordenar documentos"
            className="w-auto gap-1.5 px-3 text-base md:text-[13px] font-semibold text-ink-800"
          >
            <ArrowUpDown className="size-3.5 text-ink-600" strokeWidth={1.9} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {ORDER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="flex items-center overflow-hidden rounded-10 border border-border-strong"
          role="group"
          aria-label="Vista de documentos"
        >
          <Button
            type="button"
            variant={vista === "lista" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Vista lista"
            aria-pressed={vista === "lista"}
            onClick={() => onVista("lista")}
            className="size-[38px] rounded-none"
          >
            <List className="size-4" strokeWidth={1.9} />
          </Button>
          <Button
            type="button"
            variant={vista === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Vista cuadrícula"
            aria-pressed={vista === "grid"}
            onClick={() => onVista("grid")}
            className="size-[38px] rounded-none border-l border-border-strong"
          >
            <LayoutGrid className="size-4" strokeWidth={1.9} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Chips de filtros activos (S6) ─────────────────────────────────────── */

function formatDay(value: string): string {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export function FilterChips({
  fields,
  personas,
  clientes,
  onChange,
  onClear,
}: {
  fields: FilterFields;
  personas: Option[];
  clientes: Option[];
  onChange: (partial: Partial<FilterFields>) => void;
  onClear: () => void;
}) {
  const nombre = (list: Option[], id: string) => list.find((o) => o.id === id)?.nombre ?? id;
  const chips: { key: keyof FilterFields; label: string }[] = [];
  if (fields.categoria) chips.push({ key: "categoria", label: `Categoría: ${fields.categoria}` });
  if (fields.etiqueta) chips.push({ key: "etiqueta", label: `Etiqueta: ${fields.etiqueta}` });
  if (fields.autor) chips.push({ key: "autor", label: `Autor: ${nombre(personas, fields.autor)}` });
  if (fields.cliente)
    chips.push({ key: "cliente", label: `Cliente: ${nombre(clientes, fields.cliente)}` });
  if (fields.desde) chips.push({ key: "desde", label: `Desde: ${formatDay(fields.desde)}` });
  if (fields.hasta) chips.push({ key: "hasta", label: `Hasta: ${formatDay(fields.hasta)}` });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-200 px-4 py-2.5 text-[12.5px]">
      <span className="mr-1 text-ink-600">Filtros activos:</span>
      <ul aria-label="Filtros activos" className="contents">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-300 bg-panel pr-1 pl-3 font-medium text-ink-800"
          >
            {chip.label}
            <button
              type="button"
              aria-label={`Quitar filtro ${chip.label}`}
              onClick={() => onChange({ [chip.key]: "" })}
              className="grid size-5 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="size-3" strokeWidth={2.2} />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="px-2 text-[12.5px] font-semibold text-rose-700 dark:text-rose-400"
      >
        Limpiar filtros
      </Button>
    </div>
  );
}
