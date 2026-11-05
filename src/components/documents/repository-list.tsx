// Repositorio documental (PRD §6.2): listado con búsqueda y filtros
// (categoría, etiqueta, cliente, autor, rango de fecha), selección múltiple
// con descarga .zip (POST /documents/zip), ficha en diálogo y subida de
// documentos. Entrada SIEMPRE en la raíz limpia (decisión 2026-11-02: los
// deep-links con ?cliente ya no precargan filtros; el botón «Ver documentos»
// de la ficha del cliente navega al repositorio).
// Carpetas (S3–S5): "Subir documento" guarda en la carpeta abierta; "Carpeta
// de cliente" abre (o crea) la carpeta de un cliente; soltar archivos sobre
// el listado o sobre una carpeta los sube ahí; y un documento arrastrado de
// su asa a una carpeta se mueve (PATCH carpeta_id vía useMoveDocument).

"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileUp,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Presentation,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useUpdateFolder,
  type DocumentFilters,
  type DocumentItem,
  type FolderNode,
} from "@/hooks/documents";
import { ToneBadge } from "@/components/crm/shared";
import { DocumentDialog } from "@/components/documents/document-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-dialog";
import {
  FOLDER_DRAG_TYPE,
  FOLDER_DROP_PREFIX,
  ROOT_DROP_ID,
  useFolderDropTarget,
  type FolderAction,
} from "@/components/documents/folder-tree";
import {
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
  // Raíz del explorador: solo documentos sin carpeta (los archivados viven en
  // su carpeta). Con búsqueda activa se busca en todo el repositorio.
  if (!local.carpeta && !local.q.trim()) out.sin_carpeta = "1";
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

/** Lo mismo que folderPath, pero con ids para navegar desde el breadcrumb. */
function folderTrail(
  nodes: FolderNode[],
  id: string | null,
): { id: string; nombre: string }[] {
  if (!id) return [];
  for (const n of nodes) {
    if (n.id === id) return [{ id: n.id, nombre: n.nombre }];
    const child = folderTrail(n.hijos, id);
    if (child.length > 0) return [{ id: n.id, nombre: n.nombre }, ...child];
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
  const [local, setLocal] = useState<LocalFilters>(EMPTY_LOCAL);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [zipPending, setZipPending] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  // Historial de navegación del explorador (atrás/adelante del breadcrumb).
  const [folderHistory, setFolderHistory] = useState<{
    stack: (string | null)[];
    index: number;
  }>({ stack: [null], index: 0 });
  // Explorer 2026-11-02: documentos como iconos por tipo (grid) o tabla (lista).
  const [vistaDocs, setVistaDocs] = useState<"grid" | "lista">("grid");
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
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const moveDocument = useMoveDocument();
  const updateFolder = useUpdateFolder();
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

  const activeFolder = local.carpeta ? findFolder(folders, local.carpeta) : null;
  const trail = folderTrail(folders, local.carpeta || null);
  // Explorador: carpetas hijas de la carpeta abierta (en la raíz, las de primer nivel).
  const subfolders = activeFolder ? activeFolder.hijos : folders;

  // Guarda de movimientos de carpetas: el destino no puede estar dentro del
  // propio subárbol del origen (ciclo) ni repetir el padre actual.
  const canMoveFolder = useMemo(() => {
    const pathSets = new Map<string, Set<string>>();
    const parentOf = new Map<string, string | null>();
    const walk = (list: FolderNode[], ancestors: string[], parentId: string | null) => {
      for (const n of list) {
        parentOf.set(n.id, parentId);
        pathSets.set(n.id, new Set([...ancestors, n.id]));
        walk(n.hijos, [...ancestors, n.id], n.id);
      }
    };
    walk(folders, [], null);
    return (sourceId: string, targetId: string | null) => {
      if (sourceId === targetId) return false;
      if (targetId !== null && pathSets.get(targetId)?.has(sourceId)) return false;
      return parentOf.get(sourceId) !== targetId;
    };
  }, [folders]);

  function moverCarpeta(id: string, parentId: string | null) {
    void updateFolder.mutateAsync({ id, parent_id: parentId }).catch(() => {});
  }
  const uploadFolder = dropUpload
    ? dropUpload.folderId
      ? findFolder(folders, dropUpload.folderId)
      : null
    : activeFolder;

  /** Archivos soltados sobre una carpeta (o el listado): se suben ahí. */
  function handleDropFiles(folderId: string | null, files: File[]) {
    if (folderId !== (local.carpeta || null)) navigateFolder(folderId);
    setDropUpload({ files, folderId });
  }

  /** Entra a una carpeta (o raíz) dejando rastro para atrás/adelante. */
  function navigateFolder(id: string | null) {
    const stack = [...folderHistory.stack.slice(0, folderHistory.index + 1), id];
    setFolderHistory({ stack, index: stack.length - 1 });
    // La carpeta define su propio cliente: si la página venía con un filtro de
    // cliente (URL desde la ficha de otro cliente), arrastrarlo dejaba el
    // listado vacío al entrar a una carpeta de un cliente distinto.
    commit(id ? { carpeta: id, cliente: "" } : { carpeta: "" });
  }

  function goHistory(delta: number) {
    const index = folderHistory.index + delta;
    if (index < 0 || index >= folderHistory.stack.length) return;
    setFolderHistory({ ...folderHistory, index });
    commit({ carpeta: folderHistory.stack[index] ?? "" });
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
    // Con una carpeta abierta, todo lo listado ya está en ella: soltarlo ahí
    // no cambia nada (ni PATCH ni toast «Documento movido.»). En la raíz, soltar
    // sobre «Todas» tampoco cambia nada.
    if (carpetaId === (applied.carpeta || null)) return;
    moveDocument.mutate({ id: activeId.slice(DOC_DRAG_PREFIX.length), carpeta_id: carpetaId });
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      onDragOver={(event) => {
        // Red de seguridad: soltar archivos sobre un área vacía (p. ej. el grid
        // o el fondo) NO debe navegar fuera de la app; se abre el diálogo de
        // subida igual que sobre el listado.
        if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (event.defaultPrevented) return; // un destino más específico ya lo manejó
        const files = droppedFiles(event);
        if (files.length === 0) return;
        event.preventDefault();
        handleDropFiles(local.carpeta || null, files);
      }}
    >
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

      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Atrás"
          disabled={folderHistory.index === 0}
          onClick={() => goHistory(-1)}
          className="text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="size-4" strokeWidth={1.9} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Adelante"
          disabled={folderHistory.index >= folderHistory.stack.length - 1}
          onClick={() => goHistory(1)}
          className="text-ink-500 hover:text-ink-800"
        >
          <ArrowRight className="size-4" strokeWidth={1.9} />
        </Button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <FolderOpen className="size-4 shrink-0 text-ink-500" strokeWidth={1.8} />
        {local.q.trim() ? (
          <span className="font-semibold text-ink-800">Resultados de búsqueda</span>
        ) : (
          <nav
            aria-label="Ruta de carpetas"
            className="flex min-w-0 items-center gap-1 overflow-x-auto"
          >
            {trail.length === 0 ? (
              <RootDropTarget onMoveFolder={moverCarpeta} canMoveFolder={canMoveFolder}>
                <span className="shrink-0 font-semibold text-exito">Todas</span>
              </RootDropTarget>
            ) : (
              <>
                <RootDropTarget onMoveFolder={moverCarpeta} canMoveFolder={canMoveFolder}>
                  <button
                    type="button"
                    onClick={() => navigateFolder(null)}
                    aria-label="Ir a Todas"
                    className="shrink-0 font-semibold text-ink-600 hover:text-ink-800"
                  >
                    Todas
                  </button>
                </RootDropTarget>
                {trail.map((segmento, i) => {
                  const esActual = i === trail.length - 1;
                  return (
                    <span key={segmento.id} className="flex min-w-0 items-center gap-1">
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-ink-400"
                        strokeWidth={2}
                      />
                      {esActual ? (
                        <span className="truncate font-semibold text-ink-800">
                          {segmento.nombre}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigateFolder(segmento.id)}
                          className="truncate font-semibold text-ink-600 hover:text-ink-800"
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
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggedDoc(null)}
      >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateFolderOpen(true)}
              className="px-2.5 text-[12.5px] font-semibold text-ink-800"
            >
              <FolderPlus className="size-3.5 text-exito" strokeWidth={1.9} />
              Nueva carpeta
            </Button>
            <div className="flex items-center rounded-12 border border-border-strong" role="group" aria-label="Vista de documentos">
              <Button
                type="button"
                variant={vistaDocs === "grid" ? "secondary" : "ghost"}
                size="sm"
                aria-label="Vista cuadrícula"
                aria-pressed={vistaDocs === "grid"}
                onClick={() => setVistaDocs("grid")}
                className="rounded-r-none px-2.5"
              >
                <LayoutGrid className="size-4" strokeWidth={1.9} />
              </Button>
              <Button
                type="button"
                variant={vistaDocs === "lista" ? "secondary" : "ghost"}
                size="sm"
                aria-label="Vista lista"
                aria-pressed={vistaDocs === "lista"}
                onClick={() => setVistaDocs("lista")}
                className="rounded-l-none px-2.5"
              >
                <List className="size-4" strokeWidth={1.9} />
              </Button>
            </div>
          </div>
        </div>

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
          ) : vistaDocs === "grid" ? (
            <DocumentsGridCard
              query={listQuery}
              page={page}
              totalPages={totalPages}
              desde={desde}
              hasta={hasta}
              total={total}
              folders={local.q.trim() ? [] : subfolders}
              onOpenFolder={navigateFolder}
              onFolderAction={(id, action) => setFolderAction({ id, action })}
              onFolderDropFiles={handleDropFiles}
              onFolderMove={moverCarpeta}
              canMoveFolder={canMoveFolder}
              onPage={setPage}
              onOpenFicha={setFichaId}
              onOpenUpload={() => setUploadOpen(true)}
            />
          ) : (
            <DocumentsTableCard
              query={listQuery}
              page={page}
              totalPages={totalPages}
              desde={desde}
              hasta={hasta}
              total={total}
              folders={local.q.trim() ? [] : subfolders}
              onOpenFolder={navigateFolder}
              onFolderAction={(id, action) => setFolderAction({ id, action })}
              onFolderDropFiles={handleDropFiles}
              onFolderMove={moverCarpeta}
              canMoveFolder={canMoveFolder}
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
      <DocumentDialog documentId={fichaId} onClose={() => setFichaId(null)} />
      {createFolderOpen && (
        <CreateFolderDialog
          open
          onOpenChange={setCreateFolderOpen}
          defaultParentId={local.carpeta || null}
          folders={folders}
          clientes={clientes}
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

/* ── Explorer: icono según el tipo de documento ────────────────────────── */

function documentFileMeta(doc: DocumentItem): {
  Icon: typeof File;
  className: string;
  label: string;
} {
  const ext = (doc.titulo.split(".").pop() ?? "").toLowerCase();
  const mime = doc.version_activa?.tipo_archivo ?? "";
  if (mime.includes("pdf") || ext === "pdf")
    return { Icon: FileText, className: "text-rose-600", label: "PDF" };
  if (mime.includes("word") || ["doc", "docx", "rtf", "odt"].includes(ext))
    return { Icon: FileType, className: "text-sky-600", label: "DOC" };
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx", "csv", "ods"].includes(ext))
    return { Icon: FileSpreadsheet, className: "text-emerald-600", label: "XLS" };
  if (mime.includes("presentation") || mime.includes("powerpoint") || ["ppt", "pptx", "odp"].includes(ext))
    return { Icon: Presentation, className: "text-orange-500", label: "PPT" };
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { Icon: FileImage, className: "text-violet-500", label: "IMG" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return { Icon: FileArchive, className: "text-amber-600", label: "ZIP" };
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return { Icon: FileVideo, className: "text-indigo-500", label: "VID" };
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext))
    return { Icon: FileAudio, className: "text-pink-500", label: "AUD" };
  return { Icon: File, className: "text-ink-500", label: "FILE" };
}

/* ── Explorer: tile de carpeta (clic derecho + arrastrar/soltar) ───────── */

function FolderTile({
  node,
  onOpen,
  onAction,
  onDropFiles,
  onMoveFolder,
  canMoveFolder,
}: {
  node: FolderNode;
  onOpen: () => void;
  onAction: (action: FolderAction) => void;
  onDropFiles: (folderId: string | null, files: File[]) => void;
  onMoveFolder: (folderId: string, targetId: string | null) => void;
  canMoveFolder: (sourceId: string, targetId: string | null) => boolean;
}) {
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    node.id,
    onDropFiles,
    onMoveFolder,
    canMoveFolder,
  );

  return (
    <ContextMenu>
      <div className="group relative">
        <ContextMenuTrigger className="contents">
          <div
            ref={setNodeRef}
            {...handlers}
            className={cn("rounded-12", isOver && "bg-exito-bg ring-2 ring-exito/50")}
          >
            <button
              type="button"
              onClick={onOpen}
              draggable
              onDragStart={(event) => {
                if (!event.dataTransfer) return;
                event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              className="flex w-full cursor-grab flex-col items-center gap-1 rounded-12 px-2 py-3 text-center transition-colors hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
            >
              <Folder
                className="size-10 text-amber-400 transition-colors group-hover:text-amber-500"
                strokeWidth={1.3}
              />
              <span className="line-clamp-2 w-full text-[12px] font-semibold text-ink-800">
                {node.nombre}
              </span>
              <span className="text-[10.5px] tracking-wide text-ink-500">
                {node.documentos_count} doc{node.documentos_count === 1 ? "" : "s"}
              </span>
            </button>
          </div>
        </ContextMenuTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Acciones de ${node.nombre}`}
                className="absolute top-0 right-0 text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-transparent hover:text-ink-800 focus-visible:opacity-100"
              >
                <MoreHorizontal className="size-3.5" strokeWidth={2} />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-[150px]">
            <DropdownMenuItem onClick={() => onAction("rename")}>
              <Pencil className="size-3.5" strokeWidth={1.9} />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("move")}>
              <Folder className="size-3.5" strokeWidth={1.9} />
              Mover…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onAction("delete")}>
              <Trash2 className="size-3.5" strokeWidth={1.9} />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-52 truncate">{node.nombre}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onAction("rename")}>
          <Pencil className="size-3.5" strokeWidth={1.9} />
          Renombrar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAction("move")}>
          <Folder className="size-3.5" strokeWidth={1.9} />
          Mover…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onAction("delete")}>
          <Trash2 className="size-3.5" strokeWidth={1.9} />
          Eliminar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── Explorer: documentos como iconos por tipo ─────────────────────────── */

function GridDocTile({ doc, onOpen }: { doc: DocumentItem; onOpen: () => void }) {
  const meta = documentFileMeta(doc);
  const Icon = meta.Icon;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${DOC_DRAG_PREFIX}${doc.id}`,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      title={doc.titulo}
      className={cn(
        "flex w-full cursor-grab flex-col items-center gap-1 rounded-12 px-2 py-3 text-center transition-colors hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Icon className={cn("size-10", meta.className)} strokeWidth={1.3} />
      <span className="line-clamp-2 w-full text-[12px] font-semibold text-ink-800">
        {doc.titulo}
      </span>
      <span className="text-[10.5px] tracking-wide text-ink-500">{meta.label}</span>
    </button>
  );
}

function RootDropTarget({
  onMoveFolder,
  canMoveFolder,
  children,
}: {
  onMoveFolder: (folderId: string, targetId: string | null) => void;
  canMoveFolder: (sourceId: string, targetId: string | null) => boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    null,
    undefined,
    onMoveFolder,
    canMoveFolder,
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

function DocumentsGridCard({
  query,
  page,
  totalPages,
  desde,
  hasta,
  total,
  folders,
  onOpenFolder,
  onFolderAction,
  onFolderDropFiles,
  onFolderMove,
  canMoveFolder,
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
  folders: FolderNode[];
  onOpenFolder: (id: string) => void;
  onFolderAction: (id: string, action: FolderAction) => void;
  onFolderDropFiles: (folderId: string | null, files: File[]) => void;
  onFolderMove: (folderId: string, targetId: string | null) => void;
  canMoveFolder: (sourceId: string, targetId: string | null) => boolean;
  onPage: (p: number) => void;
  onOpenFicha: (id: string) => void;
  onOpenUpload: () => void;
}) {
  const items = query.data?.items ?? [];

  return (
    <section aria-label="Documentos" className="surface overflow-hidden">
      {folders.length > 0 && (
        <ul
          aria-label="Subcarpetas"
          className="grid grid-cols-2 gap-2 border-b border-ink-200 px-4 py-4 sm:grid-cols-4 lg:grid-cols-6"
        >
          {folders.map((n) => (
            <li key={n.id}>
              <FolderTile
                node={n}
                onOpen={() => onOpenFolder(n.id)}
                onAction={(action) => onFolderAction(n.id, action)}
                onDropFiles={onFolderDropFiles}
                onMoveFolder={onFolderMove}
                canMoveFolder={canMoveFolder}
              />
            </li>
          ))}
        </ul>
      )}
      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-inner" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyDocuments onOpenUpload={onOpenUpload} />
      ) : (
        <>
          <ul
            aria-label="Documentos"
            className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6"
          >
            {items.map((doc) => (
              <li key={doc.id}>
                <GridDocTile doc={doc} onOpen={() => onOpenFicha(doc.id)} />
              </li>
            ))}
          </ul>
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

function DocumentsTableCard({
  query,
  page,
  totalPages,
  desde,
  hasta,
  total,
  folders,
  onOpenFolder,
  onFolderAction,
  onFolderDropFiles,
  onFolderMove,
  canMoveFolder,
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
  folders: FolderNode[];
  onOpenFolder: (id: string) => void;
  onFolderAction: (id: string, action: FolderAction) => void;
  onFolderDropFiles: (folderId: string | null, files: File[]) => void;
  onFolderMove: (folderId: string, targetId: string | null) => void;
  canMoveFolder: (sourceId: string, targetId: string | null) => boolean;
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
      {folders.length > 0 && (
        <ul
          aria-label="Subcarpetas"
          className="grid grid-cols-2 gap-2 border-b border-ink-200 px-4 py-4 sm:grid-cols-4 lg:grid-cols-6"
        >
          {folders.map((n) => (
            <li key={n.id}>
              <FolderTile
                node={n}
                onOpen={() => onOpenFolder(n.id)}
                onAction={(action) => onFolderAction(n.id, action)}
                onDropFiles={onFolderDropFiles}
                onMoveFolder={onFolderMove}
                canMoveFolder={canMoveFolder}
              />
            </li>
          ))}
        </ul>
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