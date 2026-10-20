// "Editar datos generales" (UX-3): diálogo de la ficha Resumen. En BORRADOR edita todos los datos generales; en
// EN_EJECUCION solo la descripción y los beneficiarios, porque fechas y valor cambian la línea base y se piden
// como modificación (el diálogo las muestra de solo lectura y lleva al Historial). Las reglas son las de la
// creación (`validarDatosGenerales`) y el cuerpo solo lleva lo que cambió. La API sigue siendo la autoridad.

"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { valorDesdeDecimal } from "@/components/proyectos/project-create-form";
import { CampoLineas, CampoMunicipios } from "@/components/proyectos/nuevo-proyecto/campos-proyecto";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { CAPTURE_TEXTAREA } from "@/components/proyectos/ui";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsers } from "@/hooks/crm";
import {
  useMunicipalities,
  useStrategicLines,
  useUpdateProject,
  type ProjectListRow,
} from "@/hooks/projects";
import {
  DESCRIPCION_MAX,
  cuerpoDeCambios,
  validarDatosGenerales,
  type CampoDatosGenerales,
  type DatosGenerales,
  type ErrorDatosGenerales,
  type ModoEdicion,
} from "@/lib/proyectos/editar-datos-generales";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { alternarLinea, alternarPrincipal } from "@/lib/proyectos/proyecto-general";

/** Estados cuyos datos generales se pueden editar desde la ficha. */
export function modoDeEdicion(estado: ProjectListRow["estado"]): ModoEdicion | null {
  return estado === "BORRADOR" || estado === "EN_EJECUCION" ? estado : null;
}

function datosDelProyecto(proyecto: ProjectListRow): DatosGenerales {
  return {
    nombre: proyecto.nombre,
    descripcion: proyecto.descripcion ?? "",
    responsableId: proyecto.responsable?.id ?? "",
    valorTotal: valorDesdeDecimal(proyecto.valor_total),
    fechaInicio: proyecto.fecha_inicio ?? "",
    fechaFin: proyecto.fecha_fin ?? "",
    beneficiarios: proyecto.beneficiarios_meta === null ? "" : String(proyecto.beneficiarios_meta),
    lineas: proyecto.lineas.map((linea) => ({ id: linea.id, principal: linea.principal })),
    municipioIds: proyecto.municipios.map((municipio) => municipio.id),
  };
}

/** El catálogo trae solo lo activo: lo que el proyecto ya tiene sigue visible aunque se haya suspendido. */
function conLoDelProyecto<T extends { id: string; nombre: string }>(
  catalogo: readonly T[],
  delProyecto: readonly { id: string; nombre: string }[],
): T[] {
  // Conserva el objeto del catálogo (el municipio trae `departamento` para el selector en dos pasos).
  // Una fila del proyecto que ya no esté en el catálogo se agrega con lo mínimo disponible.
  const extra = delProyecto
    .filter((item) => !catalogo.some((opcion) => opcion.id === item.id))
    .map((item) => ({ id: item.id, nombre: item.nombre }) as T);
  return [...catalogo, ...extra];
}

export function EditarDatosGenerales({
  proyecto,
  open,
  onOpenChange,
  onSolicitarModificacion,
}: {
  proyecto: ProjectListRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cierra el diálogo y lleva la ficha a Historial → Modificaciones. */
  onSolicitarModificacion: () => void;
}) {
  const modo = modoDeEdicion(proyecto.estado);
  if (modo === null) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(640px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Editar datos generales
          </DialogTitle>
          <DialogDescription>
            {modo === "BORRADOR"
              ? "Cambia lo que necesites y guarda. Todo queda en el historial."
              : "En ejecución puedes cambiar la descripción y los beneficiarios."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EditarForm
            proyecto={proyecto}
            modo={modo}
            onCerrar={() => onOpenChange(false)}
            onSolicitarModificacion={onSolicitarModificacion}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditarForm({
  proyecto,
  modo,
  onCerrar,
  onSolicitarModificacion,
}: {
  proyecto: ProjectListRow;
  modo: ModoEdicion;
  onCerrar: () => void;
  onSolicitarModificacion: () => void;
}) {
  const [inicial] = useState(() => datosDelProyecto(proyecto));
  const [datos, setDatos] = useState<DatosGenerales>(inicial);
  const [errorCampo, setErrorCampo] = useState<ErrorDatosGenerales | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const update = useUpdateProject(proyecto.id);
  const borrador = modo === "BORRADOR";

  function cambiar(cambio: Partial<DatosGenerales>) {
    setDatos((previo) => ({ ...previo, ...cambio }));
    setErrorCampo(null);
    setErrorServidor(null);
  }

  // Al fallar una regla el foco va al campo, para que el lector de pantalla lo anuncie con su mensaje.
  useEffect(() => {
    if (!errorCampo) return;
    const destino = formRef.current?.querySelector<HTMLElement>(`[data-campo="${errorCampo.campo}"]`);
    destino?.focus();
  }, [errorCampo]);

  function toggleLinea(id: string, incluida: boolean) {
    const siguiente = alternarLinea(
      { lineaIds: datos.lineas.map((l) => l.id), principalIds: datos.lineas.filter((l) => l.principal).map((l) => l.id) },
      id,
      incluida,
    );
    cambiar({ lineas: siguiente.lineaIds.map((lineaId) => ({ id: lineaId, principal: siguiente.principalIds.includes(lineaId) })) });
  }

  function togglePrincipal(id: string, principal: boolean) {
    const siguiente = alternarPrincipal(
      { lineaIds: datos.lineas.map((l) => l.id), principalIds: datos.lineas.filter((l) => l.principal).map((l) => l.id) },
      id,
      principal,
    );
    cambiar({ lineas: siguiente.lineaIds.map((lineaId) => ({ id: lineaId, principal: siguiente.principalIds.includes(lineaId) })) });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorServidor(null);
    const falla = validarDatosGenerales(datos, modo);
    if (falla) {
      setErrorCampo(falla);
      return;
    }
    const cuerpo = cuerpoDeCambios(inicial, datos, modo);
    if (Object.keys(cuerpo).length === 0) {
      onCerrar();
      return;
    }
    try {
      await update.mutateAsync(cuerpo);
      onCerrar();
    } catch (err) {
      setErrorServidor(
        err instanceof Error && err.message ? err.message : "No pudimos guardar los cambios. Inténtalo de nuevo.",
      );
    }
  }

  const invalido = (campo: CampoDatosGenerales) => errorCampo?.campo === campo;
  const describe = (campo: CampoDatosGenerales) => (invalido(campo) ? `editar-error-${campo}` : undefined);
  const mensaje = (campo: CampoDatosGenerales) =>
    invalido(campo) ? (
      <p id={`editar-error-${campo}`} role="alert" className="text-[12px] font-medium text-destructivo">
        {errorCampo?.mensaje}
      </p>
    ) : null;

  const camposTexto = (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="editar-descripcion">Descripción (opcional)</Label>
        <textarea
          id="editar-descripcion"
          data-campo="descripcion"
          value={datos.descripcion}
          onChange={(event) => cambiar({ descripcion: event.target.value })}
          maxLength={DESCRIPCION_MAX}
          placeholder="Describe el alcance del proyecto"
          aria-invalid={invalido("descripcion") || undefined}
          aria-describedby={describe("descripcion")}
          className={CAPTURE_TEXTAREA}
        />
        <p className="text-[12px] text-ink-500" aria-live="polite">
          {datos.descripcion.length}/{DESCRIPCION_MAX}
        </p>
        {mensaje("descripcion")}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="editar-beneficiarios">Beneficiarios{borrador ? " (opcional)" : ""}</Label>
        <Input
          id="editar-beneficiarios"
          data-campo="beneficiarios"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={datos.beneficiarios}
          onChange={(event) => cambiar({ beneficiarios: event.target.value })}
          aria-invalid={invalido("beneficiarios") || undefined}
          aria-describedby={describe("beneficiarios")}
          className="px-3"
        />
        {!borrador && (
          <p className="text-[12px] text-ink-600">La versión aprobada conserva el número original.</p>
        )}
        {mensaje("beneficiarios")}
      </div>
    </>
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {borrador ? (
        <CamposBorrador
          proyecto={proyecto}
          datos={datos}
          cambiar={cambiar}
          toggleLinea={toggleLinea}
          togglePrincipal={togglePrincipal}
          invalido={invalido}
          describe={describe}
          mensaje={mensaje}
        >
          {camposTexto}
        </CamposBorrador>
      ) : (
        <>
          <SoloLectura proyecto={proyecto} onSolicitarModificacion={onSolicitarModificacion} />
          {camposTexto}
        </>
      )}

      {errorServidor && (
        <div
          role="alert"
          className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          {errorServidor}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Guardar cambios
        </Button>
      </DialogFooter>
    </form>
  );
}

function SoloLectura({
  proyecto,
  onSolicitarModificacion,
}: {
  proyecto: ProjectListRow;
  onSolicitarModificacion: () => void;
}) {
  return (
    <div
      data-testid="editar-solo-lectura"
      className="flex flex-col gap-2 rounded-12 border border-ink-200 bg-ink-050 px-4 py-3"
    >
      <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold text-ink-600">Fechas</dt>
          <dd className="font-mono text-ink-900 tabular-nums">
            {formatFechaCalendario(proyecto.fecha_inicio)} – {formatFechaCalendario(proyecto.fecha_fin)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold text-ink-600">Valor total</dt>
          <dd className="font-mono text-ink-900 tabular-nums">
            {proyecto.valor_total === null ? "—" : formatCOP(toCents(proyecto.valor_total))}
          </dd>
        </div>
      </dl>
      <p className="text-[13px] text-ink-700">Cambian la línea base: solicítalo como modificación.</p>
      <Button type="button" variant="link" size="sm" className="h-auto w-fit px-0" onClick={onSolicitarModificacion}>
        Solicitar modificación
      </Button>
    </div>
  );
}

function CamposBorrador({
  proyecto,
  datos,
  cambiar,
  toggleLinea,
  togglePrincipal,
  invalido,
  describe,
  mensaje,
  children,
}: {
  proyecto: ProjectListRow;
  datos: DatosGenerales;
  cambiar: (cambio: Partial<DatosGenerales>) => void;
  toggleLinea: (id: string, incluida: boolean) => void;
  togglePrincipal: (id: string, principal: boolean) => void;
  invalido: (campo: CampoDatosGenerales) => boolean;
  describe: (campo: CampoDatosGenerales) => string | undefined;
  mensaje: (campo: CampoDatosGenerales) => ReactNode;
  children: ReactNode;
}) {
  const usuarios = useUsers().data ?? [];
  const lineas = conLoDelProyecto(useStrategicLines().data ?? [], proyecto.lineas);
  const municipios = conLoDelProyecto(useMunicipalities().data ?? [], proyecto.municipios);
  const responsables = conLoDelProyecto(
    usuarios,
    proyecto.responsable ? [{ id: proyecto.responsable.id, nombre: proyecto.responsable.nombre }] : [],
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="editar-nombre">Nombre</Label>
          <Input
            id="editar-nombre"
            data-campo="nombre"
            value={datos.nombre}
            onChange={(event) => cambiar({ nombre: event.target.value })}
            aria-invalid={invalido("nombre") || undefined}
            aria-describedby={describe("nombre")}
            className="px-3"
          />
          {mensaje("nombre")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="editar-responsable">Responsable</Label>
          <Select value={datos.responsableId} onValueChange={(value) => cambiar({ responsableId: value ?? "" })}>
            <SelectTrigger id="editar-responsable" aria-label="Responsable" className="w-full px-3">
              <SelectValue placeholder="Selecciona el responsable" />
            </SelectTrigger>
            <SelectContent>
              {responsables.map((usuario) => (
                <SelectItem key={usuario.id} value={usuario.id}>
                  {usuario.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="editar-valor">Valor total</Label>
          <Input
            id="editar-valor"
            data-campo="valorTotal"
            type="number"
            inputMode="decimal"
            min={0}
            value={datos.valorTotal}
            onChange={(event) => cambiar({ valorTotal: event.target.value })}
            aria-invalid={invalido("valorTotal") || undefined}
            aria-describedby={describe("valorTotal")}
            className="px-3"
          />
          {mensaje("valorTotal")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="editar-fecha-inicio">Fecha de inicio</Label>
          <Input
            id="editar-fecha-inicio"
            data-campo="fechaInicio"
            type="date"
            value={datos.fechaInicio}
            onChange={(event) => cambiar({ fechaInicio: event.target.value })}
            aria-invalid={invalido("fechaInicio") || undefined}
            aria-describedby={describe("fechaInicio")}
            className="px-3"
          />
          {mensaje("fechaInicio")}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="editar-fecha-fin">Fecha de fin</Label>
          <Input
            id="editar-fecha-fin"
            data-campo="fechaFin"
            type="date"
            value={datos.fechaFin}
            onChange={(event) => cambiar({ fechaFin: event.target.value })}
            aria-invalid={invalido("fechaFin") || undefined}
            aria-describedby={describe("fechaFin")}
            className="px-3"
          />
          {mensaje("fechaFin")}
        </div>
      </div>

      {children}

      <div className="flex flex-col gap-2">
        <CampoLineas
          lineas={lineas}
          lineaIds={datos.lineas.map((l) => l.id)}
          principalIds={datos.lineas.filter((l) => l.principal).map((l) => l.id)}
          onToggleLinea={toggleLinea}
          onTogglePrincipal={togglePrincipal}
          invalid={invalido("lineas")}
          describedBy={describe("lineas")}
        />
        {mensaje("lineas")}
      </div>

      <div className="flex flex-col gap-2">
        <CampoMunicipios
          municipios={municipios}
          municipioIds={datos.municipioIds}
          onToggle={(id, incluido) =>
            cambiar({
              municipioIds: incluido
                ? datos.municipioIds.includes(id)
                  ? datos.municipioIds
                  : [...datos.municipioIds, id]
                : datos.municipioIds.filter((m) => m !== id),
            })
          }
          invalid={invalido("municipios")}
          describedBy={describe("municipios")}
        />
        {mensaje("municipios")}
      </div>
    </>
  );
}
