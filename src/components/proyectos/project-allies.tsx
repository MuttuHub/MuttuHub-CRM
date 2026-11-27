// «Aliados» of a posición propia project (S9) inside the ficha. Everyone who sees the ficha sees the list; the
// controls to add, edit and remove follow the same gate as the allies API (`canEditProjectData`, S14), read
// through `useEjecucionPermisos(...).canWrite`, and disappear on a frozen project. The API stays the authority:
// its 400/404/409 messages are shown inline, as in the team tile.

"use client";

import { useState } from "react";
import { Handshake, LoaderCircle, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/crm/entity-dialogs";
import { ClienteCombobox } from "@/components/proyectos/cliente-combobox";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { SectionHeader } from "@/components/proyectos/ui";
import { useClients } from "@/hooks/crm";
import {
  useAddProjectAlly,
  useProjectAllies,
  useRemoveProjectAlly,
  useUpdateProjectAlly,
  type AllyEstado,
  type AllyRol,
  type ProjectAlly,
  type ProjectAllyPatch,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";

import { ESTADO_ALIADO_LABEL, ROL_ALIADO_LABEL } from "@/lib/proyectos/aliados-labels";

const ROLES = Object.keys(ROL_ALIADO_LABEL) as AllyRol[];
const ESTADOS = Object.keys(ESTADO_ALIADO_LABEL) as AllyEstado[];

/** Same upper bound as the API (`aporte_cop` is a Decimal(15,2)). */
const APORTE_MAX = 9_999_999_999_999.99;
const APORTE_INVALIDO = "Escribe el aporte en pesos, sin signos (por ejemplo 2500000).";
const CLIENT_FILTERS = { limit: 200 };
const LOAD_ERROR = "No pudimos cargar los aliados del proyecto. Inténtalo de nuevo.";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Reads the aporte typed by the user: empty is «sin aporte» (`null`); dots group thousands and a comma marks
 * the cents, as amounts are written in Colombia. Anything else, negative or above the API bound is `undefined`.
 */
function parseAporte(texto: string): number | null | undefined {
  const limpio = texto.trim().replace(/^\$\s*/, "").replace(/\s/g, "");
  if (limpio === "") return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return undefined;
  const valor = Number(limpio.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) && valor <= APORTE_MAX ? valor : undefined;
}

function formatAporte(aporte: number | null): string {
  return aporte === null ? "Sin aporte" : formatCOP(toCents(aporte));
}

/** `congelado`: the project is suspended, closed or cancelled (B7) and its allies cannot change. */
export function ProjectAllies({ proyectoId, congelado = false }: { proyectoId: string; congelado?: boolean }) {
  const allies = useProjectAllies(proyectoId);
  const permisos = useEjecucionPermisos(proyectoId);
  const puedeGestionar = !congelado && permisos.resuelto && permisos.canWrite;
  const remove = useRemoveProjectAlly(proyectoId);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [porQuitar, setPorQuitar] = useState<ProjectAlly | null>(null);

  return (
    <section data-testid="aliados">
      <SectionHeader icon={<Handshake className="size-3.5" strokeWidth={2} />}>
        {allies.data ? `Aliados · ${allies.data.length}` : "Aliados"}
      </SectionHeader>

      {allies.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructivo">
          {errorMessage(allies.error, LOAD_ERROR)}
        </p>
      ) : allies.isLoading || !allies.data ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
          ))}
        </div>
      ) : (
        <>
          {allies.data.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-ink-500">Este proyecto todavía no tiene aliados.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {allies.data.map((aliado) =>
                puedeGestionar && editandoId === aliado.id ? (
                  <EditAlly
                    key={aliado.id}
                    proyectoId={proyectoId}
                    aliado={aliado}
                    onDone={() => setEditandoId(null)}
                  />
                ) : (
                  <AllyRow
                    key={aliado.id}
                    aliado={aliado}
                    puedeGestionar={puedeGestionar}
                    quitando={remove.isPending && remove.variables === aliado.id}
                    onEdit={() => setEditandoId(aliado.id)}
                    onRemove={() => setPorQuitar(aliado)}
                  />
                ),
              )}
            </ul>
          )}

          {remove.isError && (
            <p role="alert" className="mt-2 text-[13px] text-destructivo">
              {errorMessage(remove.error, "No pudimos quitar al aliado. Inténtalo de nuevo.")}
            </p>
          )}

          {puedeGestionar && <AddAlly proyectoId={proyectoId} aliados={allies.data} />}
        </>
      )}

      <ConfirmDialog
        open={porQuitar !== null}
        onOpenChange={(open) => {
          if (!open) setPorQuitar(null);
        }}
        title={porQuitar ? `¿Quitar a ${porQuitar.cliente.nombre} como aliado?` : "¿Quitar al aliado?"}
        description="El cliente deja de figurar como aliado de este proyecto. Puedes volver a agregarlo después."
        confirmLabel="Quitar"
        pending={remove.isPending}
        onConfirm={() => {
          if (porQuitar) remove.mutate(porQuitar.id);
        }}
      />
    </section>
  );
}

function AllyRow({
  aliado,
  puedeGestionar,
  quitando,
  onEdit,
  onRemove,
}: {
  aliado: ProjectAlly;
  puedeGestionar: boolean;
  quitando: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const nombre = aliado.cliente.nombre;
  return (
    <li
      data-testid="aliado"
      className="flex items-center justify-between gap-3 rounded-inner border border-border bg-panel px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-ink-900">{nombre}</p>
        <p className="text-[11.5px] text-ink-500">
          {ROL_ALIADO_LABEL[aliado.rol]} · {ESTADO_ALIADO_LABEL[aliado.estado]}
        </p>
        <p className="text-[11.5px] text-ink-700 tabular-nums">{formatAporte(aliado.aporte_cop)}</p>
      </div>
      {puedeGestionar && (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar a ${nombre}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar a ${nombre}`}
            disabled={quitando}
            onClick={onRemove}
          >
            {quitando ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Rol and estado selectors shared by the add and edit forms. */
function RolEstadoFields({
  etiqueta,
  rol,
  estado,
  onRol,
  onEstado,
}: {
  etiqueta: string;
  rol: AllyRol;
  estado: AllyEstado;
  onRol: (rol: AllyRol) => void;
  onEstado: (estado: AllyEstado) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={rol} onValueChange={(value) => value && onRol(value as AllyRol)}>
        <SelectTrigger aria-label={`Rol ${etiqueta}`} className="min-w-36 flex-1 px-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROL_ALIADO_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={estado} onValueChange={(value) => value && onEstado(value as AllyEstado)}>
        <SelectTrigger aria-label={`Estado ${etiqueta}`} className="min-w-36 flex-1 px-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ESTADOS.map((e) => (
            <SelectItem key={e} value={e}>
              {ESTADO_ALIADO_LABEL[e]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EditAlly({ proyectoId, aliado, onDone }: { proyectoId: string; aliado: ProjectAlly; onDone: () => void }) {
  const nombre = aliado.cliente.nombre;
  const [rol, setRol] = useState<AllyRol>(aliado.rol);
  const [estado, setEstado] = useState<AllyEstado>(aliado.estado);
  const [aporteTexto, setAporteTexto] = useState(aliado.aporte_cop === null ? "" : String(aliado.aporte_cop));
  const [aporteError, setAporteError] = useState(false);
  const update = useUpdateProjectAlly(proyectoId);

  function submit() {
    const aporte = parseAporte(aporteTexto);
    if (aporte === undefined) {
      setAporteError(true);
      return;
    }
    setAporteError(false);
    // PATCH is strict: send only what changed.
    const patch: ProjectAllyPatch = {};
    if (rol !== aliado.rol) patch.rol = rol;
    if (estado !== aliado.estado) patch.estado = estado;
    if (aporte !== aliado.aporte_cop) patch.aporte_cop = aporte;
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    update.mutate({ allyId: aliado.id, patch }, { onSuccess: onDone });
  }

  return (
    <li
      data-testid="aliado-edicion"
      className="flex flex-col gap-2 rounded-inner border border-border bg-panel px-3 py-2"
    >
      <p className="truncate text-[13px] font-semibold text-ink-900">{nombre}</p>
      <RolEstadoFields etiqueta={`de ${nombre}`} rol={rol} estado={estado} onRol={setRol} onEstado={setEstado} />
      <Input
        aria-label={`Aporte de ${nombre} (COP)`}
        inputMode="decimal"
        placeholder="Aporte comprometido (opcional)"
        value={aporteTexto}
        aria-invalid={aporteError || undefined}
        onChange={(e) => setAporteTexto(e.target.value)}
      />
      {aporteError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {APORTE_INVALIDO}
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {errorMessage(update.error, "No pudimos guardar el aliado. Inténtalo de nuevo.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" disabled={update.isPending} onClick={submit}>
          {update.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </li>
  );
}

function AddAlly({ proyectoId, aliados }: { proyectoId: string; aliados: ProjectAlly[] }) {
  const [clienteId, setClienteId] = useState("");
  const [rol, setRol] = useState<AllyRol>("ALIADO");
  const [estado, setEstado] = useState<AllyEstado>("EN_GESTION");
  const [aporteTexto, setAporteTexto] = useState("");
  const [aporteError, setAporteError] = useState(false);
  const clients = useClients(CLIENT_FILTERS);
  const add = useAddProjectAlly(proyectoId);

  const aliadosIds = new Set(aliados.map((a) => a.cliente.id));
  const candidatos = (clients.data?.items ?? [])
    .filter((c) => !aliadosIds.has(c.id))
    .map((c) => ({ id: c.id, nombre: c.nombre }));

  function submit() {
    if (clienteId === "") return;
    const aporte = parseAporte(aporteTexto);
    if (aporte === undefined) {
      setAporteError(true);
      return;
    }
    setAporteError(false);
    add.mutate(
      { cliente_id: clienteId, rol, estado, aporte_cop: aporte },
      {
        onSuccess: () => {
          setClienteId("");
          setRol("ALIADO");
          setEstado("EN_GESTION");
          setAporteTexto("");
        },
      },
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <ClienteCombobox
        id="aliado-nuevo-cliente"
        clientes={candidatos}
        value={clienteId}
        onChange={setClienteId}
        ariaLabel="Cliente aliado"
      />
      <RolEstadoFields etiqueta="del nuevo aliado" rol={rol} estado={estado} onRol={setRol} onEstado={setEstado} />
      <Input
        aria-label="Aporte del nuevo aliado (COP)"
        inputMode="decimal"
        placeholder="Aporte comprometido (opcional)"
        value={aporteTexto}
        aria-invalid={aporteError || undefined}
        onChange={(e) => setAporteTexto(e.target.value)}
      />
      <Button type="button" className="self-end" disabled={clienteId === "" || add.isPending} onClick={submit}>
        {add.isPending && <LoaderCircle className="size-4 animate-spin" />}
        Agregar aliado
      </Button>

      {aporteError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {APORTE_INVALIDO}
        </p>
      )}
      {clients.isError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {errorMessage(clients.error, "No pudimos cargar los clientes. Inténtalo de nuevo.")}
        </p>
      )}
      {add.isError && (
        <p role="alert" className="text-[13px] text-destructivo">
          {errorMessage(add.error, "No pudimos agregar al aliado. Inténtalo de nuevo.")}
        </p>
      )}
    </div>
  );
}
