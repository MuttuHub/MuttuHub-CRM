// Importar la estructura desde el Excel de la PO (B3): elegir archivo -> validar
// (no escribe) -> vista previa con los códigos que genera el sistema y lo que se
// reemplaza -> confirmar. Si el archivo tiene errores, se listan por hoja, fila y
// columna y no se guarda nada. El presupuesto no cambia (decisión D-A).
// Visibilidad solo de comodidad: la autoridad es la API (403 a otros roles, 409
// fuera de BORRADOR).

"use client";

import { useId, useState, type ChangeEvent } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  StructureImportReportError,
  useImportStructurePO,
  type StructureImportCounts,
  type StructureImportError,
  type StructureImportPreview,
} from "@/hooks/projects";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";

const TOO_LARGE = "El archivo supera el límite de 4 MB.";
const NOT_XLSX = "Solo se acepta el archivo en formato Excel (.xlsx).";

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** `{1 objetivo, 4 actividades, …}` -> "1 objetivo, 4 actividades, 7 entregables y 2 indicadores". */
function conteo(c: StructureImportCounts): string {
  const partes = [
    plural(c.objetivos, "objetivo", "objetivos"),
    plural(c.actividades, "actividad", "actividades"),
    plural(c.entregables, "entregable", "entregables"),
    plural(c.indicadores, "indicador", "indicadores"),
  ];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

type FilaPlan = { codigo: string; descripcion: string; detalle: string; nivel: 0 | 1 | 2 };

/** The plan as the tree the ficha shows: each objetivo, its indicadores, its actividades and their entregables. */
function filasDelPlan(plan: StructureImportPreview["plan"]): FilaPlan[] {
  const filas: FilaPlan[] = [];
  for (const objetivo of plan.objetivos) {
    filas.push({ codigo: objetivo.codigo, descripcion: objetivo.descripcion, detalle: "Objetivo", nivel: 0 });
    for (const indicador of plan.indicadores.filter((i) => i.objetivoCodigo === objetivo.codigo)) {
      filas.push({ codigo: indicador.codigo, descripcion: indicador.nombre, detalle: `Meta ${numero.format(Number(indicador.meta))}`, nivel: 1 });
    }
    for (const actividad of plan.actividades.filter((a) => a.objetivoCodigo === objetivo.codigo)) {
      filas.push({
        codigo: actividad.codigo,
        descripcion: actividad.nombre,
        detalle: `Semanas ${actividad.semanaInicio}–${actividad.semanaFin}`,
        nivel: 1,
      });
      for (const entregable of plan.entregables.filter((e) => e.actividadCodigo === actividad.codigo)) {
        filas.push({
          codigo: entregable.codigo,
          descripcion: entregable.descripcion,
          detalle: `${numero.format(Number(entregable.cantidadMeta))} ${entregable.unidad}`,
          nivel: 2,
        });
      }
    }
  }
  return filas;
}

const SANGRIA = ["", "pl-4", "pl-8"] as const;

function VistaPrevia({ preview }: { preview: StructureImportPreview }) {
  const { resumen, reemplaza } = preview;
  const hayEstructura = Object.values(reemplaza).some((n) => n > 0);
  return (
    <div className="flex flex-col gap-2 surface-inner p-3">
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
        <FileSpreadsheet className="size-4" />
        El archivo es válido: {conteo(resumen)}.
      </p>
      {hayEstructura && (
        <p
          data-testid="estructura-po-reemplaza"
          className="rounded-12 border border-alerta/30 bg-alerta-bg px-3 py-2 text-[12.5px] text-ink-800"
        >
          Reemplaza la estructura actual ({conteo(reemplaza)}). El presupuesto no cambia.
        </p>
      )}
      <div className="max-h-[45dvh] overflow-auto rounded-inner border border-border bg-panel">
        <Table className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Código</TableHead>
              <TableHead scope="col">Descripción</TableHead>
              <TableHead scope="col">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasDelPlan(preview.plan).map((fila) => (
              <TableRow key={fila.codigo} className={fila.nivel === 0 ? "font-semibold" : undefined}>
                <TableCell className={`font-mono text-[11.5px] text-ink-600 ${SANGRIA[fila.nivel]}`}>{fila.codigo}</TableCell>
                <TableCell className="whitespace-normal text-ink-800">{fila.descripcion}</TableCell>
                <TableCell className="whitespace-nowrap text-ink-600">{fila.detalle}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12.5px] text-ink-600">
        Los códigos los genera el sistema. El medio de verificación y la unidad de los indicadores quedan vacíos.
      </p>
    </div>
  );
}

function ErroresArchivo({ errores }: { errores: StructureImportError[] }) {
  return (
    <div data-testid="estructura-po-errores" className="flex flex-col gap-2">
      <div
        role="alert"
        className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
      >
        El archivo tiene {plural(errores.length, "error", "errores")}. No se importó nada: corrígelos y vuelve a validar.
      </div>
      <div className="overflow-x-auto">
        <Table className="text-[12.5px]">
          <TableHeader>
            <TableRow>
              {["Hoja", "Celda", "Mensaje"].map((titulo) => (
                <TableHead key={titulo} scope="col">
                  {titulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {errores.map((error, indice) => (
              <TableRow key={`${error.hoja ?? "archivo"}-${error.fila ?? "-"}-${indice}`} className="align-top">
                <TableCell className="align-top">{error.hoja ?? "—"}</TableCell>
                <TableCell className="align-top font-mono text-[11.5px]">
                  {error.fila === null ? "—" : `${error.columna ?? ""}${error.fila}`}
                </TableCell>
                <TableCell className="align-top whitespace-normal">{error.mensaje}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EstructuraPOImportDialog({ proyectoId }: { proyectoId: string }) {
  const inputId = useId();
  const importar = useImportStructurePO(proyectoId);
  const [open, setOpen] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StructureImportPreview | null>(null);
  const [errores, setErrores] = useState<StructureImportError[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function limpiarResultado() {
    setPreview(null);
    setErrores(null);
    setError(null);
  }

  function cambiarApertura(abierto: boolean) {
    setOpen(abierto);
    if (!abierto) {
      setArchivo(null);
      setArchivoError(null);
      limpiarResultado();
    }
  }

  function elegirArchivo(event: ChangeEvent<HTMLInputElement>) {
    limpiarResultado();
    const elegido = event.target.files?.[0] ?? null;
    if (!elegido) {
      setArchivo(null);
      setArchivoError(null);
    } else if (!/\.xlsx$/i.test(elegido.name)) {
      setArchivo(null);
      setArchivoError(NOT_XLSX);
    } else if (elegido.size > IMPORT_MAX_BYTES) {
      setArchivo(null);
      setArchivoError(TOO_LARGE);
    } else {
      setArchivo(elegido);
      setArchivoError(null);
    }
  }

  async function enviar(validar: boolean) {
    if (!archivo) return;
    limpiarResultado();
    try {
      const resultado = await importar.mutateAsync({ archivo, validar });
      if (resultado.importado) cambiarApertura(false);
      else setPreview(resultado);
    } catch (err) {
      if (err instanceof StructureImportReportError) setErrores(err.errores);
      else setError(errorMessage(err, "No pudimos importar la estructura. Inténtalo de nuevo."));
    }
  }

  const ocupado = importar.isPending;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        <Upload />
        Importar estructura (formato PO)
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(820px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Importar estructura (formato PO)
            </DialogTitle>
            <DialogDescription>
              Carga los objetivos, indicadores, actividades y entregables desde el Excel de la PO: una hoja con «Objetivo
              especifico», «Resultados (indicador)» y «Resultados (meta)», y otra con una fila por entregable y las
              columnas «Actividad», «Entregables», «Inicio (semana)», «Fin (semana)», «Cantidad» y «Unidad». Primero valida
              el archivo y revisa la vista previa; nada se guarda hasta que confirmes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId} className="text-[12px] text-ink-600">
              Archivo de la estructura (.xlsx, máx. 4 MB)
            </Label>
            <Input
              id={inputId}
              type="file"
              accept=".xlsx"
              onChange={elegirArchivo}
              disabled={ocupado}
              className="h-auto px-3 py-2"
            />
            <InlineError message={archivoError} />
          </div>

          <InlineError message={error} />
          {preview && <VistaPrevia preview={preview} />}
          {errores && <ErroresArchivo errores={errores} />}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => cambiarApertura(false)} disabled={ocupado}>
              Cancelar
            </Button>
            {preview ? (
              <Button type="button" disabled={ocupado} onClick={() => void enviar(false)}>
                {ocupado && <LoaderCircle className="animate-spin" />}
                Confirmar importación
              </Button>
            ) : (
              <Button type="button" disabled={!archivo || ocupado} onClick={() => void enviar(true)}>
                {ocupado && <LoaderCircle className="animate-spin" />}
                Validar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
