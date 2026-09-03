// Diálogo "Subir documento" del Repositorio (PRD §6.2): dropzone con
// drag&drop o clic (mismas reglas de archivo que la API: PDF/DOCX/XLSX/JPG/PNG
// hasta 10 MB), título autocompletado desde el nombre del archivo (editable),
// categoría obligatoria, etiquetas en chips (Enter/comma, máx 8) y cliente
// vinculable opcional. FileDropzone se reutiliza en el diálogo "Subir nueva
// versión" de la ficha (document-dialog.tsx).

"use client";

import { useRef, useState, type DragEvent } from "react";
import { LoaderCircle, Upload, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { DOC_CATEGORIES } from "@/lib/catalogs";
import {
  attachmentValidationError,
  formatBytes,
  useClientOptions,
} from "@/hooks/kanban";
import {
  DocumentDuplicateTitleError,
  useDocCategories,
  useUploadDocument,
  useUploadVersion,
} from "@/hooks/documents";

/* ── Dropzone compartida (crear documento y nueva versión) ─────────────── */

export function FileDropzone({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File | null) {
    if (!file) {
      onChange(null);
      return;
    }
    const validation = attachmentValidationError(file);
    if (validation) {
      setError(validation);
      onChange(null);
      return;
    }
    setError(null);
    onChange(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files?.[0] ?? null);
  }

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-14 border border-exito/30 bg-exito-bg px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[12px_12px_12px_4px] bg-panel text-exito">
            <Upload className="size-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-900">{file.name}</p>
            <p className="text-[12px] text-ink-600">{formatBytes(file.size)}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Quitar archivo"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="shrink-0 text-ink-500 hover:text-destructivo"
        >
          <X className="size-4" strokeWidth={2} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label="Subir archivo"
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-14 border border-dashed px-6 py-7 text-center transition-colors",
          dragging
            ? "border-rose-500 bg-rose-50"
            : "border-ink-300 bg-ink-100/40 hover:border-rose-300 hover:bg-rose-50/50",
        )}
      >
        <span className="grid size-10 place-items-center rounded-[15px_15px_15px_5px] bg-panel text-ink-600">
          <Upload className="size-5" strokeWidth={1.7} />
        </span>
        <span className="text-[13.5px] font-semibold text-ink-800">
          Arrastra el archivo aquí o haz clic para seleccionarlo
        </span>
        <span className="text-[12px] text-ink-500">
          PDF · Word (.docx) · Excel (.xlsx) · PowerPoint (.pptx) · JPG · PNG · máx. 10 MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-destructivo">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Input de etiquetas en chips (Enter o coma; dedupe; máx 8) ─────────── */

export function EtiquetasInput({
  etiquetas,
  onChange,
}: {
  etiquetas: string[];
  onChange: (next: string[]) => void;
}) {
  const [texto, setTexto] = useState("");

  function add(raw: string) {
    const tag = raw.trim().slice(0, 40);
    if (!tag) return;
    if (etiquetas.includes(tag)) {
      setTexto("");
      return;
    }
    if (etiquetas.length >= 8) return;
    onChange([...etiquetas, tag]);
    setTexto("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(texto);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {etiquetas.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-[24px] items-center gap-1 rounded-full bg-ink-100 pl-2.5 pr-1 text-[11.5px] font-semibold text-ink-700"
          >
            {tag}
            <button
              type="button"
              aria-label={`Quitar etiqueta ${tag}`}
              onClick={() => onChange(etiquetas.filter((t) => t !== tag))}
              className="grid size-[18px] place-items-center rounded-full text-ink-500 hover:bg-ink-200 hover:text-ink-800"
            >
              <X className="size-3" strokeWidth={2.2} />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Escribe y presiona Enter para agregar…"
        aria-label="Agregar etiqueta"
        className="h-9 rounded-10 bg-panel px-3 text-[13px]"
      />
      <p className="text-[11.5px] text-ink-500">
        {etiquetas.length}/8 etiquetas · separa con Enter o coma
      </p>
    </div>
  );
}

/* ── Diálogo de creación de documento ──────────────────────────────────── */

export function UploadDocumentDialog({
  open,
  onOpenChange,
  prefilledClienteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledClienteId?: string;
  onSaved?: () => void;
}) {
  const upload = useUploadDocument();
  const clientsQuery = useClientOptions();
  const clients = clientsQuery.data ?? [];
  // Catálogo en vivo (setting doc_categories); mientras carga o si falla,
  // se usan las constantes de fábrica para no bloquear el formulario — el
  // servidor sigue siendo la fuente de verdad de la validación.
  const categoriesQuery = useDocCategories();
  const categories = categoriesQuery.data?.map((c) => c.nombre) ?? [...DOC_CATEGORIES];

  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState(prefilledClienteId ?? "");
  const [error, setError] = useState<string | null>(null);
  // Título duplicado (QA audit #4): en vez de crear un documento aparte en
  // silencio, se muestra esta advertencia con el documento existente y se
  // deja que el usuario elija.
  const [duplicate, setDuplicate] = useState<{ id: string; titulo: string } | null>(null);
  const versionUpload = useUploadVersion(duplicate?.id ?? "");

  function handleFile(next: File | null) {
    setFile(next);
    if (next && !titulo) {
      const dot = next.name.lastIndexOf(".");
      setTitulo(dot > 0 ? next.name.slice(0, dot) : next.name);
    }
  }

  function handleTitulo(next: string) {
    setTitulo(next);
    if (duplicate) setDuplicate(null);
  }

  function uploadInput() {
    return {
      file: file!,
      titulo: titulo.trim() || file!.name,
      categoria,
      etiquetas,
      ...(clienteId ? { cliente_id: clienteId } : {}),
    };
  }

  async function handleSubmit() {
    setError(null);
    if (!file) {
      setError("Selecciona el archivo que quieres subir.");
      return;
    }
    if (!categoria) {
      setError("La categoría es obligatoria.");
      return;
    }
    try {
      await upload.mutateAsync(uploadInput());
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      if (err instanceof DocumentDuplicateTitleError) {
        setDuplicate(err.existing);
        return;
      }
      /* el resto de errores los toastean los hooks */
    }
  }

  async function handleCreateSeparate() {
    try {
      await upload.mutateAsync({ ...uploadInput(), force: true });
      onOpenChange(false);
      onSaved?.();
    } catch {
      /* los toasts los lanzan los hooks */
    }
  }

  async function handleUploadAsVersion() {
    if (!file || !duplicate) return;
    try {
      await versionUpload.mutateAsync({ file });
      onOpenChange(false);
      onSaved?.();
    } catch {
      /* los toasts los lanzan los hooks */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto rounded-[24px] p-0 sm:max-w-[min(560px,calc(100%-2rem))]">
        <div className="flex flex-col gap-5 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              Subir documento
            </DialogTitle>
            <DialogDescription>
              El archivo se registra como versión v1 del documento.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
            >
              {error}
            </div>
          )}

          {duplicate && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-alerta/30 bg-alerta-bg px-4 py-3.5 text-[13px] text-ink-800"
            >
              <p>
                Ya existe un documento llamado <strong>&ldquo;{duplicate.titulo}&rdquo;</strong>.
                ¿Querés subir este archivo como una nueva versión de ese documento, o crear uno
                aparte?
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDuplicate(null)}
                  className="rounded-lg font-semibold text-ink-700"
                >
                  Volver
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCreateSeparate()}
                  disabled={upload.isPending}
                  className="rounded-lg font-semibold"
                >
                  Crear aparte
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleUploadAsVersion()}
                  disabled={versionUpload.isPending}
                  className="rounded-lg font-bold"
                >
                  {versionUpload.isPending && <LoaderCircle className="size-4 animate-spin" />}
                  Subir como nueva versión
                </Button>
              </div>
            </div>
          )}

          <FileDropzone file={file} onChange={handleFile} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-titulo">
              Título <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="doc-titulo"
              value={titulo}
              onChange={(e) => handleTitulo(e.target.value)}
              placeholder="Nombre del documento"
              className="h-10 rounded-12 bg-panel px-3"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>
              Categoría <span className="text-rose-500">*</span>
            </Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "")}>
              <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                <SelectValue placeholder="Selecciona una categoría" />
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

          <div className="flex flex-col gap-2">
            <Label>Etiquetas</Label>
            <EtiquetasInput etiquetas={etiquetas} onChange={setEtiquetas} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Cliente vinculado</Label>
            <Select
              value={clienteId}
              onValueChange={(v) => setClienteId(v === "ninguno" ? "" : (v ?? ""))}
            >
              <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                <SelectValue placeholder="Sin cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin cliente</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="mt-1 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={upload.isPending || Boolean(duplicate)}
              className="rounded-lg px-4 font-bold"
            >
              {upload.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {upload.isPending ? "Subiendo…" : "Subir"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}