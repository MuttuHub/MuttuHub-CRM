// Plantilla Excel del proyecto (S7 U6): descarga la plantilla precargada e
// importa la diligenciada en dos pasos — validar (no escribe) y confirmar. Los
// errores se muestran agrupados por hoja y se pueden bajar como CSV armado en el
// navegador (nunca `exceljs` en el bundle del cliente). Visibilidad solo de
// comodidad: la autoridad es la API (403 a otros roles, 409 fuera de BORRADOR).

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
import { errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  ImportReportError,
  downloadProjectTemplate,
  saveBlobAs,
  useImportTemplate,
  type ImportReemplaza,
  type ImportResumen,
  type ImportValidacion,
  type ProjectListRow,
} from "@/hooks/projects";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { agruparPorHoja, reporteACsv, type ReportePlantilla } from "@/lib/proyectos/plantilla-reporte";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TOO_LARGE = "El archivo supera el límite de 4 MB.";
const NOT_XLSX = "Solo se acepta la plantilla en formato Excel (.xlsx).";

function resumenTexto(resumen: ImportResumen): { clave: string; texto: string }[] {
  return [
    { clave: "objetivos", texto: plural(resumen.objetivos, "objetivo", "objetivos") },
    { clave: "actividades", texto: plural(resumen.actividades, "actividad", "actividades") },
    { clave: "entregables", texto: plural(resumen.entregables, "entregable", "entregables") },
    { clave: "indicadores", texto: plural(resumen.indicadores, "indicador", "indicadores") },
    { clave: "rubros", texto: `${plural(resumen.rubros, "rubro", "rubros")} con presupuesto` },
    {
      clave: "celdas",
      texto: `${plural(resumen.celdas_programacion, "celda", "celdas")} de programación`,
    },
  ];
}

function reemplazaTexto(reemplaza: ImportReemplaza): string {
  const partes = [
    plural(reemplaza.objetivos, "objetivo", "objetivos"),
    plural(reemplaza.actividades, "actividad", "actividades"),
    plural(reemplaza.entregables, "entregable", "entregables"),
    plural(reemplaza.indicadores, "indicador", "indicadores"),
  ];
  return `Se reemplazará: ${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}.`;
}

function HallazgoTabla({ errores }: { errores: ReportePlantilla["errores"] }) {
  return (
    <div className="overflow-x-auto">
      <Table className="text-[12.5px]">
        <TableHeader>
          <TableRow>
            {["Regla", "Fila", "Columna", "Valor", "Mensaje"].map((titulo) => (
              <TableHead key={titulo} scope="col">
                {titulo}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {errores.map((error, indice) => (
            <TableRow key={`${error.regla}-${error.fila}-${indice}`} className="align-top">
              <TableCell className="align-top font-mono text-[12px]">{error.regla}</TableCell>
              <TableCell className="align-top">{error.fila ?? "—"}</TableCell>
              <TableCell className="align-top">{error.columna ?? "—"}</TableCell>
              <TableCell className="max-w-[14rem] align-top break-words whitespace-normal">{error.valor ?? "—"}</TableCell>
              <TableCell className="align-top whitespace-normal">{error.mensaje}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ImportDialog({ proyecto }: { proyecto: ProjectListRow }) {
  const inputId = useId();
  const importar = useImportTemplate(proyecto.id);
  const [open, setOpen] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [validacion, setValidacion] = useState<ImportValidacion | null>(null);
  const [reporte, setReporte] = useState<ReportePlantilla | null>(null);
  const [error, setError] = useState<string | null>(null);

  function limpiarResultado() {
    setValidacion(null);
    setReporte(null);
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
      await downloadProjectTemplate(proyecto.id);
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
      return;
    }
    if (!/\.xlsx$/i.test(elegido.name)) {
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
      if (resultado.importado) {
        cambiarApertura(false);
      } else {
        setValidacion(resultado);
      }
    } catch (err) {
      if (err instanceof ImportReportError) setReporte(err.reporte);
      else setError(errorMessage(err, "No pudimos importar la plantilla. Inténtalo de nuevo."));
    }
  }

  function descargarReporte() {
    if (!reporte) return;
    saveBlobAs(
      new Blob([reporteACsv(reporte)], { type: "text/csv;charset=utf-8" }),
      `${proyecto.codigo}-reporte-importacion.csv`,
    );
  }

  const ocupado = importar.isPending;

  return (
    <div data-testid="estructura-plantilla" className="flex flex-wrap items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={descargando} onClick={() => void descargarPlantilla()}>
        {descargando ? <LoaderCircle className="animate-spin" /> : <Download />}
        Descargar plantilla
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        <Upload />
        Importar plantilla
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(860px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Importar plantilla de proyecto
            </DialogTitle>
            <DialogDescription>
              Reemplaza la estructura, el presupuesto, la programación, las fechas, las líneas y los municipios del
              borrador con el contenido del Excel. Si hay errores, no se escribe nada.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId} className="text-[12px] text-ink-600">
              Archivo de la plantilla (.xlsx, máx. 4 MB)
            </Label>
            <Input
              id={inputId}
              type="file"
              accept=".xlsx"
              onChange={elegirArchivo}
              disabled={ocupado}
              className="h-auto rounded-12 bg-panel px-3 py-2"
            />
            <InlineError message={archivoError} />
          </div>

          <InlineError message={error} />

          {validacion && (
            <div className="flex flex-col gap-2 rounded-[14px] border border-ink-200 bg-ink-100 p-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
                <FileSpreadsheet className="size-4" />
                La plantilla es válida.
              </p>
              <ul data-testid="import-resumen" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-700">
                {resumenTexto(validacion.resumen).map((item) => (
                  <li key={item.clave}>{item.texto}</li>
                ))}
              </ul>
              <p data-testid="import-reemplaza" className="text-[13px] text-ink-700">
                {reemplazaTexto(validacion.reemplaza)}
              </p>
              {validacion.advertencias.length > 0 && (
                <div data-testid="import-advertencias" className="text-[12.5px] text-ink-600">
                  <p className="font-semibold">
                    {plural(validacion.advertencias.length, "advertencia", "advertencias")} (no bloquean la importación)
                  </p>
                  <ul className="list-disc pl-5">
                    {validacion.advertencias.map((advertencia, indice) => (
                      <li key={`${advertencia.hoja}-${advertencia.fila}-${indice}`}>
                        {advertencia.hoja}
                        {advertencia.fila !== null ? `, fila ${advertencia.fila}` : ""}: {advertencia.mensaje}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {reporte && (
            <div data-testid="import-errores" className="flex flex-col gap-3">
              <div role="alert" className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo">
                La plantilla tiene {plural(reporte.errores.length, "error", "errores")}. No se importó nada: corrígelos y
                vuelve a validar.
              </div>
              {reporte.truncado && (
                <p className="text-[12.5px] text-ink-600">
                  Se muestran los primeros 500 errores. Corrige estos y vuelve a validar para ver el resto.
                </p>
              )}
              {agruparPorHoja(reporte.errores).map((grupo) => (
                <section key={grupo.hoja} data-testid="import-errores-hoja" className="rounded-[14px] border border-ink-200 p-2">
                  <h4 className="px-2 pt-1 text-[13px] font-semibold text-ink-900">
                    {grupo.hoja}{" "}
                    <span className="font-normal text-ink-500">· {plural(grupo.errores.length, "error", "errores")}</span>
                  </h4>
                  <HallazgoTabla errores={grupo.errores} />
                </section>
              ))}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={descargarReporte}>
                  <Download />
                  Descargar reporte (.csv)
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => cambiarApertura(false)} disabled={ocupado}>
              Cancelar
            </Button>
            {validacion ? (
              <Button type="button" disabled={ocupado} onClick={() => void enviar(false)}>
                {ocupado && <LoaderCircle className="animate-spin" />}
                Confirmar importación
              </Button>
            ) : (
              <Button type="button" disabled={!archivo || ocupado} onClick={() => void enviar(true)}>
                {ocupado && <LoaderCircle className="animate-spin" />}
                Validar plantilla
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
