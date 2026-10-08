"use client";

// Administración de los catálogos v2 (REQ-CAT-01..04): rubros, líneas
// estratégicas y municipios en una sola sección con tres subtablas. Cada fila
// se renombra y se suspende/restaura por PATCH (`nombre`, `activo`); el código
// es de solo lectura. Rubros no tiene alta (R01–R15 son fijos); líneas y
// municipios sí. Los errores del servidor (p. ej. 409 de duplicado) se
// muestran en línea, en español.

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import {
  useAdminLineas,
  useAdminMunicipios,
  useAdminRubros,
  useCreateLinea,
  useCreateMunicipio,
  useUpdateCatalogo,
  type CatalogoKind,
} from "@/hooks/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const DANE_REGEX = /^\d{5}$/;

type Row = {
  id: string;
  nombre: string;
  activo: boolean;
  /** Identificador de solo lectura mostrado en la primera columna. */
  codigo: string | null;
  /** Texto secundario (departamento en municipios). */
  detalle?: string;
};

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "No pudimos completar la acción. Inténtalo de nuevo.";
}

function CatalogoTable({
  kind,
  title,
  rows,
  isLoading,
  isError,
  codeHeader,
  detailHeader,
  addForm,
}: {
  kind: CatalogoKind;
  title: string;
  rows: Row[] | undefined;
  isLoading: boolean;
  isError: boolean;
  codeHeader: string;
  detailHeader?: string;
  addForm?: (onError: (message: string | null) => void) => ReactNode;
}) {
  const update = useUpdateCatalogo();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, data: { nombre?: string; activo?: boolean }) {
    setError(null);
    try {
      await update.mutateAsync({ kind, id, data });
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section
      aria-label={title}
      className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6"
    >
      <h3 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
        {title}
      </h3>

      {isLoading ? (
        <Skeleton className="mt-3 h-24" />
      ) : isError || !rows ? (
        <p role="alert" className="mt-3 text-[13px] text-alerta">
          No pudimos cargar este catálogo. Inténtalo de nuevo.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-500">
                <th className="py-1.5 pr-3 font-semibold">{codeHeader}</th>
                <th className="py-1.5 pr-3 font-semibold">Nombre</th>
                {detailHeader ? (
                  <th className="py-1.5 pr-3 font-semibold">{detailHeader}</th>
                ) : null}
                <th className="py-1.5 pr-3 font-semibold">Estado</th>
                <th className="py-1.5 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-t border-ink-100">
                    <td className="py-2 pr-3 font-mono text-[12px] text-ink-700">
                      {row.codigo ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-ink-950">
                      {editing ? (
                        <Input
                          aria-label={`Nombre de ${row.codigo ?? row.nombre}`}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="h-8"
                        />
                      ) : (
                        row.nombre
                      )}
                    </td>
                    {detailHeader ? (
                      <td className="py-2 pr-3 text-ink-700">{row.detalle ?? "—"}</td>
                    ) : null}
                    <td className="py-2 pr-3">
                      {row.activo ? (
                        <Badge variant="secondary">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Suspendido</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1.5">
                        {editing ? (
                          <>
                            <Button
                              size="sm"
                              disabled={update.isPending || draft.trim().length === 0}
                              onClick={() => void patch(row.id, { nombre: draft.trim() })}
                            >
                              <Check className="size-3.5" /> Guardar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="size-3.5" /> Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Renombrar ${row.nombre}`}
                              onClick={() => {
                                setError(null);
                                setDraft(row.nombre);
                                setEditingId(row.id);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {row.activo ? (
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Suspender ${row.nombre}`}
                                disabled={update.isPending}
                                onClick={() => void patch(row.id, { activo: false })}
                              >
                                Suspender
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Restaurar ${row.nombre}`}
                                disabled={update.isPending}
                                onClick={() => void patch(row.id, { activo: true })}
                              >
                                <RotateCcw className="size-3.5" /> Restaurar
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addForm?.(setError)}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-alerta">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LineaAddForm({ onError }: { onError: (message: string | null) => void }) {
  const create = useCreateLinea();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    onError(null);
    if (!codigo.trim() || !nombre.trim()) {
      onError("El código y el nombre son obligatorios.");
      return;
    }
    try {
      await create.mutateAsync({ codigo: codigo.trim(), nombre: nombre.trim() });
      setCodigo("");
      setNombre("");
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
        Código
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="h-8 w-28" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
        Nombre
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 w-64" />
      </label>
      <Button type="submit" size="sm" disabled={create.isPending}>
        <Plus className="size-3.5" /> Agregar
      </Button>
    </form>
  );
}

function MunicipioAddForm({ onError }: { onError: (message: string | null) => void }) {
  const create = useCreateMunicipio();
  const [nombre, setNombre] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [dane, setDane] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    onError(null);
    if (!nombre.trim() || !departamento.trim()) {
      onError("El nombre y el departamento son obligatorios.");
      return;
    }
    const codigoDane = dane.trim();
    if (codigoDane && !DANE_REGEX.test(codigoDane)) {
      onError("El código DANE debe tener 5 dígitos.");
      return;
    }
    try {
      await create.mutateAsync({
        nombre: nombre.trim(),
        departamento: departamento.trim(),
        codigo_dane: codigoDane || null,
      });
      setNombre("");
      setDepartamento("");
      setDane("");
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
        Nombre
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 w-48" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
        Departamento
        <Input
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          className="h-8 w-48"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-ink-700">
        Código DANE (opcional)
        <Input
          value={dane}
          inputMode="numeric"
          onChange={(e) => setDane(e.target.value)}
          className="h-8 w-40"
        />
      </label>
      <Button type="submit" size="sm" disabled={create.isPending}>
        <Plus className="size-3.5" /> Agregar
      </Button>
    </form>
  );
}

export function CatalogosV2Section() {
  const rubros = useAdminRubros();
  const lineas = useAdminLineas();
  const municipios = useAdminMunicipios();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          Catálogos de proyectos
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-600">
          Renombra o suspende rubros, líneas estratégicas y municipios. Nada se elimina: lo
          suspendido deja de ofrecerse en proyectos nuevos y puede restaurarse.
        </p>
      </div>

      <CatalogoTable
        kind="rubros"
        title="Rubros"
        codeHeader="Código"
        isLoading={rubros.isLoading}
        isError={rubros.isError}
        rows={rubros.data?.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          nombre: r.nombre,
          activo: r.activo,
        }))}
      />
      <CatalogoTable
        kind="strategic-lines"
        title="Líneas estratégicas"
        codeHeader="Código"
        isLoading={lineas.isLoading}
        isError={lineas.isError}
        rows={lineas.data?.map((l) => ({
          id: l.id,
          codigo: l.codigo,
          nombre: l.nombre,
          activo: l.activo,
        }))}
        addForm={(onError) => <LineaAddForm onError={onError} />}
      />
      <CatalogoTable
        kind="municipalities"
        title="Municipios"
        codeHeader="Código DANE"
        detailHeader="Departamento"
        isLoading={municipios.isLoading}
        isError={municipios.isError}
        rows={municipios.data?.map((m) => ({
          id: m.id,
          codigo: m.codigo_dane,
          nombre: m.nombre,
          activo: m.activo,
          detalle: m.departamento,
        }))}
        addForm={(onError) => <MunicipioAddForm onError={onError} />}
      />
    </div>
  );
}
