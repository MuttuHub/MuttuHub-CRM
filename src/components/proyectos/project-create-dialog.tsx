// Diálogo de creación de proyectos v2 (S2.4, unidad 2). La primera pregunta es
// el origen (REQ-ORG-01): "desde una oportunidad ganada" (el camino del demo,
// por defecto) o "independiente". El segundo camino reutiliza las mismas piezas
// y solo cambia de dónde sale el `cliente_id`.
//
// El cuerpo que se envía NUNCA incluye `codigo`, `estado`, `oportunidad_id`,
// `cliente_id` (en el camino de oportunidad), `deleted_at`,
// `umbrales_override`, `programacion_pendiente`,
// `diferencia_valor_oportunidad` ni `alertas`: el servidor responde 400 si
// llegan y varias de esas columnas son derivadas o de otra unidad. Tampoco
// incluye `miembro_ids`: el equipo inicial se compone después de crear el
// proyecto (pestaña de equipo), no en este diálogo, aunque el endpoint de
// creación ya acepte el campo y valide a los COORDINADORES activos. La
// diferencia de valor contra la oportunidad (S2.4) se muestra como aviso que
// nunca bloquea el envío; el servidor la calcula y la guarda por su cuenta.

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheckBig, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

/** Filtro estable del picker de clientes: el mismo objeto en cada render. */
const CLIENT_PICKER_FILTERS = { limit: 200 } as const;

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

export type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opportunity to preselect once the eligible list loads (the "Convertir en
   * proyecto" entry point on the won opportunity). The rest of the form and its
   * validation are unchanged; the user can still pick another one.
   */
  initialOportunidadId?: string;
};

export function ProjectCreateDialog({
  open,
  onOpenChange,
  initialOportunidadId,
}: ProjectCreateDialogProps) {
  const userQuery = useCurrentUser();
  const usersQuery = useUsers();
  const clientsQuery = useClients(CLIENT_PICKER_FILTERS);
  const opportunitiesQuery = useEligibleOpportunities();
  const linesQuery = useStrategicLines();
  const municipalitiesQuery = useMunicipalities();

  const [origen, setOrigen] = useState<OrigenForm>("OPORTUNIDAD");
  const [oportunidad, setOportunidad] = useState<EligibleOpportunity | null>(null);
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
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
  // Proyecto recién creado: el diálogo pasa a una confirmación con el enlace a su ficha.
  const [creado, setCreado] = useState<{ id: string; codigo: string | null; nombre: string | null } | null>(null);
  // El error se pinta junto al botón de envío (el diálogo hace scroll y el pie queda fuera de la vista).
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [error]);

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

  function elegirOrigen(next: OrigenForm) {
    if (next === origen) return;
    setOrigen(next);
    setOportunidad(null);
    setNombre("");
    setClienteId("");
    setValorTotal("");
    setError(null);
  }

  function elegirOportunidad(op: EligibleOpportunity) {
    setOportunidad(op);
    setNombre(op.nombre);
    setValorTotal(valorDesdeDecimal(op.valor_estimado_cop));
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
    const validacion = validarLineas(
      lineaIds.map((id) => ({ id, principal: principalIds.includes(id) })),
    );
    if (!validacion.ok) return validacion.message;
    if (municipioIds.length === 0) return "Selecciona al menos un municipio.";
    if (responsableEfectivo === "") return "Selecciona el responsable.";
    if (fechaInicio === "" || fechaFin === "") return "Completa las fechas de inicio y fin.";
    if (fechaFin < fechaInicio) return "La fecha de fin no puede ser anterior a la de inicio.";
    if (origen === "OPORTUNIDAD") {
      if (!oportunidad) return "Selecciona la oportunidad ganada.";
    } else {
      if (clienteId === "") return "Selecciona el cliente.";
      if (nombre.trim() === "") return "El nombre del proyecto es obligatorio.";
    }
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
        setCreado({ id: proyecto.id, codigo: proyecto.codigo ?? null, nombre: proyecto.nombre ?? null });
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      // 400/403/404/409: el diálogo sigue abierto y muestra el mensaje del
      // servidor (p. ej. "Esta oportunidad ya tiene un proyecto."), no uno genérico.
      setError(
        err instanceof Error ? err.message : "No pudimos crear el proyecto. Inténtalo de nuevo.",
      );
    }
  }

  function cambiarApertura(siguiente: boolean) {
    if (!siguiente) setCreado(null);
    onOpenChange(siguiente);
  }

  if (creado) {
    return (
      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="sm:max-w-[min(480px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Proyecto creado
            </DialogTitle>
            <DialogDescription>Quedó en borrador. Ábrelo para completar su ficha.</DialogDescription>
          </DialogHeader>
          <div
            role="status"
            className="flex items-start gap-2 rounded-12 border border-ink-200 bg-ink-050 px-4 py-3 text-[13px] text-ink-800"
          >
            <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <p>
              Proyecto creado
              {creado.codigo && <span className="font-mono font-semibold"> {creado.codigo}</span>}
              {creado.nombre && <span> · {creado.nombre}</span>}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiarApertura(false)}>
              Listo
            </Button>
            <Link
              href={`/proyectos/${creado.id}`}
              onClick={() => cambiarApertura(false)}
              className={buttonVariants({ variant: "default" })}
            >
              Abrir proyecto
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(720px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Nuevo proyecto
          </DialogTitle>
          <DialogDescription>
            Desde una oportunidad ganada o como proyecto independiente. Queda en borrador.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm leading-none font-medium">Origen</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "OPORTUNIDAD", label: "Desde una oportunidad ganada" },
                  { value: "INDEPENDIENTE", label: "Proyecto independiente" },
                ] as const
              ).map((opcion) => (
                <button
                  key={opcion.value}
                  type="button"
                  aria-pressed={origen === opcion.value}
                  onClick={() => elegirOrigen(opcion.value)}
                  className={cn(
                    "rounded-12 border px-3 py-2 text-[13px] font-medium transition-colors",
                    origen === opcion.value
                      ? "border-rose-500 bg-rose-50 text-accent-soft dark:bg-rose-500/10"
                      : "border-ink-200 bg-panel text-ink-700 hover:bg-ink-050",
                  )}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </fieldset>

          {origen === "OPORTUNIDAD" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm leading-none font-medium">Oportunidad ganada</span>
              {oportunidades.length === 0 ? (
                <p className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[13px] text-ink-600">
                  No hay oportunidades ganadas sin proyecto.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {oportunidades.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      aria-pressed={oportunidad?.id === op.id}
                      onClick={() => elegirOportunidad(op)}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-12 border px-3 py-2 text-left transition-colors",
                        oportunidad?.id === op.id
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-500/10"
                          : "border-ink-200 bg-panel hover:bg-ink-050",
                      )}
                    >
                      <span className="font-semibold text-ink-950">{op.nombre}</span>
                      <span className="text-[12px] text-ink-600">{op.cliente_nombre}</span>
                      <span className="text-[12px] text-ink-700">
                        {op.valor_estimado_cop
                          ? formatCOP(toCents(op.valor_estimado_cop))
                          : "Sin valor estimado"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {oportunidad && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm leading-none font-medium">Cliente</span>
                  <p className="rounded-12 border border-ink-200 bg-ink-050 px-3 py-2 text-[13px] text-ink-700">
                    {oportunidad.cliente_nombre}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-cliente">Cliente</Label>
              <Select value={clienteId} onValueChange={(value) => setClienteId(value ?? "")}>
                <SelectTrigger
                  id="proyecto-cliente"
                  aria-label="Cliente"
                  className="w-full px-3"
                >
                  <SelectValue placeholder="Selecciona el cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
              <Label htmlFor="proyecto-valor">Valor total</Label>
              <Input
                id="proyecto-valor"
                type="number"
                min={0}
                value={valorTotal}
                onChange={(event) => setValorTotal(event.target.value)}
                placeholder="Opcional"
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
              <Label htmlFor="proyecto-fecha-fin">Fecha de fin</Label>
              <Input
                id="proyecto-fecha-fin"
                type="date"
                value={fechaFin}
                onChange={(event) => setFechaFin(event.target.value)}
                className="px-3"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="proyecto-beneficiarios">Meta de beneficiarios</Label>
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
            <legend className="text-sm leading-none font-medium">
              Líneas estratégicas <span className="text-rose-500 dark:text-rose-400">*</span>
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
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      checked={lineaIds.includes(linea.id)}
                      onCheckedChange={(checked) => toggleLinea(linea.id, checked === true)}
                      aria-label={`Incluir ${linea.nombre}`}
                    />
                    <span className="truncate text-[13px] text-ink-800">{linea.nombre}</span>
                  </div>
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
            <legend className="text-sm leading-none font-medium">
              Municipios <span className="text-rose-500 dark:text-rose-400">*</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {municipios.map((municipio) => (
                <div key={municipio.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={municipioIds.includes(municipio.id)}
                    onCheckedChange={(checked) => toggleMunicipio(municipio.id, checked === true)}
                    aria-label={`Municipio ${municipio.nombre}`}
                  />
                  <span className="truncate text-[13px] text-ink-800">{municipio.nombre}</span>
                </div>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => cambiarApertura(false)}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente && <LoaderCircle className="size-4 animate-spin" />}
              Crear proyecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
