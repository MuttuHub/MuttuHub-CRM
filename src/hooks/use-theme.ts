"use client";

// Dark/light theme with localStorage persistence ("muttu-theme"), no
// dependencies. The anti-FOUC inline script in the root layout decides the
// initial class on <html> before paint (stored value, else system
// preference); this hook only READS that decision and toggles it. The class
// also drives native control theming via `color-scheme` (scrollbars, date
// pickers).

import { useCallback, useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "muttu-theme";

export type Theme = "light" | "dark";

/** Current theme from the class the anti-FOUC script applied to <html>. */
function temaDelDOM(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function aplicarTema(tema: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", tema === "dark");
  root.style.colorScheme = tema;
}

export function useTheme() {
  // Defaults to "light" for the SSR pass; the resolved theme lands in an
  // effect so the first client render matches the server HTML (the class is
  // already applied by the inline script, so there is no background flash).
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = window.setTimeout(() => setTheme(temaDelDOM()), 0);
    return () => window.clearTimeout(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((actual) => {
      const siguiente: Theme = actual === "dark" ? "light" : "dark";
      aplicarTema(siguiente);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, siguiente);
      } catch {
        // localStorage unavailable (private mode): the theme still applies
        // for this session.
      }
      return siguiente;
    });
  }, []);

  return { theme, toggleTheme };
}