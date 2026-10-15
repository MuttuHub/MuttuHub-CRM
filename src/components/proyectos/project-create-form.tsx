// Create-project form body (S2.4, unit 2), shared by the dialog (`project-create-dialog.tsx`) and the
// stepper page (`/proyectos/nuevo`). The first question is the CLIENT (M1): once chosen, a read-only card
// shows what we know about it and an optional select lists only that client's won opportunities without a
// project. The origin (REQ-ORG-01) is derived, never asked: an opportunity chosen => it is created through
// the conversion endpoint; none => it is an independent project with the chosen `cliente_id`.
//
// The body that is sent NEVER includes `codigo`, `estado`, `oportunidad_id`, `cliente_id` (on the
// opportunity path), `deleted_at`, `umbrales_override`, `programacion_pendiente`,
// `diferencia_valor_oportunidad` or `alertas`: the server answers 400 if they arrive and several of
// those columns are derived or belong to another unit. It does not include `miembro_ids` either: the
// initial team is composed after creation (team tab). The value difference against the opportunity
// (S2.4) is shown as a notice that never blocks the submit; the server computes and stores it.
//
// The form owns its state, validation and submit. What happens after a successful creation is the
// caller's decision (`onCreated`): the dialog shows its confirmation, the page moves to step 2.

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MENSAJE_RANGO_FECHAS, rangoFechasValido } from "@/lib/proyectos/rango-fechas";
import { LoaderCircle } from "lucide-react";
import { ClienteResumen } from "@/components/proyectos/nuevo-proyecto/cliente-resumen";
import { HelpHint } from "@/components/ui/help-hint";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients, useUsers } from "@/hooks/crm";
import { useCurrentUser } from "@/hooks/kanban";
import {
  useCreateProject,
  useCreateProjectFromOpportunity,
  useEligibleOpportunities,
  useMunicipalities,
  useStrategicLines,
  type EligibleOpportunity,
  type ProjectLineaInput,
} from "@/hooks/projects";
import { formatCOP, fromCents, toCents } from "@/lib/proyectos/money";
import { diferenciaValor, validarLineas } from "@/lib/proyectos/proyecto-general";
/** Filtro estable del picker de clientes: el mismo objeto en cada render. */
const CLIENT_PICKER_FILTERS = { limit: 200 } as const;
/** Valor interno de la opción «sin oportunidad» del selector (un Select no admite `null`). */
const SIN_OPORTUNIDAD = "sin-oportunidad";
/** Con más clientes que esto aparece un campo para buscar por nombre. */
const CLIENTES_PARA_BUSCAR = 8;

type OrigenForm = "OPORTUNIDAD" | "INDEPENDIENTE";

type CuerpoCreacion = {
  responsable_id: string;
  lineas: ProjectLineaInput[];
  municipio_ids: string[];
  fecha_inicio: string;
  fecha_fin: string;
  valor_total?: number;
  beneficiarios_meta?: number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Fecha de calendario local `YYYY-MM-DD` (el contrato de las columnas `@db.Date`). */
export function fechaDeHoy(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
}

/** Suma meses de calendario en UTC para no desviar el día por la zona horaria. */
export function fechaMasMeses(fecha: string, meses: number): string {
  const [year, month, day] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + meses);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Un `Decimal` serializado ("180000000.00") pasa a un campo numérico editable
 * sin arrastrar el float: se conserva en centavos y solo se quitan los ceros
 * decimales cuando el monto es entero.
 */
export function valorDesdeDecimal(value: string | null): string {
  if (value === null) return "";
  const texto = fromCents(toCents(value));
  return texto.endsWith(".00") ? texto.slice(0, -3) : texto;
}

/** `valor_total - valor_estimado_cop` mientras ambos existan y no coincidan. */
function diferenciaCreacion(
  origen: OrigenForm,
  oportunidad: EligibleOpportunity | null,
  valorTotal: string,
): string | null {
  if (origen !== "OPORTUNIDAD" || !oportunidad || valorTotal.trim() === "") return null;
  try {
    const diferencia = diferenciaValor(valorTotal.trim(), oportunidad.valor_estimado_cop);
    return diferencia === null || toCents(diferencia) === BigInt(0) ? null : diferencia;
  } catch {
    return null;
  }
}

export type CreatedProject = { id: string; codigo: string | null; nombre: string | null };

export type ProjectCreateFormProps = {
  /**
   * Opportunity to preselect once the eligible list loads (the "Convertir en
   * proyecto" entry point on the won opportunity). The rest of the form and its
   * validation are unchanged; the user can still pick another one.
   */
  initialOportunidadId?: string;
  /** Client to preselect (`?cliente=<id>`, the "Crear proyecto" button of the client sheet). */
  initialClienteId?: string;
  /** Called once with the created project (it always has an id here). */
  onCreated: (proyecto: CreatedProject) => void;
  /** The server accepted the creation but returned no project id (nothing to open). */
  onCreatedWithoutId?: () => void;
  /** When given, a "Cancelar" button is rendered next to the submit button. */
  onCancel?: () => void;
  /** Submit button label. */
  submitLabel?: string;
  /** `dialog` keeps the dialog footer chrome; `page` renders a plain action row. */
  variant?: "dialog" | "page";
};

function Etiqueta({
  htmlFor,
  ayuda,
  children,
}: {
  htmlFor: string;
  ayuda: { label: string; texto: string };
  children: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      <HelpHint label={ayuda.label}>{ayuda.texto}</HelpHint>
    </div>
  );
}

export function ProjectCreateForm({
  initialOportunidadId,
  initialClienteId,
  onCreated,
  onCreatedWithoutId,
  onCancel,
  submitLabel = "Crear proyecto",
  variant = "page",
}: ProjectCreateFormProps) {
  const userQuery = useCurrentUser();
  const usersQuery = useUsers();
  const clientsQuery = useClients(CLIENT_PICKER_FILTERS);
  const opportunitiesQuery = useEligibleOpportunities();
  const linesQuery = useStrategicLines();
  const municipalitiesQuery = useMunicipalities();

  const [oportunidad, setOportunidad] = useState<EligibleOpportunity | null>(null);
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState(initialClienteId ?? "");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [beneficiariosMeta, setBeneficiariosMeta] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => fechaDeHoy());
  const [fechaFin, setFechaFin] = useState(() => fechaMasMeses(fechaDeHoy(), 3));
  // `null` = todavía no tocado por el usuario: el valor efectivo sale del catálogo.
  const [lineaIdsEstado, setLineaIdsEstado] = useState<string[] | null>(null);
  const [principalIdsEstado, setPrincipalIdsEstado] = useState<string[] | null>(null);
  const [municipioIds, setMunicipioIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prefillAplicado, setPrefillAplicado] = useState(false);
  // El error se pinta junto al botón de envío (el diálogo hace scroll y el pie queda fuera de la vista).
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [error]);

  // El origen no se pregunta: lo decide la oportunidad elegida.
  const origen: OrigenForm = oportunidad ? "OPORTUNIDAD" : "INDEPENDIENTE";
  const createProject = useCreateProject();
  const createFromOpportunity = useCreateProjectFromOpportunity(
    oportunidad?.cliente_id ?? "",
    oportunidad?.id ?? "",
  );

  const oportunidades = opportunitiesQuery.data ?? [];
  const lineas = linesQuery.data ?? [];
  const municipios = municipalitiesQuery.data ?? [];
  const usuarios = usersQuery.data ?? [];
  const clientes = clientsQuery.data?.items ?? [];
  const oportunidadesDelCliente = oportunidades.filter((op) => op.cliente_id === clienteId);
  const termino = busquedaCliente.trim().toLowerCase();
  const clientesVisibles =
    termino === ""
      ? clientes
      : clientes.filter((c) => c.id === clienteId || c.nombre.toLowerCase().includes(termino));
  // Prefijos derivados, sin efectos: el usuario logueado y la primera línea del
  // catálogo como principal mientras el usuario no los haya tocado.
  const responsableEfectivo = responsableId !== "" ? responsableId : (userQuery.data?.id ?? "");
  const lineasPorDefecto = lineas.length > 0 ? [lineas[0].id] : [];
  const lineaIds = lineaIdsEstado ?? lineasPorDefecto;
  const principalIds = principalIdsEstado ?? lineasPorDefecto;
  // S2.4: aviso informativo, solo en el camino de oportunidad y con valor válido.
  const diferencia = diferenciaCreacion(origen, oportunidad, valorTotal);
  const pendiente =
    origen === "OPORTUNIDAD" ? createFromOpportunity.isPending : createProject.isPending;

  function elegirCliente(id: string) {
    if (id === clienteId) return;
    setClienteId(id);
    // Lo que vino de la oportunidad anterior ya no corresponde a este cliente.
    if (oportunidad) {
      setOportunidad(null);
      setNombre("");
      setValorTotal("");
    }
    setError(null);
  }

  function elegirOportunidad(op: EligibleOpportunity | null) {
    setOportunidad(op);
    if (op) {
      setClienteId(op.cliente_id);
      setNombre(op.nombre);
      setValorTotal(valorDesdeDecimal(op.valor_estimado_cop));
    }
    setError(null);
  }

  // Preselección única (derivada en render, sin efectos): se aplica en cuanto la
  // oportunidad aparece en la lista de elegibles y no se repite, para no pisar
  // lo que el usuario edite o elija después.
  if (initialOportunidadId && !prefillAplicado) {
    const inicial = oportunidades.find((op) => op.id === initialOportunidadId);
    if (inicial) {
      setPrefillAplicado(true);
      elegirOportunidad(inicial);
    }
  }

  function toggleLinea(id: string, incluida: boolean) {
    const siguientes = incluida
      ? lineaIds.includes(id)
        ? lineaIds
        : [...lineaIds, id]
      : lineaIds.filter((linea) => linea !== id);
    setLineaIdsEstado(siguientes);

    const principalesSiguientes = !incluida
      ? principalIds.filter((linea) => linea !== id)
      : principalIds.length === 0
        ? [id]
        : principalIds;
    setPrincipalIdsEstado(principalesSiguientes);
  }

  function togglePrincipal(id: string, principal: boolean) {
    const principalesSiguientes = principal
      ? principalIds.includes(id)
        ? principalIds
        : [...principalIds, id]
      : principalIds.filter((linea) => linea !== id);
    setPrincipalIdsEstado(principalesSiguientes);
    if (principal) {
      setLineaIdsEstado(lineaIds.includes(id) ? lineaIds : [...lineaIds, id]);
    }
  }

  function toggleMunicipio(id: string, incluido: boolean) {
    setMunicipioIds((prev) =>
      incluido ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((m) => m !== id),
    );
  }

  function construirCuerpo(): CuerpoCreacion {
    const cuerpo: CuerpoCreacion = {
      responsable_id: responsableEfectivo,
      lineas: lineaIds.map((id) => ({ id, principal: principalIds.includes(id) })),
      municipio_ids: municipioIds,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
    };
    const valor = valorTotal.trim();
    if (valor !== "") cuerpo.valor_total = Number(valor);
    const beneficiarios = beneficiariosMeta.trim();
    if (beneficiarios !== "") cuerpo.beneficiarios_meta = Number(beneficiarios);
    return cuerpo;
  }

  /** Validación previa al submit: nunca se dispara una petición inválida. */
  function validar(): string | null {
    if (clienteId === "") return "Selecciona el cliente.";
    const validacion = validarLineas(
      lineaIds.map((id) => ({ id, principal: principalIds.includes(id) })),
    );
    if (!validacion.ok) return validacion.message;
    if (municipioIds.length === 0) return "Selecciona al menos un municipio.";
    if (responsableEfectivo === "") return "Selecciona el responsable.";
    if (fechaInicio === "" || fechaFin === "") return "Completa las fechas de inicio y fin.";
    if (!rangoFechasValido(fechaInicio, fechaFin)) return MENSAJE_RANGO_FECHAS;
    if (!(Number(valorTotal.trim()) > 0)) return "El valor total debe ser mayor que cero.";
    if (origen === "INDEPENDIENTE" && nombre.trim() === "") return "El nombre del proyecto es obligatorio.";
    return null;
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const mensaje = validar();
    if (mensaje) {
      setError(mensaje);
      return;
    }

    const cuerpo = construirCuerpo();
    try {
      let resultado: { proyecto?: { id?: string; codigo?: string; nombre?: string } } | undefined;
      if (origen === "OPORTUNIDAD" && oportunidad) {
        const nombreLimpio = nombre.trim();
        resultado = await createFromOpportunity.mutateAsync({
          ...cuerpo,
          ...(nombreLimpio ? { nombre: nombreLimpio } : {}),
        });
      } else {
        resultado = await createProject.mutateAsync({
          ...cuerpo,
          nombre: nombre.trim(),
          cliente_id: clienteId,
        });
      }
      const proyecto = resultado?.proyecto;
      if (proyecto?.id) {
        onCreated({ id: proyecto.id, codigo: proyecto.codigo ?? null, nombre: proyecto.nombre ?? null });
      } else {
        onCreatedWithoutId?.();
      }
    } catch (err) {
      // 400/403/404/409: the form stays put and shows the server message
      // (e.g. "Esta oportunidad ya tiene un proyecto."), not a generic one.
      setError(
        err instanceof Error ? err.message : "No pudimos crear el proyecto. Inténtalo de nuevo.",
      );
    }
  }

  const acciones = (
    <>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} disabled={pendiente}>
          Cancelar
        </Button>
      )}
      <Button type="submit" disabled={pendiente}>
        {pendiente && <LoaderCircle className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Etiqueta
          htmlFor="proyecto-cliente"
          ayuda={{
            label: "Cliente",
            texto:
              "El proyecto pertenece a un cliente. Al elegirlo ves sus datos y sus oportunidades ganadas sin proyecto.",
          }}
        >
          Cliente
        </Etiqueta>
        {clientes.length > CLIENTES_PARA_BUSCAR && (
          <Input
            type="search"
            value={busquedaCliente}
            onChange={(event) => setBusquedaCliente(event.target.value)}
            aria-label="Buscar cliente"
            placeholder="Buscar cliente por nombre"
            className="px-3"
          />
        )}
        <Select value={clienteId} onValueChange={(value) => elegirCliente(value ?? "")}>
          <SelectTrigger id="proyecto-cliente" aria-label="Cliente" className="w-full px-3">
            <SelectValue placeholder="Selecciona el cliente" />
          </SelectTrigger>
          <SelectContent>
            {clientesVisibles.map((cliente) => (
              <SelectItem key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {clienteId !== "" && <ClienteResumen clienteId={clienteId} />}

      <div className="flex flex-col gap-2">
        <Etiqueta
          htmlFor="proyecto-oportunidad"
          ayuda={{
            label: "Oportunidad",
            texto:
              "Opcional. Si eliges una, el proyecto toma su nombre y su valor y queda vinculado a ella. Sin oportunidad, el proyecto es independiente.",
          }}
        >
          Oportunidad
        </Etiqueta>
        <Select
          value={oportunidad?.id ?? SIN_OPORTUNIDAD}
          disabled={clienteId === ""}
          onValueChange={(value) =>
            elegirOportunidad(
              value === SIN_OPORTUNIDAD
                ? null
                : (oportunidadesDelCliente.find((op) => op.id === value) ?? null),
            )
          }
        >
          <SelectTrigger id="proyecto-oportunidad" aria-label="Oportunidad" className="w-full px-3">
            <SelectValue placeholder="Selecciona primero el cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_OPORTUNIDAD}>Sin oportunidad (proyecto independiente)</SelectItem>
            {oportunidadesDelCliente.map((op) => (
              <SelectItem key={op.id} value={op.id}>
                {op.nombre}
                {op.valor_estimado_cop ? ` · ${formatCOP(toCents(op.valor_estimado_cop))}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clienteId !== "" && oportunidadesDelCliente.length === 0 && (
          <p className="text-[12px] text-ink-600">
            Este cliente no tiene oportunidades ganadas sin proyecto.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="proyecto-nombre">Nombre</Label>
          <Input
            id="proyecto-nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Nombre del proyecto"
            className="px-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proyecto-responsable">Responsable</Label>
          <Select value={responsableEfectivo} onValueChange={(value) => setResponsableId(value ?? "")}>
            <SelectTrigger
              id="proyecto-responsable"
              aria-label="Responsable"
              className="w-full px-3"
            >
              <SelectValue placeholder="Selecciona el responsable" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((usuario) => (
                <SelectItem key={usuario.id} value={usuario.id}>
                  {usuario.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Etiqueta
            htmlFor="proyecto-valor"
            ayuda={{
              label: "Valor total",
              texto: "Valor total del contrato o convenio; debe ser mayor que cero.",
            }}
          >
            Valor total
          </Etiqueta>
          <Input
            id="proyecto-valor"
            type="number"
            min={0}
            value={valorTotal}
            onChange={(event) => setValorTotal(event.target.value)}
            placeholder="Obligatorio, mayor que cero"
            className="px-3"
          />
          {diferencia !== null && (
            <p
              role="status"
              className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[12px] text-ink-700"
            >
              Diferencia con la oportunidad: {formatCOP(toCents(diferencia))}. Se guarda en el
              proyecto y no impide crearlo.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proyecto-fecha-inicio">Fecha de inicio</Label>
          <Input
            id="proyecto-fecha-inicio"
            type="date"
            value={fechaInicio}
            onChange={(event) => setFechaInicio(event.target.value)}
            className="px-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Etiqueta
            htmlFor="proyecto-fecha-fin"
            ayuda={{
              label: "Fechas",
              texto: "Las dos fechas son obligatorias. La fecha de inicio debe ser anterior a la de fin.",
            }}
          >
            Fecha de fin
          </Etiqueta>
          <Input
            id="proyecto-fecha-fin"
            type="date"
            value={fechaFin}
            onChange={(event) => setFechaFin(event.target.value)}
            className="px-3"
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Etiqueta
            htmlFor="proyecto-beneficiarios"
            ayuda={{
              label: "Meta de beneficiarios",
              texto: "Número de personas que el proyecto espera atender. Es opcional.",
            }}
          >
            Meta de beneficiarios
          </Etiqueta>
          <Input
            id="proyecto-beneficiarios"
            type="number"
            min={0}
            value={beneficiariosMeta}
            onChange={(event) => setBeneficiariosMeta(event.target.value)}
            placeholder="Opcional"
            className="px-3"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="flex items-center gap-1 text-sm leading-none font-medium">
          <span>
            Líneas estratégicas <span className="text-rose-500 dark:text-rose-400">*</span>
          </span>
          <HelpHint label="Línea estratégica principal">
            Marca las líneas en las que trabaja el proyecto. Exactamente una debe ser la principal.
          </HelpHint>
        </legend>
        <p className="text-[12px] text-ink-600">
          Marca al menos una y exactamente una como principal.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {lineas.map((linea) => (
            <div
              key={linea.id}
              className="flex items-center justify-between gap-3 rounded-inner border border-border bg-panel px-3 py-2"
            >
              {/* The wrapping label makes the name clickable. base-ui would otherwise point aria-labelledby at it and
                  double the accessible name, so `aria-labelledby=""` keeps the explicit aria-label as the name. */}
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <Checkbox
                  checked={lineaIds.includes(linea.id)}
                  onCheckedChange={(checked) => toggleLinea(linea.id, checked === true)}
                  aria-labelledby=""
                  aria-label={`Incluir ${linea.nombre}`}
                />
                <span className="truncate text-[13px] text-ink-800">{linea.nombre}</span>
              </label>
              <div className="flex shrink-0 items-center gap-1.5">
                <Checkbox
                  checked={principalIds.includes(linea.id)}
                  onCheckedChange={(checked) => togglePrincipal(linea.id, checked === true)}
                  aria-label={`Principal ${linea.nombre}`}
                />
                <span className="text-[12px] text-ink-600">Principal</span>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="flex items-center gap-1 text-sm leading-none font-medium">
          <span>
            Municipios <span className="text-rose-500 dark:text-rose-400">*</span>
          </span>
          <HelpHint label="Municipios">
            Marca los municipios donde se ejecuta el proyecto. Debes elegir al menos uno.
          </HelpHint>
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {municipios.map((municipio) => (
            <label key={municipio.id} className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={municipioIds.includes(municipio.id)}
                onCheckedChange={(checked) => toggleMunicipio(municipio.id, checked === true)}
                aria-labelledby=""
                aria-label={`Municipio ${municipio.nombre}`}
              />
              <span className="truncate text-[13px] text-ink-800">{municipio.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          {error}
        </div>
      )}

      {variant === "dialog" ? (
        <DialogFooter>{acciones}</DialogFooter>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{acciones}</div>
      )}
    </form>
  );
}
