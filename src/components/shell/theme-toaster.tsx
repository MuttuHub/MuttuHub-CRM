"use client";

// Sonner toaster bound to the app theme. The anti-FOUC script and useTheme
// own the `.dark` class on <html>; the Toaster must follow that resolved
// decision (light/dark) instead of sonner's light default, otherwise dark
// toasts render as white cards over the dark shell. richColors stays on
// for semantic icons; the base style override maps toasts onto the app
// surface tokens (--color-card flips with the theme). Text uses
// --color-ink-800 — the body text token — NOT ink-100: in this palette the
// ink scale inverts in dark mode (low numbers are surfaces), so ink-100
// would be dark-on-dark. The action button keeps sonner's own
// --normal-text/--normal-bg contrast and stays legible in both themes.

import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      richColors
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-card)",
          color: "var(--color-ink-800)",
          border: "1px solid var(--color-border)",
        },
      }}
    />
  );
}