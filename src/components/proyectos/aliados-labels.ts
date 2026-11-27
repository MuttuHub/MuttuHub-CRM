// S9: Spanish labels for an ally's role and state, shared by the create form and the ficha's allies tile.

import type { AllyEstado, AllyRol } from "@/hooks/projects";

export const ROL_ALIADO_LABEL: Record<AllyRol, string> = {
  FINANCIADOR: "Financiador",
  ALIADO: "Aliado",
  PROSPECTO: "Prospecto",
};

export const ESTADO_ALIADO_LABEL: Record<AllyEstado, string> = {
  EN_GESTION: "En gestión",
  COMPROMETIDO: "Comprometido",
  DESCARTADO: "Descartado",
};
