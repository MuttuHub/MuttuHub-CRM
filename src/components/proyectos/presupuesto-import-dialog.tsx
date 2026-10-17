// Importar el presupuesto desde el Excel simple de la PO (`Rubro | Valor (COP)`):
// elegir archivo -> validar (no escribe) -> vista previa con lo actual y lo nuevo
// por rubro -> confirmar. Si el archivo tiene errores, se listan por fila y no se
// guarda nada. Visibilidad solo de comodidad: la autoridad es la API (403 a otros
// roles, 409 fuera de BORRADOR).

"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
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
  BudgetImportReportError,
  downloadBudgetTemplate,
  useImportBudget,
  type BudgetImportError,
  type BudgetImportPreview,
} from "@/hooks/projects";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const TOO_LARGE = "El archivo supera el límite de 4 MB.";
const NOT_XLSX = "Solo se acepta el presupuesto en formato Excel (.xlsx).";

const cop = (valor: string) => formatCOP(toCents(valor));

function VistaPrevia({ preview }: { preview: BudgetImportPreview }) {
  const descuadre = preview.diferencia !== null && toCents(preview.diferencia) !== toCents("0");
  return (
    <div className="flex flex-col gap-2 surface-inner p-3">
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
        <FileSpreadsheet className="size-4" />
        El archivo es válido: {plural(preview.cambios, "rubro cambia", "rubros cambian")}.
      </p>
      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              <TableHead scope="col" numeric>Actual</TableHead>
              <TableHead scope="col" numeric>Nuevo</TableHead>
              <TableHead scope="col" numeric>Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rubros.map((r) => (
              <TableRow key={r.rubro_id} className={r.nuevo === r.actual ? "text-ink-500" : undefined}>
                <TableCell className="whitespace-normal text-ink-800">
                  <span className="font-mono text-[11.5px] text-ink-500">{r.codigo ?? "—"}</span>{" "}
                  <span>{r.nombre}</span>
                </TableCell>
                <TableCell numeric>{cop(r.actual)}</TableCell>
                <TableCell numeric className="font-semibold">{cop(r.nuevo)}</TableCell>
                <TableCell numeric>{cop(r.diferencia)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12.5px] text-ink-600">
        Los rubros activos que no estén en el archivo quedan en $ 0. La programación mensual no cambia.
      </p>
      {descuadre && preview.valor_total !== null && preview.diferencia !== null && (
        <p
          data-testid="presupuesto-import-aviso"
          className="rounded-12 border border-alerta/30 bg-alerta-bg px-3 py-2 text-[12.5px] text-ink-800"
        >
          La suma del presupuesto importado ({cop(preview.suma_nueva)}) no coincide con el valor total del proyecto (
          {cop(preview.valor_total)}): diferencia de {cop(preview.diferencia)}. Puedes importarlo igual; la aprobación de la
          línea base exige que coincidan.
        </p>
      )}
      {preview.valor_total === null && (
        <p className="text-[12.5px] text-ink-600">El valor total se fijará con la suma al importar el presupuesto.</p>
      )}
    </div>
  );
}

function ErroresArchivo({ errores }: { errores: BudgetImportError[] }) {
  return (
    <div data-testid="presupuesto-import-errores" className="flex flex-col gap-2">
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
              {["Fila", "Rubro", "Mensaje"].map((titulo) => (
                <TableHead key={titulo} scope="col">
                  {titulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {errores.map((error, indice) => (
              <TableRow key={`${error.fila ?? "archivo"}-${indice}`} className="align-top">
                <TableCell className="align-top">{error.fila ?? "—"}</TableCell>
                <TableCell className="max-w-[14rem] align-top break-words whitespace-normal">{error.rubro ?? "—"}</TableCell>
                <TableCell className="align-top whitespace-normal">{error.mensaje}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function PresupuestoImportDialog({ proyectoId }: { proyectoId: string }) {
  const inputId = useId();
  const importar = useImportBudget(proyectoId);
  const [open, setOpen] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BudgetImportPreview | null>(null);
  const [errores, setErrores] = useState<BudgetImportError[] | null>(null);
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

  async function descargarPlantilla() {
    setDescargando(true);
    try {
      await downloadBudgetTemplate(proyectoId);
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos descargar la plantilla. Inténtalo de nuevo."));
    } finally {
      setDescargando(false);
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
      if (err instanceof BudgetImportReportError) setErrores(err.errores);
      else setError(errorMessage(err, "No pudimos importar el presupuesto. Inténtalo de nuevo."));
    }
  }

  const ocupado = importar.isPending;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        <Upload />
        Importar presupuesto
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(760px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Importar presupuesto
            </DialogTitle>
            <DialogDescription>
              Carga el valor asignado de cada rubro desde un Excel con las columnas «Rubro» y «Valor (COP)». Primero
              valida el archivo y revisa los cambios; nada se guarda hasta que confirmes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 surface-inner p-3">
            <p className="text-[13px] text-ink-700">¿Aún no tienes el formato?</p>
            <Button type="button" variant="outline" size="sm" disabled={descargando} onClick={() => void descargarPlantilla()}>
              {descargando ? <LoaderCircle className="animate-spin" /> : <Download />}
              Descargar plantilla
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId} className="text-[12px] text-ink-600">
              Archivo del presupuesto (.xlsx, máx. 4 MB)
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
