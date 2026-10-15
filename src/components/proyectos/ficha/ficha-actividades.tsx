// Pestaña Actividades de la ficha (U4): UNA estructura con tres vistas (Lista, Gantt y Tablero) que
// reemplaza a Metas, Cronograma, Gantt y Seguimiento, que mostraban las mismas actividades cuatro veces.
// Solo la vista activa se monta (y consulta).
//
// - BORRADOR: la Lista es la estructura editable (objetivos, actividades, entregables, indicadores y la
//   carga por Excel); no hay Tablero porque aún no hay nada que seguir.
// - Otros estados: la Lista es el seguimiento por actividad (plan, real, semáforo y «Registrar avance»);
//   el semáforo del proyecto vive en el encabezado y su causa en Resumen, así que aquí no se repite.

"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActividadesTablero } from "@/components/proyectos/ficha/actividades-tablero";
import { EstructuraGantt } from "@/components/proyectos/estructura-gantt";
import { Disclosure, ProjectEjecucion, ProjectIndicadores } from "@/components/proyectos/project-ejecucion";
import { ProjectEstructura } from "@/components/proyectos/project-estructura";
import type { ProjectListRow } from "@/hooks/projects";

type Vista = "lista" | "gantt" | "tablero";

const VISTAS: { value: Vista; label: string }[] = [
  { value: "lista", label: "Lista" },
  { value: "gantt", label: "Gantt" },
  { value: "tablero", label: "Tablero" },
];

export function FichaActividades({ proyecto }: { proyecto: ProjectListRow }) {
  const borrador = proyecto.estado === "BORRADOR";
  const [vista, setVista] = useState<Vista>("lista");
  // Activity the Tablero asked to reveal: the Lista scrolls to it and focuses its row.
  const [enfocarId, setEnfocarId] = useState<string | null>(null);

  const disponibles = borrador ? VISTAS.filter((item) => item.value !== "tablero") : VISTAS;
  const activa = disponibles.some((item) => item.value === vista) ? vista : "lista";

  function abrirDesdeTablero(actividadId: string) {
    setEnfocarId(actividadId);
    setVista("lista");
  }

  return (
    <section data-testid="actividades" className="flex min-w-0 flex-col gap-3">
      <Tabs
        value={activa}
        onValueChange={(value) => {
          setEnfocarId(null);
          setVista(value as Vista);
        }}
        className="gap-3"
      >
        <TabsList variant="pill" aria-label="Vista de actividades" className="group-data-horizontal/tabs:h-10">
          {disponibles.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="px-3">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activa} className="mt-0 flex min-w-0 flex-col gap-4">
          {activa === "gantt" ? (
            <EstructuraGantt proyecto={proyecto} sinTitulo />
          ) : activa === "tablero" ? (
            <ActividadesTablero proyecto={proyecto} onAbrirActividad={abrirDesdeTablero} />
          ) : borrador ? (
            <ProjectEstructura proyecto={proyecto} />
          ) : (
            <>
              <ProjectEjecucion proyecto={proyecto} lista enfocarId={enfocarId} />
              <Disclosure titulo="Indicadores" testId="actividades-indicadores">
                <ProjectIndicadores proyecto={proyecto} />
              </Disclosure>
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
