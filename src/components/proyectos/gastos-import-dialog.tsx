// Importar gastos desde Excel (B8): elegir archivo -> validar (no escribe) -> vista previa fila por
// fila (válidas e inválidas con su motivo y los avisos que no bloquean) -> importar solo las válidas
// -> resultado con las filas rechazadas. El archivo no lleva soportes (vienen aparte): el resultado
// recuerda adjuntarlos desde la lista. Visibilidad solo de comodidad: la autoridad es la API (403 a otros
// roles, 409 fuera de EN_EJECUCION).

"use client";

import { useId, useState, type ChangeEvent } from "react";
import { AlertTriangle, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
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
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  ExpensesImportReportError,
  downloadExpensesTemplate,
  useImportExpenses,
  type ExpenseAlert,
  type ExpensesImportApplied,
  type ExpensesImportError,
  type ExpensesImportPreview,
} from "@/hooks/projects";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const TOO_LARGE = "El archivo supera el límite de 4 MB.";
const NOT_XLSX = "Solo se aceptan los gastos en formato Excel (.xlsx).";

const cop = (valor: string) => formatCOP(toCents(valor));

function Avisos({ alertas }: { alertas: readonly ExpenseAlert[] }) {
  if (alertas.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-ink-700">
      {alertas.map((alerta, indice) => (
        <li key={`${alerta.tipo}-${indice}`} className="flex items-start gap-1">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-alerta" strokeWidth={2} />
          <span>{alerta.mensaje}</span>
        </li>
      ))}
    </ul>
  );
}

function VistaPrevia({ preview }: { preview: ExpensesImportPreview }) {
  const { resumen } = preview;
  return (
    <div className="flex flex-col gap-2 surface-inner p-3">
      <p data-testid="gastos-import-resumen" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
        <FileSpreadsheet className="size-4" />
        {plural(resumen.validas, "fila válida", "filas válidas")}
        {resumen.validas > 0 && <span className="font-normal text-ink-600">({cop(resumen.valor_validas)})</span>}
        {resumen.invalidas > 0 && <span> · {resumen.invalidas} con error</span>}
      </p>
      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              {["Fila", "Estado", "Rubro", "Tercero", "Documento"].map((titulo) => (
                <TableHead key={titulo} scope="col">
                  {titulo}
                </TableHead>
              ))}
              <TableHead scope="col" numeric>
                Total
              </TableHead>
              <TableHead scope="col">Observaciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.filas.map((f) => (
              <TableRow key={f.fila} className="align-top">
                <TableCell className="align-top">{f.fila}</TableCell>
                <TableCell className="align-top">
                  <StatusChip tone={f.valida ? "exito" : "destructivo"}>{f.valida ? "Válida" : "Con error"}</StatusChip>
                </TableCell>
                <TableCell className="max-w-[12rem] align-top break-words whitespace-normal">{f.rubro ?? "—"}</TableCell>
                <TableCell className="max-w-[12rem] align-top break-words whitespace-normal">{f.tercero ?? "—"}</TableCell>
                <TableCell className="align-top font-mono">{f.numero_documento ?? "—"}</TableCell>
                <TableCell numeric className="align-top">
                  {f.valor === null ? "—" : cop(f.valor)}
                </TableCell>
                <TableCell className="min-w-[14rem] align-top whitespace-normal">
                  {f.mensaje !== null ? <span className="text-destructivo">{f.mensaje}</span> : <Avisos alertas={f.alertas} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[12.5px] text-ink-600">
        Solo se importan las filas válidas; las filas con error quedan fuera y puedes corregirlas y subirlas en otro archivo.
      </p>
    </div>
  );
}

function ErroresArchivo({ errores }: { errores: ExpensesImportError[] }) {
  return (
    <div data-testid="gastos-import-errores" className="flex flex-col gap-2">
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

function Resultado({ aplicado }: { aplicado: ExpensesImportApplied }) {
  return (
    <div data-testid="gastos-import-resultado" className="flex flex-col gap-2 surface-inner p-3 text-[13px] text-ink-800">
      <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-900">
        <FileSpreadsheet className="size-4" />
        Se importaron {plural(aplicado.creados, "gasto", "gastos")} ({cop(aplicado.valor_total)}).
      </p>
      <p>
        Adjunta el soporte de cada gasto desde la lista: un gasto sin soporte no se puede validar.
      </p>
      {aplicado.alertas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Avisos (no bloquean la importación)</p>
          <ul className="flex flex-col gap-1.5">
            {aplicado.alertas.map((a) => (
              <li key={a.fila}>
                <span className="font-semibold">Fila {a.fila}:</span> <Avisos alertas={a.alertas} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {aplicado.rechazadas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-destructivo">
            {plural(aplicado.rechazadas.length, "fila se rechazó", "filas se rechazaron")} y no se importó:
          </p>
          <ul className="flex flex-col gap-0.5">
            {aplicado.rechazadas.map((r, indice) => (
              <li key={`${r.fila ?? "archivo"}-${indice}`}>
                <span className="font-semibold">Fila {r.fila ?? "—"}:</span> {r.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GastosImportDialog({ proyectoId }: { proyectoId: string }) {
  const inputId = useId();
  const importar = useImportExpenses(proyectoId);
  const [open, setOpen] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExpensesImportPreview | null>(null);
  const [aplicado, setAplicado] = useState<ExpensesImportApplied | null>(null);
  const [errores, setErrores] = useState<ExpensesImportError[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function limpiarResultado() {
    setPreview(null);
    setAplicado(null);
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
      await downloadExpensesTemplate(proyectoId);
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
      if (resultado.importado) setAplicado(resultado);
      else setPreview(resultado);
    } catch (err) {
      if (err instanceof ExpensesImportReportError) setErrores(err.errores);
      else setError(errorMessage(err, "No pudimos importar los gastos. Inténtalo de nuevo."));
    }
  }

  const ocupado = importar.isPending;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => cambiarApertura(true)}>
        <Upload className="size-3.5" />
        Importar gastos
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(960px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Importar gastos
            </DialogTitle>
            <DialogDescription>
              Registra varios gastos desde un Excel con una fila por gasto. El archivo no lleva los soportes: se
              adjuntan después, gasto por gasto. Primero valida el archivo y revisa cada fila; nada se guarda hasta que
              confirmes.
            </DialogDescription>
          </DialogHeader>

          {!aplicado && (
            <>
              <div className="flex flex-wrap items-center gap-2 surface-inner p-3">
                <p className="text-[13px] text-ink-700">¿Aún no tienes el formato?</p>
                <Button type="button" variant="outline" size="sm" disabled={descargando} onClick={() => void descargarPlantilla()}>
                  {descargando ? <LoaderCircle className="animate-spin" /> : <Download />}
                  Descargar plantilla
                </Button>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={inputId} className="text-[12px] text-ink-600">
                  Archivo de gastos (.xlsx, máx. 4 MB)
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
            </>
          )}

          <InlineError message={error} />
          {preview && <VistaPrevia preview={preview} />}
          {errores && <ErroresArchivo errores={errores} />}
          {aplicado && <Resultado aplicado={aplicado} />}

          <DialogFooter>
            {aplicado ? (
              <Button type="button" onClick={() => cambiarApertura(false)}>
                Listo
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={() => cambiarApertura(false)} disabled={ocupado}>
                  Cancelar
                </Button>
                {preview ? (
                  <Button type="button" disabled={ocupado || preview.resumen.validas === 0} onClick={() => void enviar(false)}>
                    {ocupado && <LoaderCircle className="animate-spin" />}
                    Importar {plural(preview.resumen.validas, "gasto", "gastos")}
                  </Button>
                ) : (
                  <Button type="button" disabled={!archivo || ocupado} onClick={() => void enviar(true)}>
                    {ocupado && <LoaderCircle className="animate-spin" />}
                    Validar
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
