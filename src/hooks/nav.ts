// TanStack Query data layer for the shell nav badges: real counts per section
// (clientes, tablero, documentos) served by GET /api/v1/nav/counts.

"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/http";

export type NavCounts = {
  clientes: number;
  tablero: number;
  documentos: number;
};

export function useNavCounts(): UseQueryResult<NavCounts> {
  return useQuery({
    queryKey: ["nav", "counts"],
    queryFn: () => apiGet<NavCounts>("/api/v1/nav/counts"),
  });
}