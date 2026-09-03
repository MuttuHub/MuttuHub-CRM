"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** PR 26 (plan 2A): selector de vista del listado de clientes. */
export type ClientsView = "tarjetas" | "lista" | "detalles";

type ClientsViewState = {
  /** Current view mode. Persisted across sessions. */
  view: ClientsView;
  setView: (view: ClientsView) => void;
};

export const useClientsViewStore = create<ClientsViewState>()(
  persist(
    (set) => ({
      view: "tarjetas",
      setView: (view) => set({ view }),
    }),
    {
      name: "muttu-hub-clientes-vista",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ view: state.view }),
    },
  ),
);