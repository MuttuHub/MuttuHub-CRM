"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SidebarState = {
  /** Desktop rail mode (icons only). Persisted across sessions. */
  collapsed: boolean;
  /** Mobile overlay drawer visibility. Session-only. */
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpen: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setMobileOpen: (open) => set({ mobileOpen: open }),
    }),
    {
      name: "muttu-hub-sidebar",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
);
