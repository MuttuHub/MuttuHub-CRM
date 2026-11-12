// Formulario simple "Solicitar traslado" (AJ-09): rubro de origen, rubro de destino, valor y motivo. El
// reparto del valor entre los meses abiertos lo hace `construirTrasladoSimple`; aquí solo se pide lo
// mínimo y se envía una solicitud TRASLADO como la del formulario completo (`modificacion-form.tsx`).
// NO valida reglas: RF-28 y REQ-GAS-06 las decide la API y llegan en línea (todas a la vez). El diálogo
// lo pone quien lo abre (Finanzas).

"use client";

import { useId, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { MONTO_INVALIDO, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError, SELECT_CLASS_LG as SELECT_CLASS } from "@/components/proyectos/ui";
import {
  ModificacionReglasError,
  useProjectBudget,
  useProjectProgramming,
  useRequestModification,
  type ModificacionRegla,
  type ProjectListRow,
} from "@/hooks/projects";
import { toCents } from "@/lib/proyectos/money";
import { construirTrasladoSimple, periodosAbiertos, type RubroTraslado } from "@/lib/proyectos/traslado-simple";
import { periodOf, todayInBogota } from "@/lib/proyectos/weeks";

export function TrasladoForm({ proyecto, onDone }: { proyecto: ProjectListRow; onDone: () => void }) {
  const budget = useProjectBudget(proyecto.id);
  const programming = useProjectProgramming(proyecto.id);
  const solicitar = useRequestModification(proyecto.id);
  const id = useId();

  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reglas, setReglas] = useState<ModificacionRegla[]>([]);

  const cargando = budget.isLoading || programming.isLoading;
  const fallo = [budget, programming].find((q) => q.isError);

  // Only the project's budget lines: a traslado moves money between rubros that already have one.
  const rubros = (budget.data?.rubros ?? []).filter((r) => r.codigo !== null && r.linea_id !== null);
  const lineas: RubroTraslado[] = rubros.map((r) => ({
    codigo: r.codigo as string,
    asignado: r.asignado,
    celdas: (programming.data?.filas ?? []).filter((f) => f.rubro_id === r.rubro_id),
  }));

  // Same parser as the budget and the expenses (es-CO: dot = thousands, comma = decimals).
  const monto = valor.trim() === "" ? null : parseMontoInput(valor);
  const montoInvalido = valor.trim() !== "" && monto === null;
  const completo = origen !== "" && destino !== "" && monto !== null && !cargando;
  const traslado = completo
    ? construirTrasladoSimple({
        lineas,
        periodosAbiertos: periodosAbiertos(programming.data?.periodos ?? [], periodOf(todayInBogota())),
        origen,
        destino,
        valor: toCents(monto),
      })
    : null;
  const aviso = montoInvalido ? MONTO_INVALIDO : traslado && !traslado.ok ? traslado.error.mensaje : null;

  function cambiarOrigen(siguiente: string) {
    setOrigen(siguiente);
    if (siguiente === destino) setDestino("");
  }

  async function enviar() {
    if (!traslado?.ok) return;
    setError(null);
    setReglas([]);
    try {
      await solicitar.mutateAsync({ tipo: "TRASLADO", motivo: motivo.trim(), detalle: traslado.detalle });
      onDone();
    } catch (err) {
      if (err instanceof ModificacionReglasError) {
        setReglas(err.reglas);
      } else {
        setError(errorMessage(err, "No pudimos registrar la solicitud. Inténtalo de nuevo."));
      }
    }
  }

  const opcion = (r: (typeof rubros)[number]) => (
    <option key={r.rubro_id} value={r.codigo as string}>
      {r.codigo} · {r.nombre}
    </option>
  );

  return (
    <div className="flex flex-col gap-3">
      {fallo ? (
        <InlineError message={errorMessage(fallo.error, "No pudimos cargar el presupuesto del proyecto. Inténtalo de nuevo.")} />
      ) : cargando ? (
        <Skeleton className="h-24 w-full rounded-[14px]" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id={`${id}-origen`} label="Rubro de origen">
              <select id={`${id}-origen`} value={origen} onChange={(event) => cambiarOrigen(event.target.value)} className={SELECT_CLASS}>
                <option value="">Elige un rubro</option>
                {rubros.map(opcion)}
              </select>
            </Campo>
            <Campo id={`${id}-destino`} label="Rubro de destino">
              <select id={`${id}-destino`} value={destino} onChange={(event) => setDestino(event.target.value)} className={SELECT_CLASS}>
                <option value="">Elige un rubro</option>
                {rubros.filter((r) => r.codigo !== origen).map(opcion)}
              </select>
            </Campo>
          </div>
          <Campo id={`${id}-valor`} label="Valor">
            <Input
              id={`${id}-valor`}
              inputMode="decimal"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              className={CAPTURE_FIELD}
            />
          </Campo>
        </>
      )}

      <Campo id={`${id}-motivo`} label="Motivo">
        <textarea
          id={`${id}-motivo`}
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          rows={3}
          maxLength={1000}
          className={CAPTURE_TEXTAREA}
        />
      </Campo>

      <InlineError message={aviso ?? error} />
      {reglas.length > 0 && (
        <ul data-testid="traslado-reglas" role="alert" className="list-disc pl-5 text-[13px] text-destructivo">
          {reglas.map((regla, indice) => (
            <li key={`${regla.codigo}-${indice}`}>{regla.mensaje}</li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={solicitar.isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={solicitar.isPending || motivo.trim() === "" || !traslado?.ok}
          onClick={() => void enviar()}
        >
          {solicitar.isPending && <LoaderCircle className="animate-spin" />}
          Enviar solicitud
        </Button>
      </DialogFooter>
    </div>
  );
}

function Campo({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-[12px] text-ink-600">
        {label}
      </Label>
      {children}
    </div>
  );
}
