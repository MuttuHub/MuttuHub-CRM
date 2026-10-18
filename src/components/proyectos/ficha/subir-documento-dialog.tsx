// «Subir documento»: un documento general del proyecto (contrato, convenio, acta) como archivo o enlace.
//
// El archivo se sube con el flujo ADR-13 del hook (firma -> subida directa a Storage -> confirmación con
// metadatos); los bytes nunca pasan por el route handler. El enlace es una URL https con nombre. Los
// errores de la API se muestran en línea y el diálogo queda abierto para corregir.

"use client";

import { useState } from "react";
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
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { useCreateProjectDocument } from "@/hooks/projects";

const ERROR = "No pudimos subir el documento. Inténtalo de nuevo.";

type Modo = "archivo" | "enlace";

const MODOS: readonly { valor: Modo; etiqueta: string }[] = [
  { valor: "archivo", etiqueta: "Subir un archivo" },
  { valor: "enlace", etiqueta: "Enlace" },
];

export function SubirDocumentoDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crear = useCreateProjectDocument(projectId);
  const [modo, setModo] = useState<Modo>("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cerrar = (abierto: boolean) => {
    if (!abierto) {
      setModo("archivo");
      setArchivo(null);
      setUrl("");
      setNombre("");
      setError(null);
    }
    onOpenChange(abierto);
  };

  const enviar = async () => {
    setError(null);
    try {
      if (modo === "archivo") {
        if (!archivo) {
          setError("Selecciona el archivo.");
          return;
        }
        await crear.mutateAsync({ tipo: "archivo", file: archivo });
      } else {
        if (!url.trim() || !nombre.trim()) {
          setError("Completa el enlace y su nombre.");
          return;
        }
        await crear.mutateAsync({ tipo: "enlace", url_externa: url.trim(), nombre: nombre.trim() });
      }
      cerrar(false);
    } catch (err) {
      setError(errorMessage(err, ERROR));
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[min(520px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>
            Adjunta un contrato, convenio o acta del proyecto como archivo o como enlace.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-[12px] text-ink-600">Tipo de documento</legend>
          <div className="flex flex-wrap items-center gap-4">
            {MODOS.map((opcion) => (
              <label
                key={opcion.valor}
                className="flex min-h-11 items-center gap-2 text-[13px] text-ink-800 md:min-h-0"
              >
                <input
                  type="radio"
                  name="documento-modo"
                  value={opcion.valor}
                  checked={modo === opcion.valor}
                  onChange={() => setModo(opcion.valor)}
                />
                {opcion.etiqueta}
              </label>
            ))}
          </div>

          {modo === "archivo" ? (
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="documento-archivo" className="text-[12px] text-ink-600">
                Archivo
              </Label>
              <input
                id="documento-archivo"
                type="file"
                onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
                className="min-h-11 text-base text-ink-800 md:min-h-0 md:text-[12.5px]"
              />
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="documento-url" className="text-[12px] text-ink-600">
                  URL
                </Label>
                <Input
                  id="documento-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label htmlFor="documento-nombre" className="text-[12px] text-ink-600">
                  Nombre del enlace
                </Label>
                <Input
                  id="documento-nombre"
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                />
              </div>
            </>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-[12.5px] text-destructivo">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void enviar()} disabled={crear.isPending}>
            {crear.isPending ? "Subiendo…" : "Subir documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
