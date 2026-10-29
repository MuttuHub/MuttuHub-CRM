// Hooks del módulo Reportes. Por ahora, el reporte semanal (S5): `GET /api/v1/reports/weekly` y su Excel.

"use client";

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api/http";
import { saveBlobAs } from "@/hooks/projects";
import type { ReporteSemanal } from "@/lib/reportes/semanal";

export type { ReporteSemanal };

export const reportesQueryKeys = {
  semanal: (semana: string | null) => ["reportes", "semanal", semana] as const,
};

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
  const res = await fetch(`/api/v1/reports/weekly/export${semanaQuery(semana)}`, { method: "GET" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
    throw new ApiError(
      typeof body.error === "string" ? body.error : "No pudimos generar el archivo. Inténtalo de nuevo.",
      res.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "reporte-semanal.xlsx";
  saveBlobAs(await res.blob(), filename);
}
