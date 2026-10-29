// Metas e indicadores del proyecto (S3 U4) dentro de la ficha: objetivos con sus
// actividades (ubicadas por semanas), entregables e indicadores. Todos los que
// ven la ficha ven la estructura; solo quien gestiona proyectos
// (`canManageProjects`) y mientras el proyecto está en BORRADOR ve los controles
// de alta, edición y baja. Esa visibilidad es comodidad de interfaz: la
// autoridad es la API (403 a otros roles, 409 INVALID_STATE fuera de BORRADOR).
//
// Desde S14 (P4) es el contenido de la pestaña "Metas e indicadores": el Gantt
// (solo lectura) vive en su propia pestaña, así que ya no se renderiza aquí.

"use client";

import { useState } from "react";
import { FileSpreadsheet, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportDialog } from "@/components/proyectos/import-dialog";
import { EstructuraPOImportDialog } from "@/components/proyectos/estructura-po-import-dialog";
import { EstructuraObjetivos } from "@/components/proyectos/estructura-objetivos";
import { useCurrentUser } from "@/hooks/kanban";
import { useProjectObjectives, type ProjectListRow } from "@/hooks/projects";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { SectionHeader } from "@/components/proyectos/ui";

const SIN_FECHAS = "Define las fechas del proyecto para poder descargar la plantilla.";

export function ProjectEstructura({ proyecto }: { proyecto: ProjectListRow }) {
  // S5: el equipo carga la estructura; la pertenencia la resuelve el hook.
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  // El estado vacío se decide cuando ya se sabe quién es el usuario, pero las acciones dependen de `canWrite`.
  const usuario = useCurrentUser().data;
  const esBorrador = proyecto.estado === "BORRADOR";
  const canEdit = canWrite && esBorrador;

  // Misma query que la lista de objetivos (clave compartida): no añade una lectura.
  const objetivos = useProjectObjectives(proyecto.id);
  const [importAbierto, setImportAbierto] = useState(false);
  const [manual, setManual] = useState(false);
  // Sin estructura en borrador la vista abre ofreciendo el Excel; hasta conocer el rol no se decide nada.
  const vacio = esBorrador && usuario !== undefined && objetivos.data?.length === 0 && !manual;
  const sinFechas = !proyecto.fecha_inicio || !proyecto.fecha_fin;

  return (
    <section data-testid="estructura">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader icon={<ListTree className="size-3.5" strokeWidth={2} />}>Metas e indicadores</SectionHeader>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <EstructuraPOImportDialog proyectoId={proyecto.id} />
            <ImportDialog
              proyecto={proyecto}
              open={importAbierto}
              onOpenChange={setImportAbierto}
              ocultarControles={vacio}
            />
          </div>
        )}
      </div>

      {canWrite && !esBorrador && (
        <p className="mt-1.5 text-[12.5px] text-ink-500">
          La estructura solo se edita mientras el proyecto está en borrador.
        </p>
      )}

      {vacio ? (
        canEdit ? (
          <EmptyState
            bordered
            data-testid="estructura-vacia"
            className="mt-2"
            icon={<FileSpreadsheet className="size-6 text-ink-500" strokeWidth={1.6} />}
            title="Carga la estructura del proyecto"
            description="Descarga la plantilla, complétala y súbela: crea objetivos, actividades, entregables y presupuesto de una vez."
            action={
              <div className="flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" className="h-11" onClick={() => setImportAbierto(true)}>
                    Cargar desde Excel
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setManual(true)}>
                    Crear a mano
                  </Button>
                </div>
                {sinFechas && <p className="max-w-[44ch] text-[12.5px] text-ink-600">{SIN_FECHAS}</p>}
              </div>
            }
          />
        ) : (
          <EmptyState
            bordered
            data-testid="estructura-vacia"
            className="mt-2"
            title="Aún no hay estructura"
            description="Quien gestiona proyectos carga los objetivos y las actividades desde la plantilla de Excel o a mano. Aparecerán aquí cuando estén listos."
          />
        )
      ) : (
        <EstructuraObjetivos proyecto={proyecto} canEdit={canEdit} />
      )}
    </section>
  );
}
