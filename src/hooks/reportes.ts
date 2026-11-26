// Hooks del módulo Reportes: el reporte semanal (S5, `GET /api/v1/reports/weekly`), el reporte por etiqueta
// (T3, `GET /api/v1/reports/tag`) y el reporte de proyecto (T9c, `GET /api/v1/reports/project`), cada uno con su
// Excel y su vista de impresión.

"use client";

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api/http";
import { saveBlobAs } from "@/hooks/projects";
import type { ReporteSemanal } from "@/lib/reportes/semanal";
import type { ReporteEtiqueta } from "@/lib/reportes/etiqueta";
import type { ReporteProyecto } from "@/lib/reportes/proyecto";

export type { ReporteEtiqueta, ReporteProyecto, ReporteSemanal };

/** Filters of the tag report (S3); an empty string means «not set». */
export type ReporteEtiquetaParams = { etiqueta: string; desde: string; hasta: string };

const reportesQueryKeys = {
  semanal: (semana: string | null) => ["reportes", "semanal", semana] as const,
  etiqueta: ({ etiqueta, desde, hasta }: ReporteEtiquetaParams) =>
    ["reportes", "etiqueta", { etiqueta, desde, hasta }] as const,
  proyecto: (proyectoId: string) => ["reportes", "proyecto", proyectoId] as const,
};

/** GETs an Excel export and saves it under the name the server gives (`fallbackName` when it gives none). */
async function descargarExcel(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    throw new ApiError(
      typeof body.error === "string" ? body.error : "No pudimos generar el archivo. Inténtalo de nuevo.",
      res.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  saveBlobAs(await res.blob(), filename);
}

function semanaQuery(semana: string | null): string {
  return semana ? `?semana=${encodeURIComponent(semana)}` : "";
}

/** Vista de impresión del reporte semanal (misma pestaña, S4). */
export function reporteSemanalPrintHref(semana: string): string {
  return `/print/reportes/semanal${semanaQuery(semana)}`;
}

/** Reporte de la semana que contiene `semana` (AAAA-MM-DD); null = la semana en curso. */
export function useReporteSemanal(semana: string | null): UseQueryResult<ReporteSemanal> {
  return useQuery({
    queryKey: reportesQueryKeys.semanal(semana),
    placeholderData: keepPreviousData,
    queryFn: () => apiGet<ReporteSemanal>(`/api/v1/reports/weekly${semanaQuery(semana)}`),
  });
}

/** Baja el reporte semanal en Excel; el nombre del archivo lo pone el servidor. */
export async function downloadReporteSemanal(semana: string | null): Promise<void> {
  await descargarExcel(`/api/v1/reports/weekly/export${semanaQuery(semana)}`, "reporte-semanal.xlsx");
}

/** `?etiqueta=…&desde=…&hasta=…`, leaving out the empty filters. */
function etiquetaQuery(params: ReporteEtiquetaParams): string {
  const qs = new URLSearchParams();
  for (const key of ["etiqueta", "desde", "hasta"] as const) {
    if (params[key]) qs.set(key, params[key]);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Print view of the tag report (same tab, S6). */
export function reporteEtiquetaPrintHref(params: ReporteEtiquetaParams): string {
  return `/print/reportes/etiqueta${etiquetaQuery(params)}`;
}

/** The tag report for a tag and period (S3); it waits until a tag is chosen. */
export function useReporteEtiqueta(params: ReporteEtiquetaParams): UseQueryResult<ReporteEtiqueta> {
  return useQuery({
    queryKey: reportesQueryKeys.etiqueta(params),
    enabled: Boolean(params.etiqueta),
    placeholderData: keepPreviousData,
    queryFn: () => apiGet<ReporteEtiqueta>(`/api/v1/reports/tag${etiquetaQuery(params)}`),
  });
}

/** Downloads the tag report as Excel; the server names the file. */
export async function downloadReporteEtiqueta(params: ReporteEtiquetaParams): Promise<void> {
  await descargarExcel(`/api/v1/reports/tag/export${etiquetaQuery(params)}`, "reporte-etiqueta.xlsx");
}

/** Reportes › Proyecto with a project already chosen: the deep link of the ficha's «Reporte» button (S17). */
export function reporteProyectoHref(proyectoId: string): string {
  return `/reportes?tab=proyecto&proyecto=${encodeURIComponent(proyectoId)}`;
}

/** Print view of the project report (same tab, S17). */
export function reporteProyectoPrintHref(proyectoId: string): string {
  return `/print/reportes/proyecto?proyecto=${encodeURIComponent(proyectoId)}`;
}

/** The project report (S15); it waits until a project is chosen. */
export function useReporteProyecto(proyectoId: string): UseQueryResult<ReporteProyecto> {
  return useQuery({
    queryKey: reportesQueryKeys.proyecto(proyectoId),
    enabled: Boolean(proyectoId),
    placeholderData: keepPreviousData,
    queryFn: () => apiGet<ReporteProyecto>(`/api/v1/reports/project?proyecto_id=${encodeURIComponent(proyectoId)}`),
  });
}

/** Downloads the project report as Excel (S17); the server names the file. */
export async function downloadReporteProyecto(proyectoId: string): Promise<void> {
  await descargarExcel(
    `/api/v1/reports/project/export?proyecto_id=${encodeURIComponent(proyectoId)}&formato=xlsx`,
    "reporte-proyecto.xlsx",
  );
}
