// Repositorio documental (PRD §6.2): listado con búsqueda y filtros
// (categoría, etiqueta, cliente, autor, rango de fecha), selección múltiple
// con descarga .zip (POST /documents/zip), ficha en diálogo y subida de
// documentos. La pestaña Documentos de la ficha de cliente deep-linkea acá
// con ?cliente=<id> (el filtro se precarga desde el query param).
// Carpetas (S3–S5): "Subir documento" guarda en la carpeta abierta; "Carpeta
// de cliente" abre (o crea) la carpeta de un cliente; soltar archivos sobre
// el listado o sobre una carpeta los sube ahí; y un documento arrastrado de
// su asa a una carpeta se mueve (PATCH carpeta_id vía useMoveDocument).

"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Download,
  Eye,
  FileUp,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LoaderCircle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  useFolders,
  useMoveDocument,
  type DocumentFilters,
  type DocumentItem,
  type FolderNode,
} from "@/hooks/documents";
import { ToneBadge } from "@/components/crm/shared";
import { DocumentDialog } from "@/components/documents/document-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-dialog";
import {
  FOLDER_DROP_PREFIX,
  FolderTree,
  ROOT_DROP_ID,
  type FolderAction,
} from "@/components/documents/folder-tree";
import {
  ClientFolderDialog,
  CreateFolderDialog,
  DeleteFolderDialog,
  MoveFolderDialog,
  RenameFolderDialog,
} from "@/components/documents/folder-dialogs";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";
import { etiquetasVisibles } from "@/lib/documents/etiquetas";

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
  carpeta: string;
  desde: string;
  hasta: string;
};

const EMPTY_LOCAL: LocalFilters = {
  q: "",
  categoria: "",
  etiqueta: "",
  autor: "",
  cliente: "",
  carpeta: "",
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
  // Cuando q está activo se ignora el filtro de carpeta (comportamiento de
  // Drive): buscar dentro de una sola carpeta es un default sin sorpresas pero
  // inútil cuando no sabés dónde está el archivo.
  if (local.carpeta && !local.q.trim()) out.carpeta = local.carpeta;
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
    local.carpeta !== "" ||
    local.desde !== "" ||
    local.hasta !== ""
  );
}

/** Path from the root to the active folder (raíz -> ... -> activa). */
function folderPath(nodes: FolderNode[], id: string): string[] {
  for (const n of nodes) {
    if (n.id === id) return [n.nombre];
    const child = folderPath(n.hijos, id);
    if (child.length > 0) return [n.nombre, ...child];
  }
  return [];
}

/** Id de @dnd-kit de un documento arrastrable del listado. */
const DOC_DRAG_PREFIX = "doc:";

/** Archivos del sistema soltados (drop nativo); vacío si se arrastró otra cosa. */
function droppedFiles(event: DragEvent): File[] {
  return Array.from(event.dataTransfer?.files ?? []);
}

function findFolder(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findFolder(n.hijos, id);
    if (child) return child;
  }
  return null;
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
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [clientFolderOpen, setClientFolderOpen] = useState(false);
  // Archivos soltados (S5) y la carpeta destino; abre el diálogo de subida.
  const [dropUpload, setDropUpload] = useState<{
    files: File[];
    folderId: string | null;
  } | null>(null);
  const [draggedDoc, setDraggedDoc] = useState<DocumentItem | null>(null);
  const [folderAction, setFolderAction] = useState<{
    id: string;
    action: FolderAction;
  } | null>(null);

  const applied = toFilters(local, page);
  const listQuery = useDocuments(applied);
  const usersQuery = useUsers();
  const clientsQuery = useClientOptions();
  const foldersQuery = useFolders();
  const folders = foldersQuery.data ?? [];
  const moveDocument = useMoveDocument();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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

  const activeFolderName = local.carpeta
    ? folderPath(folders, local.carpeta).join(" / ")
    : "";
  const activeFolder = local.carpeta ? findFolder(folders, local.carpeta) : null;
  const uploadFolder = dropUpload
    ? dropUpload.folderId
      ? findFolder(folders, dropUpload.folderId)
      : null
    : activeFolder;

  /** Archivos soltados sobre una carpeta (o el listado): se suben ahí. */
  function handleDropFiles(folderId: string | null, files: File[]) {
    if (folderId !== (local.carpeta || null)) commit({ carpeta: folderId ?? "" });
    setDropUpload({ files, folderId });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id).slice(DOC_DRAG_PREFIX.length);
    setDraggedDoc(items.find((d) => d.id === id) ?? null);
  }

  /** Documento soltado sobre una carpeta del rail ("Todas" = raíz). */
  function handleDragEnd(event: DragEndEvent) {
    setDraggedDoc(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !activeId.startsWith(DOC_DRAG_PREFIX) || !overId.startsWith(FOLDER_DROP_PREFIX)) {
      return;
    }
    const carpetaId = overId === ROOT_DROP_ID ? null : overId.slice(FOLDER_DROP_PREFIX.length);
    moveDocument.mutate({ id: activeId.slice(DOC_DRAG_PREFIX.length), carpeta_id: carpetaId });
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
          className="px-4 font-bold"
        >
          <FileUp className="size-4" strokeWidth={1.9} />
          Subir documento
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <FolderOpen className="size-4 text-ink-500" strokeWidth={1.8} />
        {local.q.trim() ? (
          <span className="font-semibold text-ink-800">Resultados de búsqueda</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => commit({ carpeta: "" })}
              className={cn(
                "font-semibold",
                !local.carpeta ? "text-exito" : "text-ink-600 hover:text-ink-800",
              )}
            >
              Repositorio
            </button>
            {activeFolderName && (
              <>
                <span className="text-ink-400">/</span>
                <span className="font-semibold text-ink-800">{activeFolderName}</span>
              </>
            )}
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggedDoc(null)}
      >
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="flex min-w-0 flex-col gap-3 surface p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
              Carpetas
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setCreateFolderOpen(true)}
              aria-label="Crear carpeta"
              className="text-ink-500 hover:text-ink-800"
            >
              <FolderPlus className="size-4" strokeWidth={1.9} />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setClientFolderOpen(true)}
            className="justify-start px-2.5 text-[12.5px] font-semibold text-ink-800"
          >
            <UserRound className="size-3.5 text-exito" strokeWidth={1.9} />
            Carpeta de cliente
          </Button>
          {foldersQuery.isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded-10" />
              ))}
            </div>
          ) : (
            <FolderTree
              folders={folders}
              activeId={local.carpeta || null}
              onSelect={(id) => commit({ carpeta: id ?? "" })}
              onAction={(id, action) => setFolderAction({ id, action })}
              onDropFiles={handleDropFiles}
            />
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-rose-200 bg-rose-50 px-4 py-2.5">
              <span className="text-[13px] font-semibold text-ink-800">
                {selected.size} {selected.size === 1 ? "documento seleccionado" : "documentos seleccionados"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={zipPending}
                  onClick={() => void descargarSeleccion()}
                  className="px-3.5 text-[13px] font-semibold text-ink-800"
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
                  className="px-2.5 text-[12.5px] font-semibold text-ink-600"
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
              onDropFiles={(files) => handleDropFiles(local.carpeta || null, files)}
              dropFolderName={activeFolder?.nombre ?? null}
            />
          )}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedDoc ? (
          <div className="inline-flex max-w-[280px] items-center gap-2 rounded-12 border border-ink-200 bg-panel px-3 py-2 text-[13px] font-semibold text-ink-900 shadow-lg">
            <GripVertical className="size-4 shrink-0 text-ink-400" strokeWidth={1.8} />
            <span className="truncate">{draggedDoc.titulo}</span>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {(uploadOpen || dropUpload) && (
        <UploadDocumentDialog
          open
          onOpenChange={(next) => {
            if (next) return;
            setUploadOpen(false);
            setDropUpload(null);
          }}
          prefilledClienteId={local.cliente}
          folder={uploadFolder}
          initialFiles={dropUpload?.files}
        />
      )}
      {clientFolderOpen && (
        <ClientFolderDialog
          open
          onOpenChange={setClientFolderOpen}
          clientes={clientes}
          onOpened={(carpetaId) => commit({ carpeta: carpetaId })}
        />
      )}
      <DocumentDialog documentId={fichaId} onClose={() => setFichaId(null)} />
      {createFolderOpen && (
        <CreateFolderDialog
          open
          onOpenChange={setCreateFolderOpen}
          defaultParentId={local.carpeta || null}
          folders={folders}
        />
      )}
      {folderAction && (
        <FolderActionDialogs
          action={folderAction}
          folders={folders}
          onClose={() => setFolderAction(null)}
        />
      )}
    </div>
  );
}

function FolderActionDialogs({
  action,
  folders,
  onClose,
}: {
  action: { id: string; action: FolderAction };
  folders: FolderNode[];
  onClose: () => void;
}) {
  const folder = findFolder(folders, action.id);
  if (!folder) return null;

  if (action.action === "rename") {
    return <RenameFolderDialog open onOpenChange={onClose} folder={folder} />;
  }
  if (action.action === "move") {
    return <MoveFolderDialog open onOpenChange={onClose} folder={folder} folders={folders} />;
  }
  return <DeleteFolderDialog open onOpenChange={onClose} folder={folder} />;
}

/* ── Fila de filtros ───────────────────────────────────────────────────── */

const SELECT_CLASS =
  "h-10 flex-1 basis-0 px-3 text-base md:text-[13px]";

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

  // Patrón E (plan Fase 5): la búsqueda queda visible; los 6 filtros van a un
  // Popover clonado de client-list.tsx. Se aplican al instante (mismo
  // onChange que antes), sin borrador — los Selects ya no necesitan Aplicar.
  const filtrosActivos = Number(
    [local.categoria, local.etiqueta, local.autor, local.cliente, local.desde, local.hasta].filter(
      (v) => v !== "",
    ).length,
  );

  return (
    <section className="surface p-4 lg:p-5">
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
            className="h-10 pl-9 text-base md:text-[13px]"
          />
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="px-3.5 text-[13px] font-semibold text-ink-800"
              >
                <SlidersHorizontal className="size-4 text-ink-600" strokeWidth={1.8} />
                Filtros{" "}
                {filtrosActivos > 0 && (
                  <span className="ml-0.5 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-600">
                    {filtrosActivos}
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
                value={local.categoria}
                onValueChange={(v) => onChange({ categoria: v === "todos" ? "" : (v ?? "") })}
              >
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                <SelectTrigger className={cn(SELECT_CLASS)}>
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
                  className="h-10 min-w-0 flex-1 px-3 text-base md:text-[12.5px]"
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
                  className="h-10 min-w-0 flex-1 px-3 text-base md:text-[12.5px]"
                />
              </div>
            </div>

            {hasActiveFilters && (
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
      </div>
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
  onDropFiles,
  dropFolderName,
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
  /** Archivos soltados sobre el listado (S5): se suben a la carpeta abierta. */
  onDropFiles: (files: File[]) => void;
  dropFolderName: string | null;
}) {
  const items = query.data?.items ?? [];
  const isEmpty = !query.isLoading && items.length === 0;
  const [filesOver, setFilesOver] = useState(false);

  return (
    <section
      aria-label="Listado de documentos"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault();
        setFilesOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFilesOver(false);
      }}
      onDrop={(e) => {
        const files = droppedFiles(e);
        if (files.length === 0) return;
        e.preventDefault();
        setFilesOver(false);
        onDropFiles(files);
      }}
      className={cn("relative overflow-hidden surface", filesOver && "ring-2 ring-exito/50")}
    >
      {filesOver && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-exito-bg/85 text-center">
          <p className="px-6 text-[14px] font-semibold text-ink-900">
            {dropFolderName
              ? `Suelta los archivos para subirlos a «${dropFolderName}»`
              : "Suelta los archivos para subirlos al repositorio"}
          </p>
        </div>
      )}
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
            {/* Patrón C (plan Fase 5): min-w para que scrollee en vez de aplastarse */}
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-5">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={onTogglePage}
                      aria-label="Seleccionar todos los de la página"
                    />
                  </TableHead>
                  <TableHead>
                    Documento
                  </TableHead>
                  <TableHead>
                    Cliente
                  </TableHead>
                  <TableHead>
                    Versión activa
                  </TableHead>
                  <TableHead numeric className="sticky right-0 w-24 bg-panel">
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
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${DOC_DRAG_PREFIX}${doc.id}`,
  });
  return (
    <TableRow
      onClick={onOpen}
      className="group/fila cursor-pointer hover:bg-muted"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            aria-label={`Mover ${doc.titulo} a una carpeta`}
            title="Arrastra a una carpeta para moverlo"
            className={cn(
              "-ml-3 grid h-7 w-4 shrink-0 cursor-grab touch-none place-items-center rounded text-ink-400 hover:text-ink-700 active:cursor-grabbing",
              isDragging && "opacity-40",
            )}
          >
            <GripVertical className="size-3.5" strokeWidth={1.8} />
          </button>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Seleccionar ${doc.titulo}`}
          />
        </div>
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
          <div className="min-w-0 max-w-[260px] xl:max-w-[320px]">
            <div className="truncate text-[13.5px] font-semibold text-ink-950" title={doc.titulo}>
              {doc.titulo}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <ToneBadge tone="neutro" label={doc.categoria} />
              {etiquetasVisibles(doc.etiquetas, doc.categoria).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-[20px] items-center rounded-full bg-ink-100 px-2 text-[10.5px] font-medium text-ink-600"
                >
                  {tag}
                </span>
              ))}
              {etiquetasVisibles(doc.etiquetas, doc.categoria).length > 3 && (
                <span className="text-[10.5px] text-ink-500">
                  +{etiquetasVisibles(doc.etiquetas, doc.categoria).length - 3}
                </span>
              )}
            </div>
            {doc.match === "contenido" && (
              <div className="mt-1 space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-exito/10 px-2 py-0.5 text-[10.5px] font-bold text-exito">
                  Coincide en el contenido
                </span>
                {doc.snippet && (
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-600">
                    <SnippetText snippet={doc.snippet} />
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {doc.clientes[0] ? (
          <span
            className="line-clamp-1 max-w-[140px] text-[13px] font-medium text-ink-800 xl:max-w-[180px]"
            title={doc.clientes.map((c) => c.nombre).join(", ")}
          >
            {doc.clientes[0].nombre}
            {doc.clientes.length > 1 && ` · +${doc.clientes.length - 1}`}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-500">—</span>
        )}
      </TableCell>
      <TableCell>
        {activa ? (
          <span
            className="inline-block h-[24px] max-w-[260px] truncate rounded-full bg-ink-100 px-2.5 align-middle text-[11px] leading-[24px] font-semibold text-ink-700"
            title={`v${activa.numero_version} · ${formatVersionFecha(activa.created_at)} · ${activa.subido_por_nombre}`}
          >
            v{activa.numero_version} · {formatVersionFecha(activa.created_at)} ·{" "}
            {activa.subido_por_nombre}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-500">Sin versión</span>
        )}
      </TableCell>
      <TableCell className="sticky right-0 bg-panel pr-4 text-right group-hover/fila:bg-muted">
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
          className="px-2.5 text-[12.5px] font-semibold after:-inset-2"
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
                "min-w-8 px-2 text-[12.5px] font-bold after:-inset-2",
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
          className="px-2.5 text-[12.5px] font-semibold after:-inset-2"
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
        <Button onClick={onOpenUpload} className="mt-5 px-4 font-bold">
          <FileUp className="size-4" strokeWidth={1.9} />
          Subir documento
        </Button>
      </div>
    </div>
  );
}

/**
 * Snippet de la búsqueda FTS: ts_headline envuelve cada coincidencia con
 * StartSel=« / StopSel=». Acá se hace split sobre esos delimitadores y se
 * pinta <mark> — nunca dangerouslySetInnerHTML.
 */
export function SnippetText({ snippet }: { snippet: string }) {
  const parts = snippet.split(/[«»]/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-sm bg-exito/15 px-0.5 text-ink-900"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}