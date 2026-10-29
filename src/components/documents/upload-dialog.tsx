// Diálogo "Subir documento" del Repositorio (PRD §6.2): dropzone con
// drag&drop o clic (política única de archivo de la app, src/lib/api/files.ts:
// PDF/DOCX/XLSX/PPTX/JPG/JPEG/PNG hasta 25 MB configurables — la UI deriva de
// ahí tanto el texto como el `accept`, para no prometer algo que la API
// rechaza), título autocompletado desde el nombre del archivo (editable),
// categoría obligatoria, etiquetas en chips (Enter/comma, máx 8) y cliente
// vinculable opcional. FileDropzone se reutiliza en el diálogo "Subir nueva
// versión" de la ficha (document-dialog.tsx).
// Carpeta destino (S3): el documento se guarda en la carpeta abierta; si es la
// carpeta de un cliente, el cliente lo pone la carpeta (no se envía otro).
// Varios archivos soltados sobre el listado o una carpeta (S5) se suben en
// lote con este mismo flujo firmado, uno por archivo, con su nombre de título.

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
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_MB } from "@/lib/api/files";
import {
  ALLOWED_ATTACHMENT_LABEL,
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

// Built from the shared allowlist so the file picker can never advertise a
// type the API rejects.
const FILE_ACCEPT = [...ALLOWED_FILE_EXTENSIONS].map((ext) => `.${ext}`).join(",");

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
          {ALLOWED_ATTACHMENT_LABEL} · máx. {MAX_FILE_MB} MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
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
        className="h-10 px-3 text-base md:text-[13px]"
      />
      <p className="text-[11.5px] text-ink-500">
        {etiquetas.length}/8 etiquetas · separa con Enter o coma
      </p>
    </div>
  );
}

/* ── Lote de archivos soltados (S5) ────────────────────────────────────── */

function tituloDesdeArchivo(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Separa los archivos soltados en aceptados y rechazados (con su motivo). */
function splitArchivos(files: File[]): { validos: File[]; rechazados: string[] } {
  const validos: File[] = [];
  const rechazados: string[] = [];
  for (const f of files) {
    const motivo = attachmentValidationError(f);
    if (motivo) rechazados.push(`${f.name} (${motivo})`);
    else validos.push(f);
  }
  return { validos, rechazados };
}

function LoteArchivos({
  files,
  disabled,
  onRemove,
}: {
  files: File[];
  disabled: boolean;
  onRemove: (file: File) => void;
}) {
  return (
    <ul aria-label="Archivos a subir" className="flex flex-col gap-1.5">
      {files.map((f) => (
        <li
          key={`${f.name}-${f.size}-${f.lastModified}`}
          className="flex items-center justify-between gap-3 rounded-12 border border-ink-200 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-900">{f.name}</p>
            <p className="text-[12px] text-ink-600">{formatBytes(f.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar ${f.name}`}
            disabled={disabled}
            onClick={() => onRemove(f)}
            className="shrink-0 text-ink-500 hover:text-destructivo"
          >
            <X className="size-4" strokeWidth={2} />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* ── Diálogo de creación de documento ──────────────────────────────────── */

/** Carpeta donde se guardará el documento (la abierta en el repositorio). */
export type UploadFolder = { id: string; nombre: string; cliente_id?: string | null };

export function UploadDocumentDialog({
  open,
  onOpenChange,
  prefilledClienteId,
  onSaved,
  folder,
  initialFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledClienteId?: string;
  onSaved?: () => void;
  /** Carpeta destino (S3); sin carpeta el documento queda en «Todas». */
  folder?: UploadFolder | null;
  /** Archivos soltados sobre el listado o una carpeta (S5); con más de uno
   * el diálogo sube en lote. */
  initialFiles?: File[];
}) {
  const upload = useUploadDocument();
  const clientsQuery = useClientOptions();
  const clients = clientsQuery.data ?? [];
  // Catálogo en vivo (setting doc_categories); mientras carga o si falla,
  // se usan las constantes de fábrica para no bloquear el formulario — el
  // servidor sigue siendo la fuente de verdad de la validación.
  const categoriesQuery = useDocCategories();
  const categories = categoriesQuery.data?.map((c) => c.nombre) ?? [...DOC_CATEGORIES];

  const [inicial] = useState(() => splitArchivos(initialFiles ?? []));
  const unico = inicial.validos.length === 1 ? inicial.validos[0]! : null;
  const [file, setFile] = useState<File | null>(unico);
  const [titulo, setTitulo] = useState(unico ? tituloDesdeArchivo(unico.name) : "");
  // Lote (S5): sin título por archivo — cada uno toma el nombre de su
  // archivo; categoría, etiquetas y cliente son comunes.
  const [lote, setLote] = useState<File[]>(inicial.validos.length > 1 ? inicial.validos : []);
  const [loteDuplicados, setLoteDuplicados] = useState<File[]>([]);
  const [lotePending, setLotePending] = useState(false);
  const enLote = lote.length > 0;
  const [categoria, setCategoria] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState(prefilledClienteId ?? "");
  const [error, setError] = useState<string | null>(
    inicial.rechazados.length > 0 ? `No se pueden subir: ${inicial.rechazados.join(", ")}.` : null,
  );
  // Una carpeta de cliente impone su cliente (el servidor rechaza otro).
  const clienteDeCarpeta = folder?.cliente_id ?? null;
  const nombreClienteDeCarpeta = clienteDeCarpeta
    ? (clients.find((c) => c.id === clienteDeCarpeta)?.nombre ?? "el cliente")
    : null;
  // Título duplicado (QA audit #4): en vez de crear un documento aparte en
  // silencio, se muestra esta advertencia con el documento existente y se
  // deja que el usuario elija.
  const [duplicate, setDuplicate] = useState<{ id: string; titulo: string } | null>(null);
  const versionUpload = useUploadVersion(duplicate?.id ?? "");

  function handleFile(next: File | null) {
    setFile(next);
    if (next && !titulo) setTitulo(tituloDesdeArchivo(next.name));
  }

  function handleTitulo(next: string) {
    setTitulo(next);
    if (duplicate) setDuplicate(null);
  }

  function sharedInput() {
    return {
      categoria,
      etiquetas,
      ...(!clienteDeCarpeta && clienteId ? { cliente_id: clienteId } : {}),
      ...(folder ? { carpeta_id: folder.id } : {}),
    };
  }

  function uploadInput() {
    return { ...sharedInput(), file: file!, titulo: titulo.trim() || file!.name };
  }

  /** Sube los archivos uno por uno con el flujo firmado de siempre; los que
   * fallan quedan en la lista (los de título duplicado, para crear aparte). */
  async function subirLote(files: File[], force: boolean) {
    setLotePending(true);
    const fallidos: File[] = [];
    const duplicados: File[] = [];
    for (const f of files) {
      try {
        await upload.mutateAsync({
          ...sharedInput(),
          file: f,
          titulo: tituloDesdeArchivo(f.name),
          ...(force ? { force: true } : {}),
        });
      } catch (err) {
        fallidos.push(f);
        if (err instanceof DocumentDuplicateTitleError) duplicados.push(f);
        /* el resto de errores los toastean los hooks */
      }
    }
    setLotePending(false);
    const restantes = lote.filter((f) => !files.includes(f) || fallidos.includes(f));
    setLote(restantes);
    setLoteDuplicados(duplicados);
    if (restantes.length === 0) {
      onOpenChange(false);
      onSaved?.();
    }
  }

  async function handleSubmitLote() {
    setError(null);
    if (!categoria) {
      setError("La categoría es obligatoria.");
      return;
    }
    await subirLote(lote, false);
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
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-[min(560px,calc(100%-2rem))]">
        <div className="flex flex-col gap-5 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              Subir documento
            </DialogTitle>
            <DialogDescription>
              {enLote
                ? "Cada archivo se registra como un documento nuevo (versión v1), con el nombre del archivo como título."
                : "El archivo se registra como versión v1 del documento."}
              {folder && ` Se guardará en la carpeta «${folder.nombre}».`}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
            >
              {error}
            </div>
          )}

          {duplicate && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-inner border border-alerta/30 bg-alerta-bg px-4 py-3.5 text-[13px] text-ink-800"
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
                  className="font-semibold text-ink-700"
                >
                  Volver
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCreateSeparate()}
                  disabled={upload.isPending}
                  className="font-semibold"
                >
                  Crear aparte
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleUploadAsVersion()}
                  disabled={versionUpload.isPending}
                  className="font-bold"
                >
                  {versionUpload.isPending && <LoaderCircle className="size-4 animate-spin" />}
                  Subir como nueva versión
                </Button>
              </div>
            </div>
          )}

          {loteDuplicados.length > 0 && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-inner border border-alerta/30 bg-alerta-bg px-4 py-3.5 text-[13px] text-ink-800"
            >
              <p>
                {`Ya existen documentos con estos títulos: ${loteDuplicados
                  .map((f) => tituloDesdeArchivo(f.name))
                  .join(", ")}. ¿Querés crearlos como documentos aparte o quitarlos de la lista?`}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLoteDuplicados([])}
                  className="font-semibold text-ink-700"
                >
                  Volver
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void subirLote(loteDuplicados, true)}
                  disabled={lotePending}
                  className="font-bold"
                >
                  Crear aparte
                </Button>
              </div>
            </div>
          )}

          {enLote ? (
            <LoteArchivos
              files={lote}
              disabled={lotePending}
              onRemove={(f) => {
                setLote((prev) => prev.filter((x) => x !== f));
                setLoteDuplicados((prev) => prev.filter((x) => x !== f));
              }}
            />
          ) : (
            <>
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
                  className="px-3"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label>
              Categoría <span className="text-rose-500">*</span>
            </Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "")}>
              <SelectTrigger className="w-full px-3">
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
            {nombreClienteDeCarpeta ? (
              <p className="rounded-12 border border-ink-200 bg-ink-100/40 px-3 py-2.5 text-[13px] text-ink-700">
                {`Se vincula a ${nombreClienteDeCarpeta}, el cliente de esta carpeta.`}
              </p>
            ) : (
              <Select
                value={clienteId}
                onValueChange={(v) => setClienteId(v === "ninguno" ? "" : (v ?? ""))}
              >
                <SelectTrigger className="w-full px-3">
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
            )}
          </div>

          <DialogFooter className="mt-1 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="px-4 font-semibold"
            >
              Cancelar
            </Button>
            {enLote ? (
              <Button
                type="button"
                onClick={() => void handleSubmitLote()}
                disabled={lotePending || loteDuplicados.length > 0}
                className="px-4 font-bold"
              >
                {lotePending && <LoaderCircle className="size-4 animate-spin" />}
                {lotePending
                  ? "Subiendo…"
                  : `Subir ${lote.length} ${lote.length === 1 ? "documento" : "documentos"}`}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={upload.isPending || Boolean(duplicate)}
                className="px-4 font-bold"
              >
                {upload.isPending && <LoaderCircle className="size-4 animate-spin" />}
                {upload.isPending ? "Subiendo…" : "Subir"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}