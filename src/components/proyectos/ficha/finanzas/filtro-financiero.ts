// The corte and base the financial sheet is read with. Finanzas › Resumen holds it above its two views, so «Por
// actividad» reads the same sheet as «Por rubro» and a choice survives switching views (L32.1).

"use client";

import { useState } from "react";
import type { ProjectBase } from "@/hooks/projects";

export type FiltroFinanciero = {
  corte: string | null;
  base: ProjectBase;
  setCorte: (corte: string | null) => void;
  setBase: (base: ProjectBase) => void;
};

/** `corte = null` lets the server pick its default cut; `vigente` is the current plan. */
export function useFiltroFinanciero(): FiltroFinanciero {
  const [corte, setCorte] = useState<string | null>(null);
  const [base, setBase] = useState<ProjectBase>("vigente");
  return { corte, base, setCorte, setBase };
}
