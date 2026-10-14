// Step 1 "General". Without a project it renders the shared create form (both origins); once the project
// exists it shows what was created, read-only: the data is edited in the ficha, and creating a second
// project from here would be a mistake.

"use client";

import { FieldValue } from "@/components/crm/shared";
import { ProjectCreateForm, type CreatedProject } from "@/components/proyectos/project-create-form";
import {
  ESTADO_PROYECTO_META,
  ORIGEN_PROYECTO_META,
  formatFechaCalendario,
} from "@/components/proyectos/project-display";
import { EmptyBlock } from "@/components/proyectos/ui";
import { StatusChip } from "@/components/ui/status-chip";
import type { ProjectListRow } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const SIN_DATO = "—";

export function PasoGeneralForm({
  oportunidadId,
  onCreated,
}: {
  oportunidadId?: string;
  onCreated: (proyecto: CreatedProject) => void;
}) {
  return (
    <ProjectCreateForm
      variant="page"
      initialOportunidadId={oportunidadId}
      onCreated={onCreated}
      submitLabel="Crear proyecto y continuar"
    />
  );
}

export function PasoGeneralCreado({ proyecto }: { proyecto: ProjectListRow }) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];
  return (
    <div className="flex flex-col gap-4" data-testid="paso-general-creado">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">{proyecto.codigo}</span>
        <StatusChip tone={estado.tone}>{estado.label}</StatusChip>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <FieldValue label="Nombre" value={proyecto.nombre} />
        <FieldValue label="Origen" value={proyecto.origen ? ORIGEN_PROYECTO_META[proyecto.origen] : SIN_DATO} />
        <FieldValue label="Cliente" value={proyecto.cliente.nombre} />
        <FieldValue label="Responsable" value={proyecto.responsable?.nombre ?? "Sin asignar"} />
        <FieldValue label="Fecha de inicio" value={formatFechaCalendario(proyecto.fecha_inicio)} mono />
        <FieldValue label="Fecha de fin" value={formatFechaCalendario(proyecto.fecha_fin)} mono />
        <FieldValue
          label="Valor total"
          value={proyecto.valor_total === null ? SIN_DATO : formatCOP(toCents(proyecto.valor_total))}
          mono
        />
        <FieldValue
          label="Líneas estratégicas"
          value={proyecto.lineas.map((linea) => linea.nombre).join(", ") || SIN_DATO}
        />
        <FieldValue
          label="Municipios"
          value={proyecto.municipios.map((municipio) => municipio.nombre).join(", ") || SIN_DATO}
        />
      </dl>
      <EmptyBlock>
        El proyecto ya quedó creado en borrador. Para cambiar estos datos, ábrelo desde su ficha; aquí sigue con las metas.
      </EmptyBlock>
    </div>
  );
}
