// Piezas compartidas de la sección "Estructura técnica" de la ficha (S3 U4):
// campos, formulario en línea, acciones de fila y utilidades de formato. Usan
// los mismos primitivos que `project-team.tsx`; no introducen un sistema visual.

"use client";

import { useId, type ReactNode } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const INVALID_NUMBER = "Ingresa un número válido.";

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Texto -> número. Acepta coma decimal. `null` si está vacío o no es numérico. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Los `Decimal(15,2)` llegan como string: solo se formatean para mostrar. */
export function formatCantidad(value: string): string {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n)
    : value;
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-[13px] text-destructivo", className)}>
      {message}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  inputMode?: "decimal" | "numeric";
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label htmlFor={id} className="text-[12px] text-ink-600">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-12 bg-panel px-3"
      />
    </div>
  );
}

export function StructureForm({
  label,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  label: string;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mt-2 grid gap-2.5 rounded-[14px] border border-ink-200 bg-panel p-3 sm:grid-cols-2"
    >
      {children}
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <InlineError message={error} className="sm:col-span-2" />
    </form>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onClick}>
      <Plus className="size-3.5" />
      {label}
    </Button>
  );
}

export function RowActions({
  nombre,
  deleting,
  onEdit,
  onDelete,
}: {
  nombre: string;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${nombre}`} onClick={onEdit}>
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Eliminar ${nombre}`}
        disabled={deleting}
        onClick={onDelete}
      >
        {deleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>
    </div>
  );
}

/** Mensaje de la validación local si existe; si no, el del servidor (400/409). */
export function formError(local: string | null, error: unknown, isError: boolean, fallback: string) {
  return local ?? (isError ? errorMessage(error, fallback) : null);
}
