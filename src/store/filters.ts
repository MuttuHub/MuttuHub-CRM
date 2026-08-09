"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Global date-range filter shared by the shell header ("Este mes") and the
 * dashboard/reportes filter bars. The ChipSelector on the dashboard also
 * writes here, so the header button and the selector stay in sync.
 * Persisted across sessions (same convention as src/store/sidebar.ts).
 */
export type RangoFiltro = "todo" | "mes" | "30" | "90";

export const RANGO_OPCIONES: { value: RangoFiltro; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "mes", label: "Este mes" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

/** Label for the compact header button (longer than the chip labels). */
export const RANGO_HEADER_LABELS: Record<RangoFiltro, string> = {
  todo: "Todo el tiempo",
  mes: "Este mes",
  "30": "30 días",
  "90": "90 días",
};

type FiltersState = {
  rango: RangoFiltro;
  setRango: (rango: RangoFiltro) => void;
};

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      rango: "mes",
      setRango: (rango) => set({ rango }),
    }),
    {
      name: "muttu-hub-filters",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ rango: state.rango }),
    },
  ),
);