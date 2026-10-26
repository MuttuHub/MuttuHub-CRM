// Adjuntar un soporte a un gasto que ya existe (B8, S2): los gastos importados desde Excel nacen
// sin soporte y el adjunto viene aparte. Mismo flujo que el formulario de registro (archivo:
// firma -> subida -> confirmación; o enlace https). Lo muestra la fila solo a quien registró el
// gasto mientras es editable; la API es la autoridad (403, 409, máximo 5).

"use client";

import { useId, useState } from "react";
import { LoaderCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, InlineError } from "@/components/proyectos/ui";
import { SIN_SOPORTE_TEXT } from "@/components/proyectos/gasto-form";
import { useAttachExpenseSupport, type AvanceMedioInput } from "@/hooks/projects";

/** Tope de soportes vivos por gasto (mismo valor que `MAX_SOPORTES` de la API). */
export const MAX_SOPORTES_POR_GASTO = 5;
export const ADJUNTAR_ERROR = "No pudimos adjuntar el soporte. Inténtalo de nuevo.";

export function AdjuntarSoporte({ projectId, gastoId }: { projectId: string; gastoId: string }) {
  const adjuntar = useAttachExpenseSupport(projectId);
  const prefijo = useId();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"archivo" | "enlace">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  function cerrar() {
    setAbierto(false);
    setArchivo(null);
    setUrl("");
    setNombre("");
    setLocal(null);
    adjuntar.reset();
  }

  function enviar() {
    let soporte: AvanceMedioInput;
    if (tipo === "archivo") {
      if (!archivo) return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "archivo", file: archivo };
    } else {
      if (url.trim() === "" || nombre.trim() === "") return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "enlace", url_externa: url.trim(), nombre: nombre.trim() };
    }
    setLocal(null);
    adjuntar.mutate({ id: gastoId, soporte }, { onSuccess: cerrar });
  }

  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Paperclip />
        Adjuntar soporte
      </Button>
    );
  }

  return (
    <form
      aria-label="Adjuntar soporte"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        enviar();
      }}
      className="flex min-w-[200px] flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            ["archivo", "Archivo"],
            ["enlace", "Enlace"],
          ] as const
        ).map(([valor, label]) => (
          <label key={valor} className={CAPTURE_CHOICE}>
            <input
              type="radio"
              name={`${prefijo}-medio`}
              value={valor}
              checked={tipo === valor}
              onChange={() => setTipo(valor)}
            />
            {label}
          </label>
        ))}
      </div>

      {tipo === "archivo" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefijo}-archivo`} className="text-[12px] text-ink-600">
            Archivo del soporte
          </Label>
          <input
            id={`${prefijo}-archivo`}
            type="file"
            onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
            className="min-h-11 text-base md:min-h-0 md:text-[12.5px] text-ink-800"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefijo}-url`} className="text-[12px] text-ink-600">
              URL
            </Label>
            <Input id={`${prefijo}-url`} type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className={CAPTURE_FIELD} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${prefijo}-nombre`} className="text-[12px] text-ink-600">
              Nombre del enlace
            </Label>
            <Input id={`${prefijo}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAPTURE_FIELD} />
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={adjuntar.isPending}>
          {adjuntar.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Adjuntar
        </Button>
        <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} disabled={adjuntar.isPending} onClick={cerrar}>
          Cancelar
        </Button>
      </div>
      <InlineError message={local ?? (adjuntar.isError ? errorMessage(adjuntar.error, ADJUNTAR_ERROR) : null)} />
    </form>
  );
}
