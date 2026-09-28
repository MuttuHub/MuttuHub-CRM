// tablero-gerencial-unificado (F1.6): ruta unificada. `/tablero-gerencial`
// dejó de renderizar su propia implementación (`TableroGerencialClient`,
// eliminado) y ahora es un redirect server-side permanente (308) hacia la
// 5.ª cara "Tablero gerencial" del shell de Inicio (`/?cara=management`) —
// un bookmark o link externo a esta ruta sigue funcionando (design.md,
// "Routing Decision").

import { permanentRedirect } from "next/navigation";

export default function TableroGerencialPage() {
  permanentRedirect("/?cara=management");
}
