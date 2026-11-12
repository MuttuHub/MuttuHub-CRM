// Formulario de registro de gasto (S6 U6): rubro (solo con valor asignado), fecha, periodo,
// tercero, número de documento, descripción, subtotal e IVA (strings, nunca Number; el Total lo
// calcula el sistema y solo se muestra) y una LISTA de soportes obligatoria (AJ-08): uno o varios,
// hasta el tope de la API, cada uno archivo (firma -> subida -> confirmación) o enlace https, con
// «Agregar otro soporte» hacia abajo. Tras registrar, las alertas que devuelve la API (duplicado,
// sobregasto temprano) se muestran y esperan a que la persona las cierre: nunca bloquean, pero
// tampoco pasan inadvertidas.

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
  useExpenseDuplicates,
  useUpdateExpense,
  type AvanceMedioInput,
  type ExpenseAlert,
  type ExpenseDuplicateQuery,
  type ProjectBudgetRubro,
  type ProjectExpense,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatMontoInput, montoToInput, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { MAX_SOPORTES_POR_GASTO } from "@/components/proyectos/gasto-soportes";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { periodOf, projectPeriods, todayInBogota } from "@/lib/proyectos/weeks";
import { SelectorArchivo } from "@/components/proyectos/selector-archivo";

export const SIN_SOPORTE_TEXT = "Adjunta al menos un soporte (archivo o enlace).";
const SUBTOTAL_INVALIDO =
  "Ingresa un subtotal válido con máximo dos decimales; usa coma para los decimales (1.500,50).";
const PERIODO_REQUERIDO = "Elige el periodo: la fecha del documento está fuera de los meses del proyecto.";
const IVA_VACIO = "Ingresa el IVA (puede ser 0).";
const IVA_INVALIDO =
  "Ingresa un IVA válido con máximo dos decimales; usa coma para los decimales (1.500,50). Puede ser 0.";
const IVA_EXCEDE_19 =
  "El IVA supera el 19 % del subtotal. Revisa los valores; puedes registrar el gasto igualmente.";
const POSIBLE_DUPLICADO = "Posible duplicado";

export const TIPO_SOPORTE_LABELS: Record<ProjectExpense["tipo_soporte"], string> = {
  FACTURA_PROVEEDOR: "Factura de proveedor",
  CUENTA_COBRO_PERSONA_NATURAL: "Cuenta de cobro de persona natural",
  OTRO: "Otro",
};

const FIELD = CAPTURE_FIELD;

/** Una fila de la lista de soportes del gasto (AJ-08); `clave` es estable y arma los ids de la fila. */
type FilaSoporte = {
  clave: number;
  tipo: "archivo" | "enlace";
  archivo: File | null;
  url: string;
  nombre: string;
};

function filaSoporteVacia(clave: number): FilaSoporte {
  return { clave, tipo: "archivo", archivo: null, url: "", nombre: "" };
}

/** Fila a medias: un archivo sin elegir, o un enlace sin su URL o sin su nombre. */
function filaIncompleta(fila: FilaSoporte): boolean {
  return fila.tipo === "archivo" ? fila.archivo === null : fila.url.trim() === "" || fila.nombre.trim() === "";
}

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

function mesDeFecha(fecha: string): string | null {
  try {
    return periodOf(fecha);
  } catch {
    return null;
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

/**
 * S2/L16 (c): miles a la vista mientras se escribe. Si la persona sigue escribiendo dígitos después
 * de un grupo completo («1.500» + «0» = «1.5000»), esos dígitos alargan el entero: se quitan los puntos
 * y se vuelve a agrupar. Un punto seguido de menos de tres dígitos no se toca, para que «1.50» siga
 * siendo inválido en vez de convertirse en 150 en silencio.
 */
function formatearMontoAlEscribir(texto: string): string {
  return /^\d{1,3}(?:\.\d{3})+\d+$/.test(texto)
    ? formatMontoInput(texto.replace(/\./g, ""))
    : formatMontoInput(texto);
}

const SIN_RUBROS = "Aún no hay rubros con monto asignado. Asigna primero un monto a un rubro en Presupuesto.";

export function GastoForm({
  proyecto,
  rubros,
  onDone,
  gasto,
}: {
  proyecto: Pick<ProjectListRow, "id" | "fecha_inicio" | "fecha_fin">;
  rubros: ProjectBudgetRubro[];
  onDone: () => void;
  /**
   * S2/T6: si viene, el formulario corrige ese gasto (PATCH) en vez de registrar uno nuevo (POST). No ofrece
   * soportes —`GASTO_PATCH_SCHEMA` no los admite— y añade el motivo de la corrección.
   */
  gasto?: ProjectExpense;
}) {
  const create = useCreateExpense(proyecto.id);
  const update = useUpdateExpense(proyecto.id);
  const enCorreccion = gasto !== undefined;
  const conAsignado = rubros.filter((rubro) => rubro.linea_id !== null && toCents(rubro.asignado) > BigInt(0));
  const periodos = periodosDe(proyecto);

  const [rubroId, setRubroId] = useState(gasto?.rubro.id ?? "");
  const [fecha, setFecha] = useState(gasto?.fecha_documento.slice(0, 10) ?? todayInBogota());
  const [periodo, setPeriodo] = useState(() => gasto?.periodo ?? periodoDeFecha(todayInBogota(), periodos));
  // The expense will show «Cuenta en AAAA-MM» when its period is not the month of its document date.
  const cuentaEnOtroMes = periodo !== "" && fecha !== "" && mesDeFecha(fecha) !== periodo;
  const [tipoSoporte, setTipoSoporte] = useState<ProjectExpense["tipo_soporte"]>(
    gasto?.tipo_soporte ?? "FACTURA_PROVEEDOR",
  );
  const [tercero, setTercero] = useState(gasto?.tercero_nombre ?? "");
  const [tipoId, setTipoId] = useState<"" | "NIT" | "CC" | "CE">(gasto?.tercero_tipo_id ?? "");
  const [numeroId, setNumeroId] = useState(gasto?.tercero_numero_id ?? "");
  const [numeroDoc, setNumeroDoc] = useState(gasto?.numero_documento ?? "");
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? "");
  const [subtotal, setSubtotal] = useState(gasto ? formatMontoInput(montoToInput(gasto.subtotal)) : "");
  const [iva, setIva] = useState(gasto ? formatMontoInput(montoToInput(gasto.iva)) : "0");
  const [motivo, setMotivo] = useState("");
  const [filasSoporte, setFilasSoporte] = useState<FilaSoporte[]>(() => [filaSoporteVacia(1)]);
  // Se enciende al intentar guardar con alguna fila a medias; solo entonces se marca la fila, nunca antes.
  const [intentoSoporte, setIntentoSoporte] = useState(false);
  const proximaClaveSoporte = useRef(2);
  const [local, setLocal] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<ExpenseAlert[] | null>(null);

  // S2/L16 (b): consulta previa de duplicados en cuanto están la identificación y el documento. En una corrección
  // no corre: la consulta no excluye el gasto que se edita y se encontraría a sí mismo; el PATCH ya devuelve la
  // alerta real, sin la fila propia.
  const consultaDuplicados: ExpenseDuplicateQuery | null =
    !enCorreccion && numeroId.trim() !== "" && numeroDoc.trim() !== ""
      ? {
          tercero_tipo_id: tipoId === "" ? null : tipoId,
          tercero_numero_id: numeroId.trim(),
          numero_documento: numeroDoc.trim(),
        }
      : null;
  const duplicados = useExpenseDuplicates(proyecto.id, consultaDuplicados);
  const alertasDuplicado = duplicados.data ?? [];

  /** AJ-08: la lista se detiene en el tope de la API; cada fila nueva nace como archivo. */
  const puedeAgregarSoporte = filasSoporte.length < MAX_SOPORTES_POR_GASTO;

  function agregarSoporte() {
    if (!puedeAgregarSoporte) return;
    const clave = proximaClaveSoporte.current;
    proximaClaveSoporte.current += 1;
    setFilasSoporte((filas) => [...filas, filaSoporteVacia(clave)]);
  }

  function quitarSoporte(clave: number) {
    setFilasSoporte((filas) => filas.filter((fila) => fila.clave !== clave));
  }

  function cambiarSoporte(clave: number, cambio: Partial<Omit<FilaSoporte, "clave">>) {
    setFilasSoporte((filas) => filas.map((fila) => (fila.clave === clave ? { ...fila, ...cambio } : fila)));
  }

  function submit() {
    const subtotalNormal = normalizarSubtotal(subtotal);
    const ivaNormal = normalizarIva(iva);
    if (conAsignado.length === 0) return setLocal(SIN_RUBROS);
    if (rubroId === "") return setLocal("Elige el rubro.");
    if (fecha === "") return setLocal("La fecha del documento es obligatoria.");
    if (periodo === "") return setLocal(PERIODO_REQUERIDO);
    // Los errores de monto ya están en línea junto al campo; el aviso general solo cubre el vacío.
    if (subtotalNormal === null) return setLocal(subtotal.trim() === "" ? SUBTOTAL_INVALIDO : null);
    if (iva.trim() === "") return setLocal(IVA_VACIO);
    if (ivaNormal === null) return setLocal(null);
    if (tercero.trim() === "") return setLocal("El nombre del tercero es obligatorio.");
    if (numeroDoc.trim() === "") return setLocal("El número de documento es obligatorio.");
    if (descripcion.trim() === "") return setLocal("La descripción es obligatoria.");

    setLocal(null);
    const campos = {
      rubro_id: rubroId,
      fecha_documento: fecha,
      periodo,
      tipo_soporte: tipoSoporte,
      tercero_nombre: tercero.trim(),
      tercero_tipo_id: tipoId === "" ? null : tipoId,
      numero_documento: numeroDoc.trim(),
      descripcion: descripcion.trim(),
      subtotal: subtotalNormal,
      iva: ivaNormal,
    };
    const numeroIdLimpio = numeroId.trim() === "" ? null : numeroId.trim();
    const alGuardar = ({ alertas: devueltas }: { alertas: ExpenseAlert[] }) => {
      if (devueltas.length > 0) setAlertas(devueltas);
      else onDone();
    };

    // S2/T6: corregir es un PATCH, sin soportes. El permiso y el motivo obligatorio los decide el servidor; aquí
    // solo se omite un motivo vacío y la identificación que la API no envió (RNF-03), para no borrarla sin querer.
    if (gasto !== undefined) {
      const conservarIdentificacionOculta = gasto.tercero_numero_id === undefined && numeroIdLimpio === null;
      update.mutate(
        {
          id: gasto.id,
          ...campos,
          ...(conservarIdentificacionOculta ? {} : { tercero_numero_id: numeroIdLimpio }),
          ...(motivo.trim() === "" ? {} : { motivo: motivo.trim() }),
        },
        { onSuccess: alGuardar },
      );
      return;
    }

    const soportes: AvanceMedioInput[] = [];
    const filasIncompletas: number[] = [];
    for (const fila of filasSoporte) {
      if (fila.tipo === "archivo") {
        if (fila.archivo === null) {
          filasIncompletas.push(fila.clave);
          continue;
        }
        soportes.push({ tipo: "archivo", file: fila.archivo });
      } else {
        const enlace = fila.url.trim();
        const nombre = fila.nombre.trim();
        if (enlace === "" || nombre === "") {
          filasIncompletas.push(fila.clave);
          continue;
        }
        soportes.push({ tipo: "enlace", url_externa: enlace, nombre });
      }
    }
    // Sin ninguna fila completa el aviso es uno solo, el de siempre; si solo faltan filas sueltas se marca cada una.
    if (soportes.length === 0) {
      setIntentoSoporte(false);
      return setLocal(SIN_SOPORTE_TEXT);
    }
    if (filasIncompletas.length > 0) {
      setIntentoSoporte(true);
      return setLocal(null);
    }
    setIntentoSoporte(false);

    create.mutate(
      { ...campos, tercero_numero_id: numeroIdLimpio, soportes },
      { onSuccess: alGuardar },
    );
  }

  if (alertas) {
    return (
      <div role="status" className="mt-2 flex flex-col gap-2 rounded-inner border border-alerta/40 bg-panel p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
          <AlertTriangle className="size-4 text-alerta" strokeWidth={2} />
          {enCorreccion ? "Gasto corregido, con avisos" : "Gasto registrado, con avisos"}
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
  const pending = enCorreccion ? update.isPending : create.isPending;
  const errorGuardado = enCorreccion
    ? update.isError
      ? errorMessage(update.error, "No pudimos actualizar el gasto. Inténtalo de nuevo.")
      : null
    : create.isError
      ? errorMessage(create.error, "No pudimos registrar el gasto. Inténtalo de nuevo.")
      : null;
  // The Total is always Subtotal + IVA and is never typed; it stays $ 0 until both amounts read as valid.
  const subtotalCents = normalizarSubtotal(subtotal);
  const ivaCents = normalizarIva(iva);
  const totalTexto = formatCOP(
    (subtotalCents === null ? BigInt(0) : toCents(subtotalCents)) + (ivaCents === null ? BigInt(0) : toCents(ivaCents)),
  );
  // S2/L16 (c): errors are shown as soon as the field has text; empty stays for the submit check.
  const subtotalError = subtotal.trim() !== "" && subtotalCents === null ? SUBTOTAL_INVALIDO : null;
  const ivaError = iva.trim() !== "" && ivaCents === null ? IVA_INVALIDO : null;
  // «Supera el 19 %»: se compara en centavos y sin redondear (iva × 100 > subtotal × 19).
  const ivaExcede19 =
    subtotalCents !== null &&
    ivaCents !== null &&
    toCents(ivaCents) * BigInt(100) > toCents(subtotalCents) * BigInt(19);
  const ivaDescritoPor = [ivaError !== null ? `${p}-iva-error` : null, ivaExcede19 ? `${p}-iva-aviso` : null]
    .filter((id): id is string => id !== null)
    .join(" ");
  return (
    <form
      aria-label={enCorreccion ? "Corregir gasto" : "Registrar gasto"}
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
          onChange={(e) => setSubtotal(formatearMontoAlEscribir(e.target.value))}
          className={FIELD}
          aria-invalid={subtotalError !== null ? true : undefined}
          aria-describedby={subtotalError !== null ? `${p}-subtotal-error` : undefined}
        />
        {subtotalError !== null && (
          <div id={`${p}-subtotal-error`}>
            <InlineError message={subtotalError} />
          </div>
        )}
      </Campo>

      <Campo id={`${p}-iva`} label="IVA">
        <Input
          id={`${p}-iva`}
          inputMode="decimal"
          value={iva}
          onChange={(e) => setIva(formatearMontoAlEscribir(e.target.value))}
          className={FIELD}
          aria-invalid={ivaError !== null ? true : undefined}
          aria-describedby={ivaDescritoPor === "" ? undefined : ivaDescritoPor}
        />
        {ivaError !== null && (
          <div id={`${p}-iva-error`}>
            <InlineError message={ivaError} />
          </div>
        )}
      </Campo>

      <Campo id={`${p}-total`} label="Total">
        <Input id={`${p}-total`} readOnly tabIndex={-1} value={totalTexto} className={FIELD} />
      </Campo>

      {ivaExcede19 && (
        <p
          id={`${p}-iva-aviso`}
          role="status"
          className="flex items-start gap-1.5 text-[12.5px] text-alerta sm:col-span-2"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta" strokeWidth={2} aria-hidden />
          {IVA_EXCEDE_19}
        </p>
      )}

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
        <select
          id={`${p}-periodo`}
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          aria-describedby={cuentaEnOtroMes ? `${p}-periodo-nota` : undefined}
          className={SELECT}
        >
          <option value="">Elige el periodo</option>
          {periodos.map((mes) => (
            <option key={mes} value={mes}>
              {mes}
            </option>
          ))}
        </select>
        {cuentaEnOtroMes && (
          <p id={`${p}-periodo-nota`} className="text-[12px] text-ink-600">
            {`El gasto contará en ${periodo}, un mes distinto al de su documento: en las listas se verá «Cuenta en ${periodo}».`}
          </p>
        )}
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

      {alertasDuplicado.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-inner border border-alerta/40 bg-panel p-3 sm:col-span-2"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
            <AlertTriangle className="size-4 text-alerta" strokeWidth={2} aria-hidden />
            {POSIBLE_DUPLICADO}
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-800">
            {alertasDuplicado.map((alerta, index) => (
              <li key={`${alerta.gasto_id ?? alerta.proyecto_codigo ?? "duplicado"}-${index}`}>{alerta.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      <Campo id={`${p}-desc`} label="Descripción" className="sm:col-span-2">
        <textarea
          id={`${p}-desc`}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className={CAPTURE_TEXTAREA}
        />
      </Campo>

      {enCorreccion && (
        <Campo id={`${p}-motivo`} label="Motivo de la corrección" className="sm:col-span-2">
          <textarea
            id={`${p}-motivo`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-describedby={`${p}-motivo-nota`}
            className={CAPTURE_TEXTAREA}
          />
          <p id={`${p}-motivo-nota`} className="text-[12px] text-ink-600">
            Obligatorio al corregir el gasto de otra persona; si el gasto es tuyo, puedes dejarlo vacío.
          </p>
        </Campo>
      )}

      {!enCorreccion && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <p className="text-[12px] text-ink-600">Soportes</p>
          {filasSoporte.map((fila, indice) => {
            // La primera fila conserva los nombres de siempre; las siguientes los numeran para que cada control
            // tenga un id propio y un lector de pantalla no oiga cinco veces «URL».
            const numero = indice + 1;
            const sufijo = numero === 1 ? "" : ` ${numero}`;
            const idFila = `${p}-soporte-${fila.clave}`;
            const conError = intentoSoporte && filaIncompleta(fila);
            return (
              <fieldset
                key={fila.clave}
                aria-invalid={conError || undefined}
                aria-describedby={conError ? `${idFila}-error` : undefined}
                className="flex flex-col gap-2 rounded-inner border border-border bg-panel p-2 sm:grid sm:grid-cols-2"
              >
                <legend className="px-1 text-[12px] text-ink-600">{numero === 1 ? "Soporte" : `Soporte ${numero}`}</legend>
                <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                  {(
                    [
                      ["archivo", "Archivo"],
                      ["enlace", "Enlace"],
                    ] as const
                  ).map(([valorMedio, label]) => (
                    <label key={valorMedio} className={CAPTURE_CHOICE}>
                      <input
                        type="radio"
                        name={`${idFila}-medio`}
                        value={valorMedio}
                        checked={fila.tipo === valorMedio}
                        onChange={() => cambiarSoporte(fila.clave, { tipo: valorMedio })}
                      />
                      {`${label}${sufijo}`}
                    </label>
                  ))}
                </div>

                {fila.tipo === "archivo" ? (
                  <Campo id={`${idFila}-archivo`} label={`Archivo del soporte${sufijo}`} className="sm:col-span-2">
                    {fila.archivo ? (
                      <div className="flex min-h-11 items-center gap-2 text-[12.5px] text-ink-800 md:min-h-0">
                        <span className="truncate">{fila.archivo.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={CAPTURE_BUTTON}
                          onClick={() => cambiarSoporte(fila.clave, { archivo: null })}
                        >
                          Quitar
                        </Button>
                      </div>
                    ) : (
                      <SelectorArchivo id={`${idFila}-archivo`} onChange={(archivo) => cambiarSoporte(fila.clave, { archivo })} />
                    )}
                  </Campo>
                ) : (
                  <>
                    <Campo id={`${idFila}-url`} label={`URL${sufijo}`}>
                      <Input
                        id={`${idFila}-url`}
                        type="url"
                        placeholder="https://"
                        value={fila.url}
                        onChange={(e) => cambiarSoporte(fila.clave, { url: e.target.value })}
                        className={FIELD}
                      />
                    </Campo>
                    <Campo id={`${idFila}-nombre`} label={`Nombre del enlace${sufijo}`}>
                      <Input
                        id={`${idFila}-nombre`}
                        value={fila.nombre}
                        onChange={(e) => cambiarSoporte(fila.clave, { nombre: e.target.value })}
                        className={FIELD}
                      />
                    </Campo>
                  </>
                )}

                {conError && (
                  <div id={`${idFila}-error`} className="sm:col-span-2">
                    <InlineError message={SIN_SOPORTE_TEXT} />
                  </div>
                )}

                {numero > 1 && (
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={CAPTURE_BUTTON}
                      aria-label={`Quitar soporte ${numero}`}
                      onClick={() => quitarSoporte(fila.clave)}
                    >
                      Quitar
                    </Button>
                  </div>
                )}
              </fieldset>
            );
          })}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={CAPTURE_BUTTON}
              disabled={!puedeAgregarSoporte || pending}
              onClick={agregarSoporte}
            >
              Agregar otro soporte
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={pending}>
          {enCorreccion ? "Guardar cambios" : "Registrar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
      <InlineError message={local ?? errorGuardado} className="sm:col-span-2" />
    </form>
  );
}
