// Control genérico "Adjuntar archivo" (AJ-06, S6/S7): botón visible + formulario Archivo/Enlace,
// reutilizable por gasto, avance y medición. No conoce al padre al que se adjunta: cada caller pasa
// una mutación ya acotada a `{ soporte }` (misma forma que recibía `useAttachExpenseSupport`, sin el
// `id` del padre) y sus propios textos (error de respaldo, mensaje de "falta soporte", aria-label).

"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, InlineError } from "@/components/proyectos/ui";
import type { AvanceMedioInput } from "@/hooks/projects";

/** Texto visible del botón en las cuatro superficies (S6): gasto, medios de verificación y mediciones. */
export const ADJUNTAR_ARCHIVO_LABEL = "Adjuntar archivo";

/**
 * Subconjunto de `UseMutationResult` que el control necesita. El caller acota las variables de su
 * propia mutación (p. ej. agregando el `id` del gasto/avance/medición) para exponer esta forma.
 */
export type AdjuntarArchivoMutation = {
  mutate: (variables: { soporte: AvanceMedioInput }, options?: { onSuccess?: () => void }) => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: () => void;
};

export type AdjuntarArchivoControlProps = {
  /** Mutación ya acotada al padre; solo recibe `{ soporte }`. */
  adjuntar: AdjuntarArchivoMutation;
  /** Mensaje de respaldo cuando la mutación falla sin `Error.message` propio. */
  errorFallback: string;
  /** Mensaje cuando se envía sin elegir archivo ni completar el enlace. */
  sinSoporteText: string;
  /** `aria-label` del botón y del formulario abierto; el texto visible del botón no cambia. */
  ariaLabel?: string;
};

export function AdjuntarArchivoControl({ adjuntar, errorFallback, sinSoporteText, ariaLabel = ADJUNTAR_ARCHIVO_LABEL }: AdjuntarArchivoControlProps) {
  const prefijo = useId();
  const inputArchivoRef = useRef<HTMLInputElement>(null);
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

  /** S7: quita el archivo elegido y limpia el `<input>` nativo sin cerrar el formulario. */
  function quitarArchivo() {
    setArchivo(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
  }

  function enviar() {
    let soporte: AvanceMedioInput;
    if (tipo === "archivo") {
      if (!archivo) return setLocal(sinSoporteText);
      soporte = { tipo: "archivo", file: archivo };
    } else {
      if (url.trim() === "" || nombre.trim() === "") return setLocal(sinSoporteText);
      soporte = { tipo: "enlace", url_externa: url.trim(), nombre: nombre.trim() };
    }
    setLocal(null);
    adjuntar.mutate({ soporte }, { onSuccess: cerrar });
  }

  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)} aria-label={ariaLabel}>
        <Paperclip />
        {ADJUNTAR_ARCHIVO_LABEL}
      </Button>
    );
  }

  return (
    <form
      aria-label={ariaLabel}
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
          {archivo ? (
            <div className="flex min-h-11 items-center gap-2 text-[12.5px] text-ink-800 md:min-h-0">
              <span className="truncate">{archivo.name}</span>
              <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} onClick={quitarArchivo}>
                Quitar
              </Button>
            </div>
          ) : (
            <input
              id={`${prefijo}-archivo`}
              ref={inputArchivoRef}
              type="file"
              onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
              className="min-h-11 text-base md:min-h-0 md:text-[12.5px] text-ink-800"
            />
          )}
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
      <InlineError message={local ?? (adjuntar.isError ? errorMessage(adjuntar.error, errorFallback) : null)} />
    </form>
  );
}
