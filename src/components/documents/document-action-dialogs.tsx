// Diálogos de acciones sobre documentos (S4, S5): "Editar documento" (título,
// categoría, etiquetas y clientes vía PATCH /documents/:id), el selector de
// carpeta de "Mover a…", "Cambiar categoría" en lote y la confirmación de
// envío a la papelera.

"use client";

import { useState } from "react";
import { FolderInput, LoaderCircle, Pencil, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOC_CATEGORIES } from "@/lib/catalogs";
import { useDocCategories, type DocumentItem, type FolderNode } from "@/hooks/documents";
import { EtiquetasInput } from "@/components/documents/upload-dialog";
import { flattenFolderOptions } from "@/components/documents/folder-dialogs";

const DIALOG_CLASS = "sm:max-w-[min(480px,calc(100%-2rem))]";
const FIELD_CLASS = "h-10 w-full px-3 text-base md:text-[13px]";

/** Categorías del catálogo en vivo; sin permiso, las restringidas se ocultan. */
function useCategoryOptions(allowRestricted: boolean, keep?: string): string[] {
  const query = useDocCategories();
  const catalog = query.data ?? DOC_CATEGORIES.map((nombre) => ({ nombre, restringida: false }));
  const names = catalog
    .filter((c) => allowRestricted || !c.restringida || c.nombre === keep)
    .map((c) => c.nombre);
  if (keep && !names.includes(keep)) names.unshift(keep);
  return names;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/* ── Editar documento ──────────────────────────────────────────────────── */

export type EditDocumentPatch = {
  titulo?: string;
  categoria?: string;
  etiquetas?: string[];
  cliente_ids?: string[];
};

export type EditFocus = "titulo" | "categoria" | "clientes";

export function EditDocumentDialog({
  doc,
  focus,
  clientes,
  allowRestricted,
  pending,
  onOpenChange,
  onSubmit,
}: {
  doc: DocumentItem;
  focus: EditFocus;
  clientes: { id: string; nombre: string }[];
  allowRestricted: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe solo los campos que cambiaron; vacío = nada que guardar. */
  onSubmit: (patch: EditDocumentPatch) => void;
}) {
  const [titulo, setTitulo] = useState(doc.titulo);
  const [categoria, setCategoria] = useState(doc.categoria);
  const [etiquetas, setEtiquetas] = useState<string[]>(doc.etiquetas);
  const [clienteIds, setClienteIds] = useState<string[]>(doc.cliente_ids);
  const categories = useCategoryOptions(allowRestricted, doc.categoria);
  const nombreCliente = (id: string) =>
    clientes.find((c) => c.id === id)?.nombre ??
    doc.clientes.find((c) => c.id === id)?.nombre ??
    "Cliente";
  const disponibles = clientes.filter((c) => !clienteIds.includes(c.id));
  const tituloLimpio = titulo.trim();

  function submit() {
    const patch: EditDocumentPatch = {};
    if (tituloLimpio !== doc.titulo) patch.titulo = tituloLimpio;
    if (categoria !== doc.categoria) patch.categoria = categoria;
    if (!sameSet(etiquetas, doc.etiquetas)) patch.etiquetas = etiquetas;
    if (!sameSet(clienteIds, doc.cliente_ids)) patch.cliente_ids = clienteIds;
    onSubmit(patch);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-exito" strokeWidth={1.9} />
            Editar documento
          </DialogTitle>
          <DialogDescription>
            Cambia el nombre, la clasificación y los clientes vinculados. Las
            versiones del archivo no se modifican.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (tituloLimpio) submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-edit-titulo">Título</Label>
            <Input
              id="doc-edit-titulo"
              value={titulo}
              autoFocus={focus === "titulo"}
              maxLength={200}
              onChange={(e) => setTitulo(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-edit-categoria">Categoría</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? doc.categoria)}>
              <SelectTrigger
                id="doc-edit-categoria"
                aria-label="Categoría"
                autoFocus={focus === "categoria"}
                className={FIELD_CLASS}
              >
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-800">Etiquetas</span>
            <EtiquetasInput etiquetas={etiquetas} onChange={setEtiquetas} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-800">Clientes vinculados</span>
            {clienteIds.length > 0 ? (
              <ul aria-label="Clientes vinculados" className="flex flex-wrap gap-1.5">
                {clienteIds.map((id) => (
                  <li
                    key={id}
                    className="inline-flex h-[26px] items-center gap-1 rounded-full bg-info-bg pr-1 pl-2.5 text-[12px] font-semibold text-info"
                  >
                    {nombreCliente(id)}
                    <button
                      type="button"
                      aria-label={`Desvincular ${nombreCliente(id)}`}
                      onClick={() => setClienteIds(clienteIds.filter((c) => c !== id))}
                      className="grid size-[18px] place-items-center rounded-full hover:bg-info/15"
                    >
                      <X className="size-3" strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-600">Sin clientes vinculados.</p>
            )}
            <Select
              value=""
              onValueChange={(v) => {
                if (v) setClienteIds([...clienteIds, v]);
              }}
            >
              <SelectTrigger
                aria-label="Agregar cliente"
                autoFocus={focus === "clientes"}
                disabled={disponibles.length === 0}
                className={FIELD_CLASS}
              >
                <SelectValue placeholder="Agregar cliente…" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="px-4 text-[13px] font-semibold text-ink-800"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !tituloLimpio} className="px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Mover a… (uno o varios documentos) ────────────────────────────────── */

const ROOT_VALUE = "raiz";

export function MoveDocumentsDialog({
  count,
  titulo,
  folders,
  pending,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  /** Título del documento cuando se mueve uno solo. */
  titulo?: string;
  folders: FolderNode[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (carpetaId: string | null) => void;
}) {
  const [destino, setDestino] = useState<string>("");
  const options = flattenFolderOptions(folders);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="size-5 text-exito" strokeWidth={1.9} />
            {titulo ? `Mover «${titulo}»` : `Mover ${count} documentos`}
          </DialogTitle>
          <DialogDescription>
            Elige la carpeta destino. Si es la carpeta de un cliente, el documento
            queda vinculado a ese cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-move-destino">Destino</Label>
          <Select value={destino} onValueChange={(v) => setDestino(v ?? "")}>
            <SelectTrigger id="doc-move-destino" aria-label="Destino" className={FIELD_CLASS}>
              <SelectValue placeholder="Elige una carpeta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>Todas (sin carpeta)</SelectItem>
              {options.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || destino === ""}
            onClick={() => onConfirm(destino === ROOT_VALUE ? null : destino)}
            className="px-4 font-bold"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {pending ? "Moviendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Cambiar categoría (lote) ──────────────────────────────────────────── */

export function BulkCategoryDialog({
  count,
  allowRestricted,
  pending,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  allowRestricted: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (categoria: string) => void;
}) {
  const [categoria, setCategoria] = useState("");
  const categories = useCategoryOptions(allowRestricted);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="size-5 text-exito" strokeWidth={1.9} />
            Cambiar categoría
          </DialogTitle>
          <DialogDescription>
            Se aplicará a {count} {count === 1 ? "documento" : "documentos"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-bulk-categoria">Nueva categoría</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "")}>
            <SelectTrigger
              id="doc-bulk-categoria"
              aria-label="Nueva categoría"
              className={FIELD_CLASS}
            >
              <SelectValue placeholder="Elige una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || !categoria}
            onClick={() => onConfirm(categoria)}
            className="px-4 font-bold"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Enviar a la papelera ──────────────────────────────────────────────── */

export function ConfirmTrashDialog({
  count,
  titulo,
  pending,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  titulo?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(420px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-destructivo" strokeWidth={1.9} />
            {titulo ? "Eliminar documento" : `Eliminar ${count} documentos`}
          </DialogTitle>
          <DialogDescription>
            {titulo ? `«${titulo}» se enviará` : "Se enviarán"} a la papelera con
            todas sus versiones. Coordinación, Gerencia y Administración pueden
            {titulo ? " restaurarlo" : " restaurarlos"} desde la pestaña Papelera.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
            className="px-4 font-bold"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Enviar a la papelera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
