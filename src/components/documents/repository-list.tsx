// Repositorio documental (PRD §6.2), explorador clásico (S1): rail con el
// árbol de carpetas junto al panel de contenido (barra con ruta, búsqueda,
// Filtros, orden y vista; chips de filtros activos; tabla por defecto o
// cuadrícula). Pestañas Documentos · Papelera · Actividad según el rol (S7).
// Entrada SIEMPRE en la raíz limpia (decisión 2026-11-02: los deep-links con
// ?cliente ya no precargan filtros).
// Carpetas (S3–S5): "Subir documento" guarda en la carpeta abierta; soltar
// archivos sobre el listado o sobre una carpeta los sube ahí; un documento
// arrastrado de su asa a una carpeta se mueve (useMoveDocument) y las carpetas
// se arrastran entre sí (useUpdateFolder, con guarda de ciclos).
// Acciones por documento (S4) y en lote (S5) reutilizan los endpoints por
// documento; lo que la API rechazaría para el rol se oculta o deshabilita (S10).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { FileUp, FolderPlus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUsers } from "@/hooks/crm";
import { useClientOptions, useCurrentUser } from "@/hooks/kanban";
import {
  downloadActiveVersion,
  downloadSelectionZip,
  useDocCategories,
  useDocuments,
  useFolders,
  useMoveDocument,
  useTrashDocument,
  useUpdateDocument,
  useUpdateFolder,
  type DocumentFilters,
  type DocumentItem,
  type DocumentOrder,
  type FolderNode,
} from "@/hooks/documents";
import { DocumentDialog, VersionUploadDialog } from "@/components/documents/document-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-dialog";
import {
  FolderTree,
  parseFolderDropId,
  type FolderAction,
} from "@/components/documents/folder-tree";
import {
  CreateFolderDialog,
  DeleteFolderDialog,
  MoveFolderDialog,
  RenameFolderDialog,
} from "@/components/documents/folder-dialogs";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";
import { DocumentsGrid, type FolderHandlers } from "@/components/documents/document-grid";
import { DocumentsTable } from "@/components/documents/document-table";
import { DOC_DRAG_PREFIX, PaginationFooter, droppedFiles } from "@/components/documents/document-shared";
import {
  EMPTY_FILTER_FIELDS,
  ExplorerToolbar,
  FilterChips,
  type FilterFields,
} from "@/components/documents/repository-toolbar";
import { BulkBar } from "@/components/documents/bulk-bar";
import {
  BulkCategoryDialog,
  ConfirmTrashDialog,
  EditDocumentDialog,
  MoveDocumentsDialog,
  type EditDocumentPatch,
  type EditFocus,
} from "@/components/documents/document-action-dialogs";
import type { DocumentAction } from "@/components/documents/document-row-menu";
import {
  canSeeActivity,
  canSeeTrash,
  canUseRestrictedCategories,
  canWriteDocument,
} from "@/components/documents/document-permissions";
import { TrashTab } from "@/components/documents/trash-tab";
import { ActivityTab } from "@/components/documents/activity-tab";

export { SnippetText } from "@/components/documents/snippet-text";

// True when the Supabase env vars are missing (dev-only signal): the API
// returns 500 "Plataforma no configurada" — show the technical card.
const unconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PAGE_SIZE = 25;
const DEFAULT_ORDER: DocumentOrder = "reciente";

type LocalFilters = FilterFields & { q: string; carpeta: string };

const EMPTY_LOCAL: LocalFilters = { ...EMPTY_FILTER_FIELDS, q: "", carpeta: "" };

type Tab = "documentos" | "papelera" | "actividad";

/** Diálogo de acción abierto sobre uno o varios documentos (S4, S5). */
type DocDialog =
  | { kind: "edit"; doc: DocumentItem; focus: EditFocus }
  | { kind: "version"; doc: DocumentItem }
  | { kind: "move" | "trash" | "category"; docs: DocumentItem[]; bulk: boolean };

function toFilters(local: LocalFilters, page: number, orden: DocumentOrder): DocumentFilters {
  const out: DocumentFilters = { page, limit: PAGE_SIZE };
  const q = local.q.trim();
  if (q) out.q = q;
  if (local.categoria) out.categoria = local.categoria;
  if (local.etiqueta) out.etiqueta = local.etiqueta;
  if (local.autor) out.autor = local.autor;
  if (local.cliente) out.cliente = local.cliente;
  // Con búsqueda activa se ignora la carpeta (comportamiento de Drive): buscar
  // dentro de una sola carpeta es inútil cuando no sabés dónde está el archivo.
  if (local.carpeta && !q) out.carpeta = local.carpeta;
  // Raíz del explorador: solo documentos sin carpeta (los archivados viven en
  // su carpeta). Con búsqueda activa se busca en todo el repositorio.
  if (!local.carpeta && !q) out.sin_carpeta = "1";
  if (local.desde) out.desde = local.desde;
  if (local.hasta) out.hasta = local.hasta;
  if (orden !== DEFAULT_ORDER) out.orden = orden;
  return out;
}

/** Lo mismo que folderPath, pero con ids para navegar desde el breadcrumb. */
function folderTrail(nodes: FolderNode[], id: string | null): { id: string; nombre: string }[] {
  if (!id) return [];
  for (const n of nodes) {
    if (n.id === id) return [{ id: n.id, nombre: n.nombre }];
    const child = folderTrail(n.hijos, id);
    if (child.length > 0) return [{ id: n.id, nombre: n.nombre }, ...child];
  }
  return [];
}

function findFolder(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findFolder(n.hijos, id);
    if (child) return child;
  }
  return null;
}

/** "3 de 4 movidos; 1 sin permiso; 0 con error" (S5). */
function bulkSummary(ok: number, total: number, verbo: string, denied: number, failed: number) {
  const parts = [`${ok} de ${total} ${verbo}`];
  if (denied > 0) parts.push(`${denied} sin permiso`);
  if (failed > 0) parts.push(`${failed} con error`);
  return parts.join("; ");
}

export function RepositoryList() {
  const [local, setLocal] = useState<LocalFilters>(EMPTY_LOCAL);
  const [orden, setOrden] = useState<DocumentOrder>(DEFAULT_ORDER);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, DocumentItem>>(new Map());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [zipPending, setZipPending] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("documentos");
  // Historial de navegación del explorador (atrás/adelante del breadcrumb).
  const [folderHistory, setFolderHistory] = useState<{
    stack: (string | null)[];
    index: number;
  }>({ stack: [null], index: 0 });
  // S1: la tabla (lista) es la vista por defecto; la cuadrícula sigue disponible.
  const [vistaDocs, setVistaDocs] = useState<"grid" | "lista">("lista");
  // Archivos soltados (S5) y la carpeta destino; abre el diálogo de subida.
  const [dropUpload, setDropUpload] = useState<{
    files: File[];
    folderId: string | null;
  } | null>(null);
  const [draggedDoc, setDraggedDoc] = useState<DocumentItem | null>(null);
  const [folderAction, setFolderAction] = useState<{ id: string; action: FolderAction } | null>(
    null,
  );
  const [docDialog, setDocDialog] = useState<DocDialog | null>(null);

  const applied = toFilters(local, page, orden);
  const listQuery = useDocuments(applied);
  const usersQuery = useUsers();
  const clientsQuery = useClientOptions();
  const foldersQuery = useFolders();
  const categoriesQuery = useDocCategories();
  const user = useCurrentUser().data;
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const moveDocument = useMoveDocument();
  const updateDocument = useUpdateDocument();
  // Batch operations report one summary toast (runBatch), so their hooks stay silent.
  const batchMove = useMoveDocument({ silent: true });
  const batchUpdate = useUpdateDocument({ silent: true });
  const batchTrash = useTrashDocument({ silent: true });
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

  /** Limpia los filtros del popover/chips; conserva carpeta y búsqueda. */
  function clearFilters() {
    commit({ ...EMPTY_FILTER_FIELDS });
  }

  const personas = usersQuery.data ?? [];
  const clientes = clientsQuery.data ?? [];
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);
  const searching = local.q.trim() !== "";

  const restricted = useMemo(
    () => new Set((categoriesQuery.data ?? []).filter((c) => c.restringida).map((c) => c.nombre)),
    [categoriesQuery.data],
  );
  const canWrite = (doc: DocumentItem) => canWriteDocument(user, doc);
  const allowRestricted = canUseRestrictedCategories(user);

  // El filtro de etiqueta se arma con las etiquetas de la página cargada
  // (limitación pragmática: no hay endpoint de etiquetas único).
  const etiquetaOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const doc of items) for (const tag of doc.etiquetas) tags.add(tag);
    return [...tags].sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const allPageSelected = items.length > 0 && items.every((d) => selected.has(d.id));
  const selectedDocs = [...selected.values()];

  function togglePage() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allPageSelected) for (const d of items) next.delete(d.id);
      else for (const d of items) next.set(d.id, d);
      return next;
    });
  }

  function toggleOne(doc: DocumentItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.set(doc.id, doc);
      return next;
    });
  }

  async function descargarSeleccion() {
    if (selected.size === 0 || zipPending) return;
    setZipPending(true);
    try {
      await downloadSelectionZip([...selected.keys()]);
      setSelected(new Map());
    } catch {
      /* los toasts los lanzan los helpers */
    } finally {
      setZipPending(false);
    }
  }

  const activeFolder = local.carpeta ? findFolder(folders, local.carpeta) : null;
  const trail = folderTrail(folders, local.carpeta || null);
  // Carpetas hijas de la carpeta abierta (en la raíz, las de primer nivel).
  const subfolders = searching ? [] : activeFolder ? activeFolder.hijos : folders;
  /** Carpeta en la que está todo lo listado (desconocida con búsqueda activa). */
  const listingFolder: string | null | undefined = searching ? undefined : local.carpeta || null;

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
    if (id === (local.carpeta || null) && !searching) return;
    const stack = [...folderHistory.stack.slice(0, folderHistory.index + 1), id];
    setFolderHistory({ stack, index: stack.length - 1 });
    // La carpeta define su propio cliente: arrastrar un filtro de cliente
    // dejaba el listado vacío al entrar a la carpeta de otro cliente. Navegar
    // también sale de la búsqueda (el rail sigue visible mientras se busca).
    commit(id ? { carpeta: id, cliente: "", q: "" } : { carpeta: "", q: "" });
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

  /** Documento soltado sobre una carpeta (rail, ruta o contenido; "Todas" = raíz). */
  function handleDragEnd(event: DragEndEvent) {
    setDraggedDoc(null);
    const activeId = String(event.active.id);
    if (!activeId.startsWith(DOC_DRAG_PREFIX) || !event.over) return;
    const carpetaId = parseFolderDropId(String(event.over.id));
    if (carpetaId === undefined) return;
    // Con una carpeta abierta, todo lo listado ya está en ella: soltarlo ahí
    // no cambia nada (ni PATCH ni toast «Documento movido.»). En la raíz, soltar
    // sobre «Todas» tampoco cambia nada.
    if (carpetaId === (applied.carpeta || null)) return;
    moveDocument.mutate({ id: activeId.slice(DOC_DRAG_PREFIX.length), carpeta_id: carpetaId });
  }

  /* ── Acciones por documento (S4) ─────────────────────────────────────── */

  function handleDocAction(doc: DocumentItem, action: DocumentAction) {
    switch (action) {
      case "open":
        setFichaId(doc.id);
        return;
      case "download":
        void downloadActiveVersion(doc).catch(() => undefined);
        return;
      case "version":
        setDocDialog({ kind: "version", doc });
        return;
      case "rename":
        setDocDialog({ kind: "edit", doc, focus: "titulo" });
        return;
      case "edit":
        setDocDialog({ kind: "edit", doc, focus: "categoria" });
        return;
      case "clients":
        setDocDialog({ kind: "edit", doc, focus: "clientes" });
        return;
      case "move":
      case "trash":
        setDocDialog({ kind: action, docs: [doc], bulk: false });
    }
  }

  async function saveEdit(doc: DocumentItem, patch: EditDocumentPatch) {
    if (Object.keys(patch).length === 0) {
      setDocDialog(null);
      return;
    }
    try {
      await updateDocument.mutateAsync({ id: doc.id, ...patch });
    } catch {
      return; /* el hook muestra el error; el diálogo sigue abierto */
    }
    setDocDialog(null);
  }

  /**
   * Corre una operación por documento (reutiliza los endpoints individuales),
   * omite los que el rol no puede modificar y resume el resultado (S5).
   */
  async function runBatch(
    docs: DocumentItem[],
    verbo: string,
    op: (doc: DocumentItem) => Promise<unknown>,
  ) {
    const permitidos = docs.filter(canWrite);
    const denied = docs.length - permitidos.length;
    const fallidos: DocumentItem[] = [];
    setBulkBusy(true);
    try {
      for (const doc of permitidos) {
        try {
          await op(doc);
        } catch {
          fallidos.push(doc);
        }
      }
    } finally {
      setBulkBusy(false);
    }
    const ok = permitidos.length - fallidos.length;
    if (docs.length > 1) {
      const message = bulkSummary(ok, docs.length, verbo, denied, fallidos.length);
      if (ok === docs.length) toast.success(message);
      else if (ok > 0) toast.warning(message);
      else toast.error(message);
    }
    // Éxito: se limpia la selección; con fallos quedan seleccionados los que
    // fallaron para reintentar.
    setSelected((prev) => {
      const next = new Map(prev);
      for (const doc of docs) next.delete(doc.id);
      for (const doc of fallidos) next.set(doc.id, doc);
      return next;
    });
    return { ok, fallidos };
  }

  async function confirmMove(docs: DocumentItem[], carpetaId: string | null) {
    // Lo listado ya está en la carpeta abierta: moverlo ahí no cambia nada.
    if (carpetaId === listingFolder) {
      setDocDialog(null);
      return;
    }
    const { fallidos } = await runBatch(docs, "movidos", (doc) =>
      batchMove.mutateAsync({ id: doc.id, carpeta_id: carpetaId }),
    );
    if (docs.length > 1 || fallidos.length === 0) setDocDialog(null);
  }

  async function confirmCategory(docs: DocumentItem[], categoria: string) {
    await runBatch(docs, "actualizados", (doc) =>
      doc.categoria === categoria
        ? Promise.resolve()
        : batchUpdate.mutateAsync({ id: doc.id, categoria }),
    );
    setDocDialog(null);
  }

  async function confirmTrash(docs: DocumentItem[]) {
    await runBatch(docs, "enviados a la papelera", (doc) => batchTrash.mutateAsync(doc.id));
    setDocDialog(null);
  }

  /* ── Pestañas visibles según el rol (S7) ─────────────────────────────── */

  const tabs: { value: Tab; label: string }[] = [
    { value: "documentos", label: "Documentos" },
    ...(canSeeTrash(user) ? [{ value: "papelera" as const, label: "Papelera" }] : []),
    ...(canSeeActivity(user) ? [{ value: "actividad" as const, label: "Actividad" }] : []),
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "documentos";

  const folderHandlers: FolderHandlers = {
    onOpenFolder: navigateFolder,
    onFolderAction: (id, action) => setFolderAction({ id, action }),
    onFolderDropFiles: handleDropFiles,
    onFolderMove: moverCarpeta,
    canMoveFolder,
  };

  const footer = (
    <PaginationFooter
      page={page}
      totalPages={totalPages}
      desde={desde}
      hasta={hasta}
      total={total}
      onPage={setPage}
      prefix={
        subfolders.length > 0
          ? `${subfolders.length} ${subfolders.length === 1 ? "carpeta" : "carpetas"} · `
          : undefined
      }
    />
  );

  const writableSelected = selectedDocs.filter(canWrite).length;

  const explorer = (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedDoc(null)}
    >
      <section aria-label="Explorador de documentos" className="surface min-w-0 overflow-hidden">
        <ExplorerToolbar
          canBack={folderHistory.index > 0}
          canForward={folderHistory.index < folderHistory.stack.length - 1}
          onBack={() => goHistory(-1)}
          onForward={() => goHistory(1)}
          searching={searching}
          trail={trail}
          onNavigate={navigateFolder}
          onMoveFolder={moverCarpeta}
          canMoveFolder={canMoveFolder}
          q={local.q}
          onQ={(q) => commit({ q })}
          searchPlaceholder="Buscar por nombre, contenido, etiqueta…"
          fields={local}
          personas={personas}
          clientes={clientes}
          etiquetaOptions={etiquetaOptions}
          onFilters={commit}
          onClearFilters={clearFilters}
          orden={orden}
          onOrden={(next) => {
            setOrden(next);
            setPage(1);
          }}
          vista={vistaDocs}
          onVista={setVistaDocs}
        />
        <FilterChips
          fields={local}
          personas={personas}
          clientes={clientes}
          onChange={commit}
          onClear={clearFilters}
        />
        {vistaDocs === "lista" && selected.size > 0 && (
          <BulkBar
            count={selected.size}
            writableCount={writableSelected}
            zipPending={zipPending}
            busy={bulkBusy}
            onMove={() => setDocDialog({ kind: "move", docs: selectedDocs, bulk: true })}
            onCategory={() => setDocDialog({ kind: "category", docs: selectedDocs, bulk: true })}
            onZip={() => void descargarSeleccion()}
            onTrash={() => setDocDialog({ kind: "trash", docs: selectedDocs, bulk: true })}
            onCancel={() => setSelected(new Map())}
          />
        )}
        <div className="flex min-w-0 flex-col lg:min-h-[480px] lg:flex-row">
          <aside
            aria-label="Árbol de carpetas"
            className="max-h-56 shrink-0 overflow-y-auto border-b border-ink-200 bg-ink-100/30 px-2.5 py-3 lg:max-h-none lg:w-60 lg:border-r lg:border-b-0"
          >
            <FolderTree
              folders={folders}
              activeId={local.carpeta || null}
              onSelect={navigateFolder}
              onAction={(id, action) => setFolderAction({ id, action })}
              onDropFiles={handleDropFiles}
              onMoveFolder={moverCarpeta}
            />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            {listQuery.isError ? (
              <div className="p-4">
                <SinConexionCard
                  unconfigured={unconfigured}
                  onRetry={() => void listQuery.refetch()}
                />
              </div>
            ) : vistaDocs === "grid" ? (
              <DocumentsGrid
                isLoading={listQuery.isLoading}
                items={items}
                folders={subfolders}
                folderHandlers={folderHandlers}
                onOpenFicha={setFichaId}
                onOpenUpload={() => setUploadOpen(true)}
                footer={footer}
              />
            ) : (
              <DocumentsTable
                isLoading={listQuery.isLoading}
                items={items}
                folders={subfolders}
                folderHandlers={folderHandlers}
                selectedIds={selectedIds}
                allPageSelected={allPageSelected}
                onTogglePage={togglePage}
                onToggleOne={toggleOne}
                restricted={restricted}
                canWrite={canWrite}
                onDocAction={handleDocAction}
                onOpenUpload={() => setUploadOpen(true)}
                onDropFiles={(files) => handleDropFiles(local.carpeta || null, files)}
                dropFolderName={activeFolder?.nombre ?? null}
                orden={orden}
                footer={footer}
              />
            )}
          </div>
        </div>
      </section>
      <DragOverlay dropAnimation={null}>
        {draggedDoc ? (
          <div className="inline-flex max-w-[280px] items-center gap-2 rounded-12 border border-ink-200 bg-panel px-3 py-2 text-[13px] font-semibold text-ink-900 shadow-lg">
            <GripVertical className="size-4 shrink-0 text-ink-400" strokeWidth={1.8} />
            <span className="truncate">{draggedDoc.titulo}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div
      className="flex min-w-0 flex-col gap-4"
      onDragOver={(event) => {
        // Red de seguridad: soltar archivos sobre un área vacía NO debe navegar
        // fuera de la app; se abre el diálogo de subida igual que en el listado.
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
        <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-ink-600">
          Archivos versionados de la organización, organizados por cliente y carpeta.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateFolderOpen(true)}
            className="px-3.5 text-[13px] font-semibold text-ink-800"
          >
            <FolderPlus className="size-4" strokeWidth={1.9} />
            Nueva carpeta
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="px-4 font-bold">
            <FileUp className="size-4" strokeWidth={1.9} />
            Subir documento
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 gap-4">
        {tabs.length > 1 && (
          <TabsList
            aria-label="Secciones del repositorio"
            className="h-auto w-full justify-start gap-1 overflow-x-auto border-b border-ink-200 pb-1.5"
          >
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-none px-3 text-[14px]">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <TabsContent value="documentos" className="min-w-0">
          {explorer}
        </TabsContent>
        {canSeeTrash(user) && (
          <TabsContent value="papelera" className="min-w-0">
            <TrashTab user={user} />
          </TabsContent>
        )}
        {canSeeActivity(user) && (
          <TabsContent value="actividad" className="min-w-0">
            <ActivityTab />
          </TabsContent>
        )}
      </Tabs>

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

      {docDialog?.kind === "edit" && (
        <EditDocumentDialog
          key={docDialog.doc.id}
          doc={docDialog.doc}
          focus={docDialog.focus}
          clientes={clientes}
          allowRestricted={allowRestricted}
          pending={updateDocument.isPending}
          onOpenChange={(open) => !open && setDocDialog(null)}
          onSubmit={(patch) => void saveEdit(docDialog.doc, patch)}
        />
      )}
      {docDialog?.kind === "version" && (
        <VersionUploadDialog
          documentId={docDialog.doc.id}
          open
          onOpenChange={(open) => !open && setDocDialog(null)}
          proximaVersion={(docDialog.doc.version_activa?.numero_version ?? 0) + 1}
        />
      )}
      {docDialog?.kind === "move" && (
        <MoveDocumentsDialog
          count={docDialog.docs.length}
          titulo={docDialog.bulk ? undefined : docDialog.docs[0]?.titulo}
          folders={folders}
          pending={bulkBusy}
          onOpenChange={(open) => !open && setDocDialog(null)}
          onConfirm={(carpetaId) => void confirmMove(docDialog.docs, carpetaId)}
        />
      )}
      {docDialog?.kind === "category" && (
        <BulkCategoryDialog
          count={docDialog.docs.length}
          allowRestricted={allowRestricted}
          pending={bulkBusy}
          onOpenChange={(open) => !open && setDocDialog(null)}
          onConfirm={(categoria) => void confirmCategory(docDialog.docs, categoria)}
        />
      )}
      {docDialog?.kind === "trash" && (
        <ConfirmTrashDialog
          count={docDialog.docs.length}
          titulo={docDialog.bulk ? undefined : docDialog.docs[0]?.titulo}
          pending={bulkBusy}
          onOpenChange={(open) => !open && setDocDialog(null)}
          onConfirm={() => void confirmTrash(docDialog.docs)}
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
