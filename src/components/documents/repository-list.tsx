// Repositorio documental (PRD §6.2): listado con búsqueda y filtros
// (categoría, etiqueta, cliente, autor, rango de fecha), selección múltiple
// con descarga .zip (POST /documents/zip), ficha en diálogo y subida de
// documentos. La pestaña Documentos de la ficha de cliente deep-linkea acá
// con ?cliente=<id> (el filtro se precarga desde el query param).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  Eye,
  FileUp,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DOC_CATEGORIES } from "@/lib/catalogs";
import { useUsers } from "@/hooks/crm";
import { useClientOptions } from "@/hooks/kanban";
import {
  downloadActiveVersion,
  downloadSelectionZip,
  extensionOf,
  formatVersionFecha,
  useDocCategories,
  useDocuments,
  type DocumentFilters,
  type DocumentItem,
} from "@/hooks/documents";
import { ToneBadge } from "@/components/crm/shared";
import { DocumentDialog } from "@/components/documents/document-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-dialog";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";

// True when the Supabase env vars are missing (dev-only signal): the API
// returns 500 "Plataforma no configurada" — show the technical card.
const unconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PAGE_SIZE = 25;

type LocalFilters = {
  q: string;
  categoria: string;
  etiqueta: string;
  autor: string;
  cliente: string;
  desde: string;
  hasta: string;
};

const EMPTY_LOCAL: LocalFilters = {
  q: "",
  categoria: "",
  etiqueta: "",
  autor: "",
  cliente: "",
  desde: "",
  hasta: "",
};

function toFilters(local: LocalFilters, page: number): DocumentFilters {
  const out: DocumentFilters = { page, limit: PAGE_SIZE };
  if (local.q.trim()) out.q = local.q.trim();
  if (local.categoria) out.categoria = local.categoria;
  if (local.etiqueta) out.etiqueta = local.etiqueta;
  if (local.autor) out.autor = local.autor;
  if (local.cliente) out.cliente = local.cliente;
  if (local.desde) out.desde = local.desde;
  if (local.hasta) out.hasta = local.hasta;
  return out;
}

function hasActive(local: LocalFilters): boolean {
  return (
    local.q.trim() !== "" ||
    local.categoria !== "" ||
    local.etiqueta !== "" ||
    local.autor !== "" ||
    local.cliente !== "" ||
    local.desde !== "" ||
    local.hasta !== ""
  );
}

export function RepositoryList() {
  const searchParams = useSearchParams();
  const clienteParam = searchParams.get("cliente") ?? "";

  const [local, setLocal] = useState<LocalFilters>({
    ...EMPTY_LOCAL,
    cliente: clienteParam,
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [zipPending, setZipPending] = useState(false);

  const applied = toFilters(local, page);
  const listQuery = useDocuments(applied);
  const usersQuery = useUsers();
  const clientsQuery = useClientOptions();

  // Debounce del buscador (350 ms, mismo patrón que el listado de clientes).
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      setLocal((l) => ({ ...l, q: l.q.trim() }));
      setPage(1);
    }, 350);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [local.q]);

  function commit(partial: Partial<LocalFilters>) {
    setLocal((l) => ({ ...l, ...partial }));
    setPage(1);
  }

  function clearFilters() {
    setLocal({ ...EMPTY_LOCAL, cliente: local.cliente });
    setPage(1);
  }

  // El filtro de etiqueta se construye con las etiquetas de la página
  // cargada (limitación pragmática: no hay endpoint de etiquetas único);
  // el servidor sí filtra por etiqueta real.
  const personas = usersQuery.data ?? [];
  const clientes = clientsQuery.data ?? [];
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  const etiquetaOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const doc of items) {
      for (const tag of doc.etiquetas) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  const pageIds = useMemo(() => items.map((d) => d.id), [items]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function descargarSeleccion() {
    if (selected.size === 0 || zipPending) return;
    setZipPending(true);
    try {
      await downloadSelectionZip([...selected]);
      setSelected(new Set());
    } catch {
      /* los toasts los lanzan los helpers */
    } finally {
      setZipPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-ink-600">
          Biblioteca con metadatos: títulos, categorías, etiquetas, clientes y
          versiones de cada archivo.
        </p>
        <Button
          onClick={() => setUploadOpen(true)}
          className="h-9 rounded-lg px-4 font-bold"
        >
          <FileUp className="size-4" strokeWidth={1.9} />
          Subir documento
        </Button>
      </div>

      <SectionFilters
        local={local}
        personas={personas}
        clientes={clientes}
        onChange={commit}
        onClear={clearFilters}
        hasActiveFilters={hasActive(local)}
        etiquetaOptions={etiquetaOptions}
      />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-ink-800">
            {selected.size} {selected.size === 1 ? "documento seleccionado" : "documentos seleccionados"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={zipPending}
              onClick={() => void descargarSeleccion()}
              className="h-9 rounded-12 border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
            >
              {zipPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4 text-exito" strokeWidth={1.8} />
              )}
              Descargar selección (.zip)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="h-9 px-2.5 text-[12.5px] font-semibold text-ink-600"
            >
              Limpiar
            </Button>
          </div>
        </div>
      )}

      {listQuery.isError ? (
        <SinConexionCard unconfigured={unconfigured} onRetry={() => void listQuery.refetch()} />
      ) : (
        <DocumentsTableCard
          query={listQuery}
          page={page}
          totalPages={totalPages}
          desde={desde}
          hasta={hasta}
          total={total}
          selected={selected}
          allPageSelected={allPageSelected}
          onTogglePage={togglePage}
          onToggleOne={toggleOne}
          onPage={setPage}
          onOpenFicha={setFichaId}
          onOpenUpload={() => setUploadOpen(true)}
        />
      )}

      {uploadOpen && (
        <UploadDocumentDialog
          open
          onOpenChange={setUploadOpen}
          prefilledClienteId={local.cliente}
        />
      )}
      <DocumentDialog documentId={fichaId} onClose={() => setFichaId(null)} />
    </div>
  );
}

/* ── Fila de filtros ───────────────────────────────────────────────────── */

const SELECT_CLASS =
  "h-9 flex-1 basis-0 rounded-12 border-ink-200 bg-panel px-3 text-[13px]";

function SectionFilters({
  local,
  personas,
  clientes,
  onChange,
  onClear,
  hasActiveFilters,
  etiquetaOptions,
}: {
  local: LocalFilters;
  personas: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
  onChange: (partial: Partial<LocalFilters>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  etiquetaOptions: string[];
}) {
  // Code review finding on PR #19: este filtro seguía usando la constante
  // estática DOC_CATEGORIES en vez del catálogo en vivo que ya migró
  // upload-dialog.tsx — quedaba desincronizado si un admin editaba
  // doc_categories, exactamente el bug que este PR dice resolver, en otro
  // lugar. Mientras carga o si falla, cae a las constantes de fábrica.
  const categoriesQuery = useDocCategories();
  const categories = categoriesQuery.data?.map((c) => c.nombre) ?? [...DOC_CATEGORIES];

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
            placeholder="Buscar por nombre, categoría, etiqueta, cliente o autor…"
            aria-label="Buscar documentos"
            className="h-10 rounded-lg border-ink-200 bg-panel pl-9 text-[13px]"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Select
            value={local.categoria}
            onValueChange={(v) => onChange({ categoria: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[150px]")}>
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

          <Select
            value={local.etiqueta}
            onValueChange={(v) => onChange({ etiqueta: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[140px]")}>
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
            value={local.autor}
            onValueChange={(v) => onChange({ autor: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[150px]")}>
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
            value={local.cliente}
            onValueChange={(v) => onChange({ cliente: v === "todos" ? "" : (v ?? "") })}
          >
            <SelectTrigger className={cn(SELECT_CLASS, "min-w-[160px]")}>
              <SelectValue
                placeholder={clientes.length === 0 ? "Cargando…" : "Cliente"}
              />
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

          <div className="flex items-center gap-1.5">
            <Label htmlFor="doc-desde" className="sr-only">
              Desde
            </Label>
            <Input
              id="doc-desde"
              type="date"
              value={local.desde}
              onChange={(e) => onChange({ desde: e.target.value })}
              aria-label="Documentos desde"
              className="h-10 w-[148px] rounded-lg border-ink-200 bg-panel px-3 text-[12.5px]"
            />
            <span className="text-[12px] text-ink-500">a</span>
            <Label htmlFor="doc-hasta" className="sr-only">
              Hasta
            </Label>
            <Input
              id="doc-hasta"
              type="date"
              value={local.hasta}
              onChange={(e) => onChange({ hasta: e.target.value })}
              aria-label="Documentos hasta"
              className="h-10 w-[148px] rounded-lg border-ink-200 bg-panel px-3 text-[12.5px]"
            />
          </div>
        </div>
      </div>

      {hasActiveFilters && (
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

/* ── Tabla de documentos ───────────────────────────────────────────────── */

function DocumentsTableCard({
  query,
  page,
  totalPages,
  desde,
  hasta,
  total,
  selected,
  allPageSelected,
  onTogglePage,
  onToggleOne,
  onPage,
  onOpenFicha,
  onOpenUpload,
}: {
  query: { isLoading: boolean; data?: { items: DocumentItem[]; total: number } | undefined };
  page: number;
  totalPages: number;
  desde: number;
  hasta: number;
  total: number;
  selected: Set<string>;
  allPageSelected: boolean;
  onTogglePage: () => void;
  onToggleOne: (id: string) => void;
  onPage: (p: number) => void;
  onOpenFicha: (id: string) => void;
  onOpenUpload: () => void;
}) {
  const items = query.data?.items ?? [];
  const isEmpty = !query.isLoading && items.length === 0;

  return (
    <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-panel">
      {query.isLoading ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-12" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyDocuments onOpenUpload={onOpenUpload} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-5">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={onTogglePage}
                      aria-label="Seleccionar todos los de la página"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Documento
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Cliente
                  </TableHead>
                  <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Versión activa
                  </TableHead>
                  <TableHead className="w-24 text-right text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    selected={selected.has(doc.id)}
                    onToggle={() => onToggleOne(doc.id)}
                    onOpen={() => onOpenFicha(doc.id)}
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

function DocumentRow({
  doc,
  selected,
  onToggle,
  onOpen,
}: {
  doc: DocumentItem;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const activa = doc.version_activa;
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
      <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Seleccionar ${doc.titulo}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-[12px_12px_12px_4px] text-[9.5px] font-bold",
              activa ? "bg-rose-100 text-rose-700 dark:text-rose-400" : "bg-ink-100 text-ink-600",
            )}
          >
            {extensionOf(activa?.tipo_archivo ?? "")?.toUpperCase() ?? "—"}
          </span>
          <div className="min-w-0 max-w-[340px]">
            <div className="truncate text-[13.5px] font-semibold text-ink-950">
              {doc.titulo}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <ToneBadge tone="neutro" label={doc.categoria} />
              {doc.etiquetas.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-[20px] items-center rounded-full bg-ink-100 px-2 text-[10.5px] font-medium text-ink-600"
                >
                  {tag}
                </span>
              ))}
              {doc.etiquetas.length > 3 && (
                <span className="text-[10.5px] text-ink-500">
                  +{doc.etiquetas.length - 3}
                </span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {doc.clientes[0] ? (
          <span className="line-clamp-1 max-w-[180px] text-[13px] font-medium text-ink-800">
            {doc.clientes[0].nombre}
            {doc.clientes.length > 1 && ` · +${doc.clientes.length - 1}`}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-500">—</span>
        )}
      </TableCell>
      <TableCell>
        {activa ? (
          <span className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-ink-100 px-2.5 text-[11px] font-semibold whitespace-nowrap text-ink-700">
            v{activa.numero_version} · {formatVersionFecha(activa.created_at)} ·{" "}
            {activa.subido_por_nombre}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-500">Sin versión</span>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Descargar ${doc.titulo}`}
            disabled={!activa}
            onClick={(e) => {
              e.stopPropagation();
              void downloadActiveVersion(doc).catch(() => undefined);
            }}
            className="text-ink-500 hover:text-exito after:-inset-1"
          >
            <Download className="size-4" strokeWidth={1.8} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Abrir ficha de ${doc.titulo}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="text-ink-500 hover:text-rose-700 dark:hover:text-rose-400 after:-inset-1"
          >
            <Eye className="size-4" strokeWidth={1.8} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Paginación ────────────────────────────────────────────────────────── */

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
        <span className="font-semibold text-ink-900">{total}</span> documentos
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 rounded-10 px-2.5 text-[12.5px] font-semibold after:-inset-1"
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
                "h-8 min-w-8 rounded-10 px-2 text-[12.5px] font-bold after:-inset-1",
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
          className="h-8 rounded-10 px-2.5 text-[12.5px] font-semibold after:-inset-1"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/* ── Estado vacío ──────────────────────────────────────────────────────── */

function EmptyDocuments({ onOpenUpload }: { onOpenUpload: () => void }) {
  return (
    <div className="grid min-h-[300px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
          <FolderOpen className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          Sin documentos
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
          Este documento sube el primer archivo del repositorio con el botón{" "}
          <span className="font-semibold text-ink-900">{'"Subir documento"'}</span> o
          ajusta los filtros para ver más resultados.
        </p>
        <Button onClick={onOpenUpload} className="mt-5 rounded-lg px-4 font-bold">
          <FileUp className="size-4" strokeWidth={1.9} />
          Subir documento
        </Button>
      </div>
    </div>
  );
}