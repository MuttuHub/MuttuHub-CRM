"use client";

// Catálogos configurables del admin (PRD §3.3, Hito 7): etiquetas de tarea y
// categorías de documentos editadas en borrador local, con validación de
// cliente que espeja la del servidor (mín. 1, únicas, máx. 30, tope de
// caracteres) y guardado por PUT /api/v1/settings. Los errores de guardado
// muestran el mensaje del envelopver del servidor vía sonner.

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  FolderLock,
  LoaderCircle,
  Plus,
  Save,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSaveSettings,
  useSettings,
  type SettingsSnapshot,
} from "@/hooks/admin";
import type { DocCategoriaSetting } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Espejo de los límites del servidor (src/app/api/v1/settings/route.ts).
const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 40;
const MAX_CATEGORIES = 30;
const MAX_CATEGORY_LENGTH = 80;

type Draft = {
  task_tags: string[];
  doc_categories: DocCategoriaSetting[];
};

function sameSnapshot(a: SettingsSnapshot | undefined, b: Draft | null): boolean {
  if (!a || !b) return false;
  return (
    JSON.stringify(a.task_tags) === JSON.stringify(b.task_tags) &&
    JSON.stringify(a.doc_categories) === JSON.stringify(b.doc_categories)
  );
}

function snapshotToDraft(s: SettingsSnapshot): Draft {
  return {
    task_tags: [...s.task_tags],
    doc_categories: s.doc_categories.map((c) => ({ ...c })),
  };
}

export function CatalogsSection() {
  const query = useSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tagInput, setTagInput] = useState("");
  // Ajuste durante el render (patrón oficial de React): hidrata el borrador
  // una sola vez con el primer snapshot y nunca pisa ediciones pendientes.
  // Descartar y el guardado exitoso re-sincronizan de forma explícita.
  const [prevSnapshot, setPrevSnapshot] = useState<SettingsSnapshot | undefined>(
    undefined,
  );
  if (query.data && query.data !== prevSnapshot) {
    setPrevSnapshot(query.data);
    if (draft === null) setDraft(snapshotToDraft(query.data));
  }

  const dirty = !sameSnapshot(query.data, draft);

  if (query.isLoading || (query.data && draft === null)) {
    // El segundo caso cubre el pase en el que el snapshot recién llegó y el
    // borrador todavía no se hidrató (ajuste durante el render, ver arriba).
    return (
      <section className="rounded-[22px] border border-ink-200 bg-white p-5 lg:p-6">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-3 h-3.5 w-72" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </section>
    );
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : "No pudimos cargar los catálogos. Inténtalo de nuevo.";
    return (
      <section className="grid min-h-[280px] place-items-center rounded-[22px] border border-ink-200 bg-white p-8">
        <div className="max-w-[46ch] text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-alerta-bg text-alerta">
            <AlertTriangle className="size-5" strokeWidth={1.7} />
          </span>
          <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            No pudimos cargar los catálogos
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{message}</p>
          <Button
            onClick={() => void query.refetch()}
            variant="outline"
            className="mt-4 rounded-lg px-4 font-semibold"
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  function addTag(value: string) {
    const tag = value.trim();
    if (!tag) return;
    if (draft!.task_tags.some((t) => t === tag)) {
      toast.warning("La etiqueta ya existe.");
      return;
    }
    if (draft!.task_tags.length >= MAX_TAGS) {
      toast.error(`Máximo ${MAX_TAGS} etiquetas.`);
      return;
    }
    if (tag.length > MAX_TAG_LENGTH) {
      toast.error(`Cada etiqueta debe tener máximo ${MAX_TAG_LENGTH} caracteres.`);
      return;
    }
    setDraft({
      ...draft!,
      task_tags: [...draft!.task_tags, tag],
    });
    setTagInput("");
  }

  function handleTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addTag(tagInput);
  }

  function removeTag(tag: string) {
    setDraft({ ...draft!, task_tags: draft!.task_tags.filter((t) => t !== tag) });
  }

  function setCategoryName(index: number, nombre: string) {
    const doc_categories = draft!.doc_categories.map((c, i) =>
      i === index ? { ...c, nombre } : c,
    );
    setDraft({ ...draft!, doc_categories });
  }

  function toggleCategoryRestricted(index: number, restringida: boolean) {
    const doc_categories = draft!.doc_categories.map((c, i) =>
      i === index ? { ...c, restringida } : c,
    );
    setDraft({ ...draft!, doc_categories });
  }

  function removeCategory(index: number) {
    const doc_categories = draft!.doc_categories.filter((_, i) => i !== index);
    setDraft({ ...draft!, doc_categories });
  }

  function addCategory() {
    if (draft!.doc_categories.length >= MAX_CATEGORIES) {
      toast.error(`Máximo ${MAX_CATEGORIES} categorías.`);
      return;
    }
    setDraft({
      ...draft!,
      doc_categories: [...draft!.doc_categories, { nombre: "", restringida: false }],
    });
  }

  function handleSave() {
    // Validación espejo del servidor antes de PUT /api/v1/settings.
    const tags = draft!.task_tags.map((t) => t.trim());
    if (tags.length < 1) {
      toast.error("Debe mantener al menos una etiqueta.");
      return;
    }
    if (tags.some((t) => t.length > MAX_TAG_LENGTH)) {
      toast.error(`Cada etiqueta debe tener máximo ${MAX_TAG_LENGTH} caracteres.`);
      return;
    }
    if (new Set(tags).size !== tags.length) {
      toast.error("Las etiquetas no pueden repetirse.");
      return;
    }

    const doc_categories = draft!.doc_categories.map((c) => ({
      ...c,
      nombre: c.nombre.trim(),
    }));
    if (doc_categories.length < 1 || doc_categories.some((c) => c.nombre.length === 0)) {
      toast.error("Debe mantener al menos una categoría.");
      return;
    }
    if (doc_categories.some((c) => c.nombre.length > MAX_CATEGORY_LENGTH)) {
      toast.error(`Cada categoría debe tener máximo ${MAX_CATEGORY_LENGTH} caracteres.`);
      return;
    }
    const lower = doc_categories.map((c) => c.nombre.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      toast.error("Las categorías no pueden repetirse (sin distinguir mayúsculas).");
      return;
    }

    save.mutate(
      { task_tags: tags, doc_categories },
      {
        onSuccess: (snapshot) => setDraft(snapshotToDraft(snapshot)),
      },
    );
  }

  function handleDiscard() {
    if (query.data) setDraft(snapshotToDraft(query.data));
  }

  const saving = save.isPending;

  return (
    <section className="rounded-[22px] border border-ink-200 bg-white p-5 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Catálogos configurables
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-600">
            Define los valores que usan los formularios de tareas y documentos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Etiquetas de tarea */}
        <div className="flex flex-col rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-950">
              <Tags className="size-4 text-rose-500" strokeWidth={1.8} />
              Etiquetas de tarea
            </h3>
            <span className="font-mono text-[11px] font-bold tabular-nums text-ink-600">
              {draft!.task_tags.length}/{MAX_TAGS}
            </span>
          </div>

          {draft!.task_tags.length === 0 ? (
            <p className="rounded-14 border border-dashed border-ink-300 px-4 py-6 text-center text-[12.5px] text-ink-600">
              Sin etiquetas — agregá al menos una
            </p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-2">
              {draft!.task_tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-ink-200 bg-white pl-3 pr-1 text-[12px] font-semibold text-ink-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Eliminar etiqueta ${tag}`}
                    className="relative grid size-5 place-items-center rounded-full text-ink-500 transition-colors after:absolute after:content-[''] after:-inset-1 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="size-3" strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleTagSubmit} className="mt-auto flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Nueva etiqueta…"
              aria-label="Nueva etiqueta de tarea"
              className="h-9 rounded-12 border-ink-200 bg-white px-3"
              maxLength={MAX_TAG_LENGTH}
            />
            <Button
              type="submit"
              variant="secondary"
              className="shrink-0 rounded-12 px-3 font-semibold"
            >
              <Plus className="size-3.5" strokeWidth={2.2} />
              Agregar
            </Button>
          </form>
        </div>

        {/* Categorías de documentos */}
        <div className="flex flex-col rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-950">
              <FolderLock className="size-4 text-rose-500" strokeWidth={1.8} />
              Categorías de documentos
            </h3>
            <span className="font-mono text-[11px] font-bold tabular-nums text-ink-600">
              {draft!.doc_categories.length}/{MAX_CATEGORIES}
            </span>
          </div>
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-600">
            Restringida = no visible para Colaborador (Legal,
            Administrativo-financiero por defecto)
          </p>

          {draft!.doc_categories.length === 0 ? (
            <p className="rounded-14 border border-dashed border-ink-300 px-4 py-6 text-center text-[12.5px] text-ink-600">
              Sin categorías — agregá al menos una
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {draft!.doc_categories.map((categoria, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    value={categoria.nombre}
                    onChange={(e) => setCategoryName(index, e.target.value)}
                    placeholder="Nombre de la categoría"
                    aria-label={`Nombre de la categoría ${index + 1}`}
                    className="h-9 min-w-0 flex-1 rounded-12 border-ink-200 bg-white px-3"
                    maxLength={MAX_CATEGORY_LENGTH}
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-medium text-ink-700">
                    <Checkbox
                      checked={categoria.restringida}
                      onCheckedChange={(v) =>
                        toggleCategoryRestricted(index, v === true)
                      }
                    />
                    Restringida
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCategory(index)}
                    aria-label={`Eliminar categoría ${categoria.nombre || index + 1}`}
                    className="relative grid size-7 shrink-0 place-items-center rounded-[9px] text-ink-500 transition-colors after:absolute after:content-[''] after:-inset-2 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="size-3.5" strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addCategory}
            className="relative mt-3 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-12 border border-dashed border-ink-300 px-3 text-[12.5px] font-semibold text-ink-600 transition-colors after:absolute after:content-[''] after:-inset-1 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            Agregar categoría
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-ink-100 pt-4">
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={handleDiscard}
          className="rounded-lg px-4 font-semibold"
        >
          Descartar
        </Button>
        <Button
          disabled={!dirty || saving}
          onClick={handleSave}
          className="rounded-lg px-4 font-bold"
        >
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" strokeWidth={2} />
          )}
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </section>
  );
}