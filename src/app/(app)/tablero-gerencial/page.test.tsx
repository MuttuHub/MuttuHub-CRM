// tablero-gerencial-unificado (F1.6): la ruta standalone `/tablero-gerencial`
// deja de renderizar su propio componente y se convierte en un redirect
// permanente (308) hacia `/?cara=management` — la 5.ª cara "Tablero
// gerencial" del shell de Inicio. `permanentRedirect` (next/navigation) se
// mockea porque en un componente real lanza (`NEXT_REDIRECT`) y termina el
// render; acá solo se verifica que la página lo invoca con el destino
// correcto.

import { describe, expect, it, vi } from "vitest";

const { permanentRedirect } = vi.hoisted(() => ({ permanentRedirect: vi.fn() }));

vi.mock("next/navigation", () => ({ permanentRedirect }));

import TableroGerencialPage from "./page";

describe("TableroGerencialPage", () => {
  it("redirects permanently to the unified route (/?cara=management)", () => {
    TableroGerencialPage();
    expect(permanentRedirect).toHaveBeenCalledWith("/?cara=management");
  });
});
