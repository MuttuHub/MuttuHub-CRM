// Formulario de registro de gasto (S6 U6): rubro (solo con valor asignado), fecha, periodo,
// tercero, número de documento, descripción, subtotal e IVA (strings, nunca Number; el Total lo
// calcula el sistema y solo se muestra) y una LISTA de soportes obligatoria (AJ-08): uno o varios,
// hasta el tope de la API, cada uno archivo (firma -> subida -> confirmación) o enlace https, con
// «Agregar otro soporte» hacia abajo. Tras registrar, las alertas que devuelve la API (duplicado,
// sobregasto temprano) se muestran y esperan a que la persona las cierre: nunca bloquean, pero
// tampoco pasan inadvertidas.

"use client";

import { Fragment, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { esGestionDelProyecto } from "@/components/proyectos/project-display";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError, SELECT_CLASS_LG as SELECT } from "@/components/proyectos/ui";
import {
  useCreateExpense,
  useExpenseDuplicates,
  useProjectActivities,
  useProjectObjectives,
  useUpdateExpense,
  type AvanceMedioInput,
  type ExpenseAlert,
  type ExpenseDuplicateQuery,
  type ProjectBudgetLinea,
  type ProjectBudgetRubro,
  type ProjectExpense,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatMontoInput, montoToInput, parseMontoInput } from "@/components/proyectos/presupuesto-ui";
import { MAX_SOPORTES_POR_GASTO } from "@/components/proyectos/gasto-soportes";
import { GRUPO_GESTION } from "@/lib/proyectos/actividad";
import { formatCOP, fromCents, sumCents, toCents, type Cents } from "@/lib/proyectos/money";
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

/** S9/T14.2-B2: la regla de la suma, con la misma redacción que manda el servidor (`REPARTO_SUMA_MESSAGE`). */
const REPARTO_SUMA = "Las líneas de la distribución deben sumar exactamente el total de la factura.";
/** S9: cada línea tiene que ser una línea del proyecto y llevar un valor mayor que cero (mensajes del servidor). */
const REPARTO_LINEA = "Cada línea de la distribución debe ser una línea del proyecto con valor asignado.";
const REPARTO_VALOR = "El valor de cada línea de la distribución debe ser mayor que cero.";
const AGREGAR_LINEA = "Agregar línea de la distribución";

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

/* S9/T14.1: el formulario elige Objetivo -> Actividad -> Rubro y guarda la línea exacta del presupuesto. */
/** Valor del select «Objetivo» que agrupa lo que no cuelga de un objetivo: «Gestión del proyecto». */
const OBJETIVO_GESTION = "__gestion__";
/** Valor del select «Actividad» de una línea heredada, sin actividad (D9): la etiqueta de Presupuesto. */
const SIN_ACTIVIDAD = "sin-actividad";
const ELIGE_OBJETIVO = "Elige el objetivo.";
const ELIGE_ACTIVIDAD = "Elige la actividad.";

/** Una opción de los selects de la cascada: el valor que se guarda en el estado y lo que se lee. */
type Opcion = { clave: string; etiqueta: string };

/** Una línea del presupuesto vista como actividad: sus rubros son los únicos que se pueden elegir. */
type RubroDeLinea = Opcion & { linea_id: string };
type ActividadDeLinea = Opcion & { objetivo: string; codigo: string | null; rubros: RubroDeLinea[] };

/**
 * La cascada Objetivo -> Actividad -> Rubro armada con las líneas del presupuesto (actividad + rubro + valor) y
 * las actividades del proyecto, que dicen a qué objetivo pertenecen. Una línea heredada (sin actividad) va a
 * «Gestión del proyecto» / «Sin actividad», como en Presupuesto; una actividad transversal, a «Gestión del
 * proyecto» sin objetivo. Una actividad que todavía no llegó se agrupa igual, para no dejar su línea sin ofrecer.
 */
function cascadaDeGasto(
  lineas: readonly ProjectBudgetLinea[],
  actividades: readonly { id: string; objetivo_id: string | null; tipo?: "NORMAL" | "TRANSVERSAL" | null; codigo: string; nombre: string }[],
): ActividadDeLinea[] {
  const porActividad = new Map<string, ActividadDeLinea>();
  for (const linea of lineas) {
    if (toCents(linea.valor) <= BigInt(0)) continue;
    const clave = linea.actividad_id ?? SIN_ACTIVIDAD;
    const actual = porActividad.get(clave);
    const rubro: RubroDeLinea = {
      clave: linea.rubro_id,
      etiqueta: linea.rubro_codigo ? `${linea.rubro_codigo} · ${linea.rubro_nombre}` : linea.rubro_nombre,
      linea_id: linea.linea_id,
    };
    if (actual) {
      actual.rubros.push(rubro);
      continue;
    }
    const enLinea = actividades.find((actividad) => actividad.id === linea.actividad_id);
    let objetivo = OBJETIVO_GESTION;
    if (enLinea !== undefined && !esGestionDelProyecto(enLinea) && enLinea.objetivo_id !== null) {
      objetivo = enLinea.objetivo_id;
    }
    const codigo = enLinea?.codigo ?? linea.actividad_codigo;
    const nombre = enLinea?.nombre ?? linea.actividad_nombre;
    porActividad.set(clave, {
      clave,
      codigo,
      etiqueta: codigo === null ? SIN_ACTIVIDAD : `${codigo} · ${nombre ?? ""}`,
      objetivo,
      rubros: [rubro],
    });
  }
  return [...porActividad.values()];
}

/** S9/T14.2-B2: una línea de la distribución de la factura: actividad + rubro + valor, cada una con su cascada. */
type FilaReparto = {
  clave: number;
  /** Línea de la que salió una fila ya guardada; se suelta en cuanto la persona toca la cascada de esa fila. */
  linea: string | null;
  objetivo: string;
  actividad: string;
  rubro: string;
  /** Importe tecleado, como texto es-CO; se lee con `parseMontoInput`, nunca con `Number`. */
  valor: string;
};

/**
 * Las filas con las que abre el formulario. Una factura ya repartida (dos o más líneas) las trae de su reparto, con
 * su línea guardada; cualquier otro caso abre con la fila única de siempre.
 */
function filasIniciales(gasto?: ProjectExpense): FilaReparto[] {
  const repartos = gasto?.repartos ?? [];
  if (repartos.length > 1) {
    return repartos.map((reparto, indice) => ({
      clave: indice + 1,
      linea: reparto.linea_id,
      objetivo: "",
      actividad: "",
      rubro: reparto.rubro.id,
      valor: formatMontoInput(montoToInput(reparto.valor)),
    }));
  }
  return [{ clave: 1, linea: null, objetivo: "", actividad: "", rubro: gasto?.rubro.id ?? "", valor: "" }];
}

/** El valor tecleado de una fila en centavos; null cuando todavía no es un monto mayor que cero. */
function valorDeReparto(fila: FilaReparto): Cents | null {
  if (fila.valor.trim() === "") return null;
  const limpio = parseMontoInput(fila.valor);
  if (limpio === null) return null;
  const cents = toCents(limpio);
  return cents > BigInt(0) ? cents : null;
}

/** La suma de las líneas en centavos: las que aún no tienen un importe válido suman 0 mientras se escribe. */
function sumarRepartos(filas: readonly FilaReparto[]): Cents {
  return sumCents(filas.map((fila) => valorDeReparto(fila) ?? BigInt(0)));
}

export function GastoForm({
  proyecto,
  rubros,
  lineas = [],
  onDone,
  gasto,
}: {
  proyecto: Pick<ProjectListRow, "id" | "fecha_inicio" | "fecha_fin">;
  rubros: ProjectBudgetRubro[];
  /**
   * S9/T14.1: las líneas del presupuesto (actividad + rubro + valor). Sin ellas el formulario conserva el orden
   * por rubro de siempre: un llamador anterior sigue funcionando sin cambios.
   */
  lineas?: ProjectBudgetLinea[];
  onDone: () => void;
  /**
   * S2/T6: si viene, el formulario corrige ese gasto (PATCH) en vez de registrar uno nuevo (POST). No ofrece
   * soportes —`GASTO_PATCH_SCHEMA` no los admite— y añade el motivo de la corrección.
   */
  gasto?: ProjectExpense;
}) {
  const create = useCreateExpense(proyecto.id);
  const update = useUpdateExpense(proyecto.id);
  // S9/T14.1: la actividad dice en qué objetivo está; el objetivo solo filtra, nunca se guarda.
  const actividadesQuery = useProjectActivities(proyecto.id);
  const objetivosQuery = useProjectObjectives(proyecto.id);
  const enCorreccion = gasto !== undefined;
  // Un rubro solo se ofrece si su línea tiene monto: la API rechaza una línea sin valor asignado.
  const actividades = cascadaDeGasto(lineas, actividadesQuery.data ?? []);
  const conLineas = actividades.length > 0;
  // S9/T14.2-B2: la cascada está siempre que el presupuesto traiga líneas. Una corrección abre su cascada solo si
  // la factura ya viene repartida (ahí la vista sí trae la línea de cada fila); una factura de una sola línea sigue
  // corrigiéndose con la lista de rubros de siempre, como hoy.
  const repartosGuardados = gasto?.repartos ?? [];
  const enCascada = conLineas && (!enCorreccion || repartosGuardados.length > 1);
  const conAsignado = rubros.filter((rubro) => rubro.linea_id !== null && toCents(rubro.asignado) > BigInt(0));
  const rubrosCorregibles = rubros.filter((rubro) => toCents(rubro.asignado) > BigInt(0));

  const objetivos = objetivosQuery.data ?? [];
  const opcionesObjetivo: Opcion[] = objetivos
    .filter((objetivo) => actividades.some((actividad) => actividad.objetivo === objetivo.id))
    .map((objetivo) => ({ clave: objetivo.id, etiqueta: `Objetivo ${objetivo.codigo} · ${objetivo.descripcion}` }));
  // Un objetivo que la lectura todavía no trajo sigue siendo elegible, con el código de sus actividades.
  for (const actividad of actividades) {
    const falta =
      actividad.objetivo !== OBJETIVO_GESTION && !opcionesObjetivo.some((opcion) => opcion.clave === actividad.objetivo);
    if (!falta) continue;
    const codigos = actividades
      .filter((otra) => otra.objetivo === actividad.objetivo)
      .map((otra) => otra.codigo ?? otra.clave)
      .join(", ");
    opcionesObjetivo.push({ clave: actividad.objetivo, etiqueta: `Objetivo ${codigos}` });
  }
  if (actividades.some((actividad) => actividad.objetivo === OBJETIVO_GESTION)) {
    opcionesObjetivo.push({ clave: OBJETIVO_GESTION, etiqueta: GRUPO_GESTION });
  }
  const periodos = periodosDe(proyecto);

  const [filas, setFilas] = useState<FilaReparto[]>(() => filasIniciales(gasto));
  const proximaClaveLinea = useRef(filas.length + 1);
  // S9/T14.2-B2: con una sola línea el formulario es el de siempre; desde dos, la factura está distribuida.
  const enDistribucion = filas.length > 1;

  /**
   * La cascada de una fila: el objetivo filtra sus actividades, la actividad deja solo sus rubros presupuestados y
   * el rubro resuelve la línea exacta. Una fila que viene de una factura repartida se resuelve por su `linea`
   * guardada, así la corrección abre con la actividad y el rubro que ya tenía.
   */
  function derivar(fila: FilaReparto) {
    const prefijada =
      enCascada && fila.linea !== null
        ? actividades.find((actividad) => actividad.rubros.some((rubro) => rubro.linea_id === fila.linea))
        : undefined;
    const objetivoBase = prefijada?.objetivo ?? fila.objetivo;
    // La opción elegida tiene que existir en la lista de hoy: una sola opción se elige sola.
    const objetivoActivo = opcionesObjetivo.some((opcion) => opcion.clave === objetivoBase)
      ? objetivoBase
      : opcionesObjetivo.length === 1
        ? opcionesObjetivo[0]!.clave
        : "";
    const actividadesVisibles = actividades.filter((actividad) => actividad.objetivo === objetivoActivo);
    const actividadBase = prefijada?.clave ?? fila.actividad;
    const actividadActiva = actividadesVisibles.some((actividad) => actividad.clave === actividadBase)
      ? actividadBase
      : actividadesVisibles.length === 1
        ? actividadesVisibles[0]!.clave
        : "";
    const rubros = actividadesVisibles.find((actividad) => actividad.clave === actividadActiva)?.rubros ?? [];
    const rubroBase =
      prefijada === undefined
        ? fila.rubro
        : (prefijada.rubros.find((rubro) => rubro.linea_id === fila.linea)?.clave ?? fila.rubro);
    // Sin cascada (un llamador anterior o una línea heredada) la fila conserva el rubro guardado tal cual.
    const rubroElegido = enCascada ? (rubros.some((rubro) => rubro.clave === rubroBase) ? rubroBase : "") : rubroBase;
    // S9: el gasto se guarda contra la línea de la actividad y el rubro elegidos, nunca contra una cualquiera.
    const lineaElegida = enCascada ? (rubros.find((rubro) => rubro.clave === rubroElegido)?.linea_id ?? null) : fila.linea;
    return { objetivoActivo, actividadesVisibles, actividadActiva, rubros, rubroElegido, lineaElegida };
  }

  const primera = derivar(filas[0]!);
  const objetivoActivo = primera.objetivoActivo;
  const actividadActiva = primera.actividadActiva;
  const rubrosDeActividad = primera.rubros;
  const rubroElegido = primera.rubroElegido;
  const lineaElegida = primera.lineaElegida;
  const rubrosOfrecidos: Opcion[] = enCascada
    ? rubrosDeActividad
    : (enCorreccion ? rubrosCorregibles : conAsignado).map((rubro) => ({
        clave: rubro.rubro_id,
        etiqueta: rubro.codigo ? `${rubro.codigo} · ${rubro.nombre}` : rubro.nombre,
      }));
  const sinRubros = !enCascada && rubrosOfrecidos.length === 0;

  function actualizarFila(clave: number, cambio: Partial<Omit<FilaReparto, "clave">>) {
    setFilas((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...cambio } : fila)));
  }

  /** S9/T14.2-B2: una línea más de la distribución, con su propia cascada y su valor. */
  function agregarFila() {
    const clave = proximaClaveLinea.current;
    proximaClaveLinea.current += 1;
    setFilas((actuales) => [...actuales, { clave, linea: null, objetivo: "", actividad: "", rubro: "", valor: "" }]);
  }

  function quitarFila(clave: number) {
    setFilas((actuales) => actuales.filter((fila) => fila.clave !== clave));
  }
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
    if (sinRubros) return setLocal(SIN_RUBROS);
    if (enDistribucion) {
      // S9/T14.2-B2: sin las líneas del presupuesto no hay forma de saber a qué línea va cada fila de una factura
      // repartida, así que se niega en vez de mandar una distribución a medias; el diálogo vuelve a ofrecerla en
      // cuanto llegan las líneas.
      if (!enCascada) return setLocal(REPARTO_LINEA);
      // Cada línea elige su actividad y su rubro con la cascada y escribe su valor; se revisan todas.
      for (const fila of filas) {
        const derivada = derivar(fila);
        if (enCascada && derivada.objetivoActivo === "") return setLocal(ELIGE_OBJETIVO);
        if (enCascada && derivada.actividadActiva === "") return setLocal(ELIGE_ACTIVIDAD);
        if (derivada.rubroElegido === "") return setLocal("Elige el rubro.");
        if (derivada.lineaElegida === null) return setLocal(REPARTO_LINEA);
        if (valorDeReparto(fila) === null) return setLocal(REPARTO_VALOR);
      }
    } else {
      if (enCascada && objetivoActivo === "") return setLocal(ELIGE_OBJETIVO);
      if (enCascada && actividadActiva === "") return setLocal(ELIGE_ACTIVIDAD);
      if (rubroElegido === "") return setLocal("Elige el rubro.");
    }
    if (fecha === "") return setLocal("La fecha del documento es obligatoria.");
    if (periodo === "") return setLocal(PERIODO_REQUERIDO);
    // Los errores de monto ya están en línea junto al campo; el aviso general solo cubre el vacío.
    if (subtotalNormal === null) return setLocal(subtotal.trim() === "" ? SUBTOTAL_INVALIDO : null);
    if (iva.trim() === "") return setLocal(IVA_VACIO);
    if (ivaNormal === null) return setLocal(null);
    // S9/T14.2-B2: la suma de las líneas tiene que ser exactamente el total (subtotal + IVA); si no, no se guarda.
    if (enDistribucion && sumarRepartos(filas) !== toCents(subtotalNormal) + toCents(ivaNormal)) {
      return setLocal(REPARTO_SUMA);
    }
    if (tercero.trim() === "") return setLocal("El nombre del tercero es obligatorio.");
    if (numeroDoc.trim() === "") return setLocal("El número de documento es obligatorio.");
    if (descripcion.trim() === "") return setLocal("La descripción es obligatoria.");

    setLocal(null);
    // S9/T14.2-B2: con una sola línea el cuerpo es el de siempre (rubro y línea exacta). Desde dos líneas la
    // factura va por su distribución y la cabecera no lleva ni rubro ni línea: mezclarlos es el 400 del servidor.
    // A split invoice corrected down to one line still travels as a distribution (of one row): the PATCH has no
    // `linea_id`, and without `repartos` the server would refuse to collapse the stored rows.
    const unaFilaRepartida = !enDistribucion && enCorreccion && enCascada && lineaElegida !== null;
    const campos = {
      ...(enDistribucion
        ? {
            repartos: filas.map((fila) => ({
              // La validación de arriba ya exigió una línea y un valor mayor que cero para cada fila.
              linea_id: derivar(fila).lineaElegida ?? "",
              valor: fromCents(valorDeReparto(fila) ?? BigInt(0)),
            })),
          }
        : unaFilaRepartida
          ? { repartos: [{ linea_id: lineaElegida, valor: fromCents(toCents(subtotalNormal) + toCents(ivaNormal)) }] }
          : {
            rubro_id: rubroElegido,
            // S9/T14.1: la línea exacta de la actividad y el rubro elegidos; sin cascada (un llamador anterior) la
            // API resuelve la del rubro, como antes.
            ...(lineaElegida === null ? {} : { linea_id: lineaElegida }),
          }),
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
          // Optimistic concurrency: the row as it was read. If somebody corrected it meanwhile, the API
          // answers 409 instead of silently overwriting their work.
          updated_at: gasto.updated_at,
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
  const totalCents =
    (subtotalCents === null ? BigInt(0) : toCents(subtotalCents)) + (ivaCents === null ? BigInt(0) : toCents(ivaCents));
  const totalTexto = formatCOP(totalCents);
  // S9/T14.2-B2: la suma de la distribución a la vista mientras se reparte; un `faltante` positivo es lo que falta.
  const sumaRepartos = sumarRepartos(filas);
  const faltanteReparto = totalCents - sumaRepartos;
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
      {sinRubros && (
        <p className="text-[12.5px] text-ink-600 sm:col-span-2">{SIN_RUBROS}</p>
      )}

      {filas.map((fila, indice) => {
        const numero = indice + 1;
        // La primera fila conserva los nombres de siempre; las siguientes los numeran para que cada control tenga
        // un id y un nombre accesible propios.
        const sufijo = numero === 1 ? "" : ` ${numero}`;
        const idCampo = (campo: string) => (numero === 1 ? `${p}-${campo}` : `${p}-${campo}-${numero}`);
        const derivada = derivar(fila);
        const camposDeFila = (
          <>
            {enCascada && (
              <>
                <Campo id={idCampo("objetivo")} label={`Objetivo${sufijo}`}>
                  <select
                    id={idCampo("objetivo")}
                    value={derivada.objetivoActivo}
                    onChange={(e) =>
                      // El objetivo solo filtra: cambiar de objetivo empieza la actividad y el rubro de nuevo.
                      actualizarFila(fila.clave, { objetivo: e.target.value, actividad: "", rubro: "", linea: null })
                    }
                    className={SELECT}
                  >
                    <option value="">Elige un objetivo</option>
                    {opcionesObjetivo.map((opcion) => (
                      <option key={opcion.clave} value={opcion.clave}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo id={idCampo("actividad")} label={`Actividad${sufijo}`}>
                  <select
                    id={idCampo("actividad")}
                    value={derivada.actividadActiva}
                    onChange={(e) =>
                      actualizarFila(fila.clave, {
                        objetivo: derivada.objetivoActivo,
                        actividad: e.target.value,
                        rubro: "",
                        linea: null,
                      })
                    }
                    className={SELECT}
                  >
                    <option value="">Elige una actividad</option>
                    {derivada.actividadesVisibles.map((actividad) => (
                      <option key={actividad.clave} value={actividad.clave}>
                        {actividad.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
              </>
            )}

            <Campo id={idCampo("rubro")} label={`Rubro${sufijo}`}>
              <select
                id={idCampo("rubro")}
                value={derivada.rubroElegido}
                onChange={(e) =>
                  actualizarFila(fila.clave, {
                    objetivo: derivada.objetivoActivo,
                    actividad: derivada.actividadActiva,
                    rubro: e.target.value,
                    linea: null,
                  })
                }
                className={SELECT}
              >
                <option value="">Elige un rubro</option>
                {(enCascada ? derivada.rubros : rubrosOfrecidos).map((rubro) => (
                  <option key={rubro.clave} value={rubro.clave}>
                    {rubro.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>

            {enDistribucion && (
              <Campo id={idCampo("valor")} label={`Valor${sufijo}`}>
                <Input
                  id={idCampo("valor")}
                  inputMode="decimal"
                  value={fila.valor}
                  aria-describedby={`${p}-suma`}
                  onChange={(e) => actualizarFila(fila.clave, { valor: formatearMontoAlEscribir(e.target.value) })}
                  className={FIELD}
                />
              </Campo>
            )}
          </>
        );
        // Con una sola línea no hay distribución: se pinta el mismo formulario de siempre, sin campo «Valor».
        if (!enDistribucion) return <Fragment key={fila.clave}>{camposDeFila}</Fragment>;
        return (
          <fieldset
            key={fila.clave}
            className="flex min-w-0 flex-col gap-2 rounded-inner border border-border bg-panel p-2 sm:col-span-2 sm:grid sm:grid-cols-4 sm:items-end"
          >
            <legend className="px-1 text-[12px] text-ink-600">{`Línea ${numero}`}</legend>
            {camposDeFila}
            {numero > 1 && (
              <div className="sm:col-span-4">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={CAPTURE_BUTTON}
                  aria-label={`Quitar línea ${numero}`}
                  disabled={pending}
                  onClick={() => quitarFila(fila.clave)}
                >
                  Quitar
                </Button>
              </div>
            )}
          </fieldset>
        );
      })}

      {enDistribucion && (
        <p id={`${p}-suma`} className="text-[12.5px] text-ink-700 sm:col-span-2">
          {`Suma de la distribución: ${formatCOP(sumaRepartos)} de ${totalTexto}`}
        </p>
      )}

      {enDistribucion && faltanteReparto > BigInt(0) && (
        <p className="text-[12.5px] text-alerta sm:col-span-2">
          {`Faltan ${formatCOP(faltanteReparto)} para el total de la factura.`}
        </p>
      )}

      {enDistribucion && faltanteReparto < BigInt(0) && (
        <p className="text-[12.5px] text-alerta sm:col-span-2">
          {`Sobran ${formatCOP(-faltanteReparto)} del total de la factura.`}
        </p>
      )}

      {enCascada && (
        <div className="sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={CAPTURE_BUTTON}
            disabled={pending}
            onClick={agregarFila}
          >
            {AGREGAR_LINEA}
          </Button>
        </div>
      )}

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
