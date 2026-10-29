// Formulario de registro de gasto (S6 U6): rubro (solo con valor asignado), fecha, periodo,
// tercero, número de documento, descripción, subtotal e IVA (strings, nunca Number; el Total lo
// calcula el sistema y solo se muestra) y UN soporte
// obligatorio: archivo (firma -> subida -> confirmación) o enlace https. Tras registrar, las
// alertas que devuelve la API (duplicado, sobregasto temprano) se muestran y esperan a que la
// persona las cierre: nunca bloquean, pero tampoco pasan inadvertidas.

"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError, SELECT_CLASS_LG as SELECT } from "@/components/proyectos/ui";
import {
  useCreateExpense,
  type AvanceMedioInput,
  type ExpenseAlert,
  type ProjectBudgetRubro,
  type ProjectExpense,
  type ProjectListRow,
} from "@/hooks/projects";
import { parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { periodOf, projectPeriods, todayInBogota } from "@/lib/proyectos/weeks";

export const SIN_SOPORTE_TEXT = "Adjunta al menos un soporte (archivo o enlace).";
const SUBTOTAL_INVALIDO =
  "Ingresa un subtotal válido con máximo dos decimales; usa coma para los decimales (1.500,50).";
const PERIODO_REQUERIDO = "Elige el periodo: la fecha del documento está fuera de los meses del proyecto.";
const IVA_VACIO = "Ingresa el IVA (puede ser 0).";
const IVA_INVALIDO =
  "Ingresa un IVA válido con máximo dos decimales; usa coma para los decimales (1.500,50). Puede ser 0.";

export const TIPO_SOPORTE_LABELS: Record<ProjectExpense["tipo_soporte"], string> = {
  FACTURA_PROVEEDOR: "Factura de proveedor",
  CUENTA_COBRO_PERSONA_NATURAL: "Cuenta de cobro de persona natural",
  OTRO: "Otro",
};

const FIELD = CAPTURE_FIELD;

/** AJ-05: the month of the document date when it is a project month; otherwise empty, and the person must choose. */
function periodoDeFecha(fecha: string, periodos: readonly string[]): string {
  if (fecha === "") return "";
  try {
    const mes = periodOf(fecha);
    return periodos.includes(mes) ? mes : "";
  } catch {
    return "";
  }
}

function Campo({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-[12px] text-ink-600">
        {label}
      </Label>
      {children}
    </div>
  );
}

function periodosDe(proyecto: Pick<ProjectListRow, "fecha_inicio" | "fecha_fin">): string[] {
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return [];
  try {
    return projectPeriods(proyecto.fecha_inicio, proyecto.fecha_fin);
  } catch {
    return [];
  }
}

/** Mismo parser es-CO que el presupuesto (punto = miles, coma = decimal); el subtotal debe ser mayor que cero. */
function normalizarSubtotal(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const monto = parseMontoInput(limpio);
  return monto !== null && toCents(monto) > BigInt(0) ? monto : null;
}

/** El IVA puede ser 0, pero hay que escribirlo: vacío no cuenta como 0. */
function normalizarIva(texto: string): string | null {
  const limpio = texto.trim();
  return limpio === "" ? null : parseMontoInput(limpio);
}

const SIN_RUBROS = "Aún no hay rubros con monto asignado. Asigna primero un monto a un rubro en Presupuesto.";

export function GastoForm({
  proyecto,
  rubros,
  onDone,
}: {
  proyecto: Pick<ProjectListRow, "id" | "fecha_inicio" | "fecha_fin">;
  rubros: ProjectBudgetRubro[];
  onDone: () => void;
}) {
  const create = useCreateExpense(proyecto.id);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const conAsignado = rubros.filter((rubro) => rubro.linea_id !== null && toCents(rubro.asignado) > BigInt(0));
  const periodos = periodosDe(proyecto);

  const [rubroId, setRubroId] = useState("");
  const [fecha, setFecha] = useState(todayInBogota());
  const [periodo, setPeriodo] = useState(() => periodoDeFecha(todayInBogota(), periodos));
  const [tipoSoporte, setTipoSoporte] = useState<ProjectExpense["tipo_soporte"]>("FACTURA_PROVEEDOR");
  const [tercero, setTercero] = useState("");
  const [tipoId, setTipoId] = useState<"" | "NIT" | "CC" | "CE">("");
  const [numeroId, setNumeroId] = useState("");
  const [numeroDoc, setNumeroDoc] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("0");
  const [tipoMedio, setTipoMedio] = useState<"archivo" | "enlace">("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombreEnlace, setNombreEnlace] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<ExpenseAlert[] | null>(null);

  /** S7: quita el archivo elegido y limpia el `<input>` nativo (no se resetea solo con el estado). */
  function quitarArchivo() {
    setArchivo(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
  }

  function submit() {
    const subtotalNormal = normalizarSubtotal(subtotal);
    const ivaNormal = normalizarIva(iva);
    if (conAsignado.length === 0) return setLocal(SIN_RUBROS);
    if (rubroId === "") return setLocal("Elige el rubro.");
    if (fecha === "") return setLocal("La fecha del documento es obligatoria.");
    if (periodo === "") return setLocal(PERIODO_REQUERIDO);
    if (subtotalNormal === null) return setLocal(SUBTOTAL_INVALIDO);
    if (iva.trim() === "") return setLocal(IVA_VACIO);
    if (ivaNormal === null) return setLocal(IVA_INVALIDO);
    if (tercero.trim() === "") return setLocal("El nombre del tercero es obligatorio.");
    if (numeroDoc.trim() === "") return setLocal("El número de documento es obligatorio.");
    if (descripcion.trim() === "") return setLocal("La descripción es obligatoria.");

    let soporte: AvanceMedioInput;
    if (tipoMedio === "archivo") {
      if (!archivo) return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "archivo", file: archivo };
    } else {
      if (url.trim() === "" || nombreEnlace.trim() === "") return setLocal(SIN_SOPORTE_TEXT);
      soporte = { tipo: "enlace", url_externa: url.trim(), nombre: nombreEnlace.trim() };
    }

    setLocal(null);
    create.mutate(
      {
        rubro_id: rubroId,
        fecha_documento: fecha,
        periodo,
        tipo_soporte: tipoSoporte,
        tercero_nombre: tercero.trim(),
        tercero_tipo_id: tipoId === "" ? null : tipoId,
        tercero_numero_id: numeroId.trim() === "" ? null : numeroId.trim(),
        numero_documento: numeroDoc.trim(),
        descripcion: descripcion.trim(),
        subtotal: subtotalNormal,
        iva: ivaNormal,
        soporte,
      },
      {
        onSuccess: ({ alertas: devueltas }) => {
          if (devueltas.length > 0) setAlertas(devueltas);
          else onDone();
        },
      },
    );
  }

  if (alertas) {
    return (
      <div role="status" className="mt-2 flex flex-col gap-2 rounded-inner border border-alerta/40 bg-panel p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
          <AlertTriangle className="size-4 text-alerta" strokeWidth={2} />
          Gasto registrado, con avisos
        </p>
        <ul className="flex flex-col gap-1 text-[12.5px] text-ink-800">
          {alertas.map((alerta, index) => (
            <li key={`${alerta.tipo}-${index}`}>{alerta.mensaje}</li>
          ))}
        </ul>
        <div>
          <Button type="button" size="sm" className={CAPTURE_BUTTON} onClick={onDone}>
            Entendido
          </Button>
        </div>
      </div>
    );
  }

  const p = `gasto-${proyecto.id}`;
  // The Total is always Subtotal + IVA and is never typed; it stays $ 0 until both amounts read as valid.
  const subtotalCents = normalizarSubtotal(subtotal);
  const ivaCents = normalizarIva(iva);
  const totalTexto = formatCOP(
    (subtotalCents === null ? BigInt(0) : toCents(subtotalCents)) + (ivaCents === null ? BigInt(0) : toCents(ivaCents)),
  );
  return (
    <form
      aria-label="Registrar gasto"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-2 grid gap-2.5 rounded-inner border border-border bg-panel p-3 sm:grid-cols-2"
    >
      {conAsignado.length === 0 && (
        <p className="text-[12.5px] text-ink-600 sm:col-span-2">{SIN_RUBROS}</p>
      )}

      <Campo id={`${p}-rubro`} label="Rubro">
        <select id={`${p}-rubro`} value={rubroId} onChange={(e) => setRubroId(e.target.value)} className={SELECT}>
          <option value="">Elige un rubro</option>
          {conAsignado.map((rubro) => (
            <option key={rubro.rubro_id} value={rubro.rubro_id}>
              {rubro.codigo ? `${rubro.codigo} · ${rubro.nombre}` : rubro.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo id={`${p}-subtotal`} label="Subtotal">
        <Input
          id={`${p}-subtotal`}
          inputMode="decimal"
          value={subtotal}
          onChange={(e) => setSubtotal(e.target.value)}
          className={FIELD}
        />
      </Campo>

      <Campo id={`${p}-iva`} label="IVA">
        <Input id={`${p}-iva`} inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} className={FIELD} />
      </Campo>

      <Campo id={`${p}-total`} label="Total">
        <Input id={`${p}-total`} readOnly tabIndex={-1} value={totalTexto} className={FIELD} />
      </Campo>

      <Campo id={`${p}-fecha`} label="Fecha del documento">
        <Input
          id={`${p}-fecha`}
          type="date"
          max={todayInBogota()}
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setPeriodo(periodoDeFecha(e.target.value, periodos));
          }}
          className={FIELD}
        />
      </Campo>

      <Campo id={`${p}-periodo`} label="Periodo">
        <select id={`${p}-periodo`} value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={SELECT}>
          <option value="">Elige el periodo</option>
          {periodos.map((mes) => (
            <option key={mes} value={mes}>
              {mes}
            </option>
          ))}
        </select>
      </Campo>

      <Campo id={`${p}-tipo`} label="Tipo de soporte">
        <select
          id={`${p}-tipo`}
          value={tipoSoporte}
          onChange={(e) => setTipoSoporte(e.target.value as ProjectExpense["tipo_soporte"])}
          className={SELECT}
        >
          {Object.entries(TIPO_SOPORTE_LABELS).map(([valorTipo, label]) => (
            <option key={valorTipo} value={valorTipo}>
              {label}
            </option>
          ))}
        </select>
      </Campo>

      <Campo id={`${p}-doc`} label="Número de documento">
        <Input id={`${p}-doc`} value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} className={FIELD} />
      </Campo>

      <Campo id={`${p}-tercero`} label="Tercero" className="sm:col-span-2">
        <Input id={`${p}-tercero`} value={tercero} onChange={(e) => setTercero(e.target.value)} className={FIELD} />
      </Campo>

      <Campo id={`${p}-tipoid`} label="Tipo de identificación">
        <select
          id={`${p}-tipoid`}
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value as "" | "NIT" | "CC" | "CE")}
          className={SELECT}
        >
          <option value="">Sin definir</option>
          <option value="NIT">NIT</option>
          <option value="CC">Cédula de ciudadanía</option>
          <option value="CE">Cédula de extranjería</option>
        </select>
      </Campo>

      <Campo id={`${p}-numid`} label="Número de identificación">
        <Input id={`${p}-numid`} value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className={FIELD} />
      </Campo>

      <Campo id={`${p}-desc`} label="Descripción" className="sm:col-span-2">
        <textarea
          id={`${p}-desc`}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className={CAPTURE_TEXTAREA}
        />
      </Campo>

      <fieldset className="sm:col-span-2">
        <legend className="text-[12px] text-ink-600">Soporte</legend>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          {(
            [
              ["archivo", "Archivo"],
              ["enlace", "Enlace"],
            ] as const
          ).map(([valorMedio, label]) => (
            <label key={valorMedio} className={CAPTURE_CHOICE}>
              <input
                type="radio"
                name={`${p}-medio`}
                value={valorMedio}
                checked={tipoMedio === valorMedio}
                onChange={() => setTipoMedio(valorMedio)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {tipoMedio === "archivo" ? (
        <Campo id={`${p}-archivo`} label="Archivo del soporte" className="sm:col-span-2">
          {archivo ? (
            <div className="flex min-h-11 items-center gap-2 text-[12.5px] text-ink-800 md:min-h-0">
              <span className="truncate">{archivo.name}</span>
              <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} onClick={quitarArchivo}>
                Quitar
              </Button>
            </div>
          ) : (
            <input
              id={`${p}-archivo`}
              ref={inputArchivoRef}
              type="file"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="min-h-11 text-base md:text-[12.5px] text-ink-800 md:min-h-0"
            />
          )}
        </Campo>
      ) : (
        <>
          <Campo id={`${p}-url`} label="URL">
            <Input id={`${p}-url`} type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className={FIELD} />
          </Campo>
          <Campo id={`${p}-nombre`} label="Nombre del enlace">
            <Input id={`${p}-nombre`} value={nombreEnlace} onChange={(e) => setNombreEnlace(e.target.value)} className={FIELD} />
          </Campo>
        </>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={create.isPending}>
          Registrar
        </Button>
        <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} disabled={create.isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
      <InlineError
        message={local ?? (create.isError ? errorMessage(create.error, "No pudimos registrar el gasto. Inténtalo de nuevo.") : null)}
        className="sm:col-span-2"
      />
    </form>
  );
}
