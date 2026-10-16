// Sección "Versiones" de la ficha (S8 U6, E-27). Solo lectura: el historial de versiones (la línea
// base es la v0; cada modificación aprobada suma una) y la comparación entre dos de ellas o contra
// la vigente. Las diferencias las calcula el servidor: aquí solo se agrupan y se formatean.

"use client";

import { useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaHora } from "@/components/proyectos/project-display";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SELECT_CLASS, SectionHeader } from "@/components/proyectos/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectVersionCompare,
  useProjectVersions,
  type ProjectDiferencia,
  type ProjectListRow,
  type ProjectVersion,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const VERSIONES_ERROR = "No pudimos cargar las versiones. Inténtalo de nuevo.";
const COMPARACION_ERROR = "No pudimos comparar las versiones. Inténtalo de nuevo.";
export const SIN_LINEA_BASE_NOTE = "La línea base aún no está aprobada.";


const ELEMENTO_LABEL: Record<ProjectDiferencia["elemento"], string> = {
  proyecto: "Proyecto",
  presupuesto: "Presupuesto",
  programacion: "Programación",
  actividad: "Actividades",
  entregable: "Entregables",
  indicador: "Indicadores",
};

export const CAMPO_LABEL: Record<string, string> = {
  valor_total: "Valor total",
  fecha_inicio: "Fecha de inicio",
  fecha_fin: "Fecha de fin",
  beneficiarios_meta: "Beneficiarios",
  rubro_nombre: "Nombre del rubro",
  asignado: "Asignado",
  valor: "Programado",
  objetivo_codigo: "Objetivo",
  actividad_codigo: "Actividad",
  nombre: "Nombre",
  descripcion: "Descripción",
  semana_inicio: "Semana inicial",
  semana_fin: "Semana final",
  peso: "Peso",
  peso_manual: "Peso manual",
  cantidad_meta: "Cantidad meta",
  meta: "Meta",
  unidad: "Unidad",
  linea_base: "Línea base",
  existencia: "Existencia",
};

const CAMPOS_MONEDA = new Set(["valor_total", "asignado", "valor"]);

function valorDe(diferencia: ProjectDiferencia, valor: string | null): string {
  if (diferencia.campo === "existencia") return valor === null ? "Desaparece" : "Aparece";
  if (valor === null) return "—";
  return CAMPOS_MONEDA.has(diferencia.campo) ? formatCOP(toCents(valor)) : valor;
}

const claveDe = (clave: string) => clave.replace("|", " · ");

export function ProjectVersiones({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <section data-testid="versiones">
      <SectionHeader icon={<GitCompareArrows className="size-3.5" strokeWidth={2} />}>Versiones</SectionHeader>
      {proyecto.estado === "BORRADOR" ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">{SIN_LINEA_BASE_NOTE}</p>
      ) : (
        <VersionesContent proyectoId={proyecto.id} />
      )}
    </section>
  );
}

function VersionesContent({ proyectoId }: { proyectoId: string }) {
  const query = useProjectVersions(proyectoId);
  if (query.isError) return <InlineError message={errorMessage(query.error, VERSIONES_ERROR)} className="mt-1.5" />;
  if (query.isLoading || !query.data) return <Skeleton className="mt-2 h-16 w-full rounded-[14px]" />;
  if (query.data.length === 0) return <p className="mt-1.5 text-[12.5px] text-ink-500">{SIN_LINEA_BASE_NOTE}</p>;
  return (
    <div className="mt-2 flex flex-col gap-3">
      <VersionesTabla versiones={query.data} />
      <Comparacion proyectoId={proyectoId} versiones={query.data} />
    </div>
  );
}

function VersionesTabla({ versiones }: { versiones: ProjectVersion[] }) {
  return (
    <div className="overflow-x-auto rounded-inner border border-border bg-panel">
      <Table data-testid="versiones-tabla" className="w-full text-[12.5px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Versión</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Fecha</TableHead>
            <TableHead scope="col">Aprobó</TableHead>
            <TableHead scope="col">Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versiones.map((version) => (
            <TableRow key={version.numero} data-testid="version-fila">
              <TableCell className="font-mono font-semibold text-ink-900">{`v${version.numero}`}</TableCell>
              <TableCell>
                <ToneBadge
                  tone={version.tipo === "LINEA_BASE" ? "neutro" : "info"}
                  label={version.tipo === "LINEA_BASE" ? "Línea base" : "Modificación"}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap text-ink-700">{formatFechaHora(version.aprobado_at)}</TableCell>
              <TableCell className="text-ink-700 whitespace-normal">{version.aprobado_por.nombre ?? "Usuario no disponible"}</TableCell>
              <TableCell className="text-ink-800 whitespace-normal">{version.motivo ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Comparacion({ proyectoId, versiones }: { proyectoId: string; versiones: ProjectVersion[] }) {
  const numeros = [...versiones].map((v) => v.numero).sort((a, b) => a - b);
  const [desde, setDesde] = useState("0");
  const [hasta, setHasta] = useState("vigente");
  const query = useProjectVersionCompare(proyectoId, desde, hasta);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Desde
          <select aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className={SELECT_CLASS}>
            {numeros.map((n) => (
              <option key={n} value={String(n)}>{`v${n}`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Hasta
          <select aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className={SELECT_CLASS}>
            {numeros.map((n) => (
              <option key={n} value={String(n)}>{`v${n}`}</option>
            ))}
            <option value="vigente">Vigente</option>
          </select>
        </label>
      </div>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, COMPARACION_ERROR)} />
      ) : !query.data ? (
        <Skeleton className="h-16 w-full rounded-[14px]" />
      ) : query.data.diferencias.length === 0 ? (
        <p className="text-[12.5px] text-ink-500">Las dos versiones son iguales.</p>
      ) : (
        <Diferencias diferencias={query.data.diferencias} />
      )}
    </div>
  );
}

function Diferencias({ diferencias }: { diferencias: ProjectDiferencia[] }) {
  const grupos = new Map<ProjectDiferencia["elemento"], ProjectDiferencia[]>();
  for (const diferencia of diferencias) {
    grupos.set(diferencia.elemento, [...(grupos.get(diferencia.elemento) ?? []), diferencia]);
  }
  return (
    <div data-testid="versiones-diferencias" className="flex flex-col gap-2.5">
      {[...grupos.entries()].map(([elemento, filas]) => (
        <div
          key={elemento}
          data-testid="diferencias-grupo"
          data-elemento={elemento}
          className="overflow-x-auto rounded-inner border border-border bg-panel"
        >
          <Table className="w-full text-[12.5px]">
            <caption className="border-b border-ink-200 px-3 py-1.5 text-left text-[11px] font-bold text-ink-500 uppercase">
              {ELEMENTO_LABEL[elemento]}
            </caption>
            <TableBody>
              {filas.map((fila, indice) => (
                <TableRow key={`${fila.clave}-${fila.campo}-${indice}`}>
                  <TableCell className="font-mono text-[11.5px] text-ink-700">{claveDe(fila.clave)}</TableCell>
                  <TableCell className="text-ink-600">{CAMPO_LABEL[fila.campo] ?? fila.campo}</TableCell>
                  <TableCell numeric className="text-ink-500 line-through">{valorDe(fila, fila.desde)}</TableCell>
                  <TableCell numeric className="font-semibold text-ink-900">{valorDe(fila, fila.hasta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
