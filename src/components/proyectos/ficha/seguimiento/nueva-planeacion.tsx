// V9 (S5) «Nueva planeación» of the seguimiento view: the monthly plan of each budget line (activity + rubro), next
// to the S-curve. PO-10 decision «Mover sin cambiar total»: a month's plan is edited by moving value to another month
// of the same line (T13 rule, `POST /programming/move`), so the table itself is read-only and no line total changes.
// The move refreshes the programming and the S-curve (`useRefreshPresupuesto`). In BORRADOR the Presupuesto tab's
// full grid is still the way to program; this view only mounts once the project has a baseline.

"use client";

import { errorMessage } from "@/components/proyectos/estructura-ui";
import { mesLegible } from "@/components/proyectos/project-display";
import { MoverValor, nombreLinea } from "@/components/proyectos/ficha/seguimiento/mover-valor";
import { InlineError } from "@/components/proyectos/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjectProgramming, type ProjectListRow, type ProjectProgramming } from "@/hooks/projects";
import { formatCOP, toCents, type Cents } from "@/lib/proyectos/money";

const PLANEACION_ERROR = "No pudimos cargar la planeación. Inténtalo de nuevo.";

/**
 * `canWrite` is the ficha's write permission (`useEjecucionPermisos`, the same axis as the move endpoint's
 * `canEditProjectData`); the endpoint also requires EN_EJECUCION, so anyone else gets the table read-only.
 */
export function NuevaPlaneacion({ proyecto, canWrite }: { proyecto: ProjectListRow; canWrite: boolean }) {
  const query = useProjectProgramming(proyecto.id);
  const puedeMover = canWrite && proyecto.estado === "EN_EJECUCION";

  return (
    <div data-testid="nueva-planeacion" className="mt-4">
      <h4 className="text-[11px] font-semibold tracking-[0.06em] text-ink-500 uppercase">Nueva planeación</h4>
      {query.isError ? (
        <InlineError message={errorMessage(query.error, PLANEACION_ERROR)} className="mt-1.5" />
      ) : !query.data?.periodos ? (
        <Skeleton className="mt-2 h-20 w-full rounded-[14px]" />
      ) : query.data.control_por_linea.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">Este proyecto no tiene líneas de presupuesto programadas.</p>
      ) : (
        <>
          <TablaPlaneacion data={query.data} />
          {puedeMover && <MoverValor proyectoId={proyecto.id} data={query.data} />}
        </>
      )}
    </div>
  );
}

function TablaPlaneacion({ data }: { data: ProjectProgramming }) {
  const valor = (lineaId: string, periodo: string): Cents =>
    toCents(data.filas.find((f) => f.linea_id === lineaId && f.periodo === periodo)?.valor ?? "0");
  const total = (lineaId: string): Cents =>
    data.periodos.reduce((suma, periodo) => suma + valor(lineaId, periodo), toCents("0"));

  return (
    <div className="mt-2 overflow-x-auto rounded-inner border border-border bg-panel">
      <Table data-testid="nueva-planeacion-tabla" className="w-full text-[12.5px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Línea</TableHead>
            {data.periodos.map((periodo) => (
              <TableHead key={periodo} scope="col" numeric>{mesLegible(periodo)}</TableHead>
            ))}
            <TableHead scope="col" numeric>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.control_por_linea.map((c) => (
            <TableRow key={c.linea_id} data-testid="nueva-planeacion-fila">
              <TableCell className="text-ink-800 whitespace-normal">
                {nombreLinea(c)} {c.nombre}
              </TableCell>
              {data.periodos.map((periodo) => (
                <TableCell key={periodo} numeric>{formatCOP(valor(c.linea_id, periodo))}</TableCell>
              ))}
              <TableCell numeric className="font-semibold">{formatCOP(total(c.linea_id))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
