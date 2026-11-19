// T13 (S4) «Mover valor entre meses», shared by the Presupuesto tab's programming and the seguimiento view's
// «Nueva planeación» (V9), so both apply the same rule: a value moves between months of ONE budget line and the line
// total never changes. `MontoInput` lives here too so this module imports nothing from the screens that use it.

"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { mesLegible } from "@/components/proyectos/project-display";
import { InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { MONTO_INVALIDO, formatMontoInput, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMoveProgramming, type ProjectProgramming } from "@/hooks/projects";
import { toCents } from "@/lib/proyectos/money";
import { periodosAbiertos } from "@/lib/proyectos/traslado-simple";
import { periodOf, todayInBogota } from "@/lib/proyectos/weeks";

/**
 * Campo de monto compartido con la tabla de asignación (`project-presupuesto.tsx`, X4). Mientras tiene
 * el foco muestra exactamente lo que se escribe (sin reformatear: el cursor no salta y un borrado
 * nunca cambia el valor); al salir agrupa los miles. Un texto que no es un monto se deja intacto
 * para que `parseMontoInput` lo rechace con un aviso.
 */
export function MontoInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={enfocado ? value : formatMontoInput(value)}
      onFocus={() => setEnfocado(true)}
      onBlur={() => setEnfocado(false)}
      onChange={(event) => onChange(event.target.value)}
      className={className ?? "w-full min-w-24 px-2 text-right text-base md:text-[12.5px] tabular-nums"}
    />
  );
}

/** "1.1 R05" for an activity line, "R05" for a legacy one. */
export const nombreLinea = (c: ProjectProgramming["control_por_linea"][number]) =>
  `${c.actividad ? `${c.actividad.codigo} ` : ""}${c.codigo ?? c.nombre}`;

/**
 * T13 (S4): «El Gestor puede mover valores entre meses de una misma línea sin aprobación, siempre que el total de la
 * línea no cambie.» Only the current month and the later ones are offered («Los meses ya cerrados no se
 * modifican»); the API decides the rest (value available in the origin month) and its refusal shows inline.
 */
export function MoverValor({ proyectoId, data }: { proyectoId: string; data: ProjectProgramming }) {
  const mover = useMoveProgramming(proyectoId);
  const [linea, setLinea] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const mesEnCurso = periodOf(todayInBogota());
  const abiertos = periodosAbiertos(data.periodos, mesEnCurso);
  const monto = valor.trim() === "" ? null : parseMontoInput(valor);
  const listo = linea !== "" && origen !== "" && destino !== "" && monto !== null && toCents(monto) > toCents("0");

  function cambiarOrigen(siguiente: string) {
    setOrigen(siguiente);
    if (siguiente === destino) setDestino("");
  }

  const error =
    valor.trim() !== "" && monto === null
      ? MONTO_INVALIDO
      : mover.isError
        ? errorMessage(mover.error, "No pudimos mover el valor. Inténtalo de nuevo.")
        : null;

  return (
    <div data-testid="programacion-mover" className="mt-3 flex flex-col gap-2 rounded-inner border border-border bg-panel p-3">
      <h5 className="text-[12.5px] font-semibold text-ink-800">Mover valor entre meses</h5>
      <p className="text-[12px] text-ink-500">
        Pasa un valor de un mes a otro de la misma línea sin cambiar su total. Solo el mes en curso y los siguientes; los
        meses cerrados no se modifican.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-600">
          Línea
          <select aria-label="Línea" value={linea} onChange={(event) => setLinea(event.target.value)} className={SELECT_CLASS}>
            <option value="">Elige una línea</option>
            {data.control_por_linea.map((c) => (
              <option key={c.linea_id} value={c.linea_id}>
                {nombreLinea(c)} {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-600">
          Mes de origen
          <select aria-label="Mes de origen" value={origen} onChange={(event) => cambiarOrigen(event.target.value)} className={SELECT_CLASS}>
            <option value="">Elige un mes</option>
            {abiertos.map((periodo) => (
              <option key={periodo} value={periodo}>{mesLegible(periodo)}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-600">
          Mes de destino
          <select aria-label="Mes de destino" value={destino} onChange={(event) => setDestino(event.target.value)} className={SELECT_CLASS}>
            <option value="">Elige un mes</option>
            {/* «… del mes en curso hacia meses futuros, o entre meses futuros»: the destination is always a future month. */}
            {abiertos.filter((periodo) => periodo !== origen && periodo > mesEnCurso).map((periodo) => (
              <option key={periodo} value={periodo}>{mesLegible(periodo)}</option>
            ))}
          </select>
        </label>
        <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-600">
          Valor
          <MontoInput label="Valor a mover" value={valor} onChange={setValor} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={!listo || mover.isPending}
        onClick={() => mover.mutate({ linea_id: linea, origen, destino, valor: monto as string }, { onSuccess: () => setValor("") })}
      >
        {mover.isPending && <LoaderCircle className="size-4 animate-spin" />}
        Mover valor
      </Button>
      <InlineError message={error} />
    </div>
  );
}
