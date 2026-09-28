"use client";

// Sonner toaster — v6 contract (gap map §1 "Toast"): the toast is a FIXED
// light card, independent of the app theme. Earlier this followed
// useTheme()/the `.dark` class on <html>, which flipped it to a dark card;
// v6 wants toasts to always read as a light card even while the rest of the
// app is dark, so `theme` is now hard-pinned to "light" and the style
// override uses the new --toast-* tokens (--toast-bg/--toast-fg/
// --toast-border), which are declared only in :root and never redefined in
// .dark — they cannot flip even if something later adds a .dark override
// elsewhere. richColors stays on for semantic icons (they use sonner's own
// light palette once theme="light"). duration=5000 and closeButton (labeled
// "Cerrar") match the v6 spec; the action button keeps sonner's own
// --normal-text/--normal-bg contrast.

import { Toaster } from "sonner";

export function ThemeToaster() {
  return (
    <Toaster
      theme="light"
      richColors
      position="bottom-right"
      duration={5000}
      closeButton
      toastOptions={{
        closeButtonAriaLabel: "Cerrar",
        style: {
          background: "var(--toast-bg)",
          color: "var(--toast-fg)",
          border: "1px solid var(--toast-border)",
        },
      }}
    />
  );
}