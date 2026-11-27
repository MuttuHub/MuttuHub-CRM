// S9: Spanish labels for an ally's role and state, shared by the create form, the ficha's allies tile, the
// project report tab and its Excel. Plain constants with no imports, so both the client bundle and the server can use them.

type AllyRol = "FINANCIADOR" | "ALIADO" | "PROSPECTO";
type AllyEstado = "EN_GESTION" | "COMPROMETIDO" | "DESCARTADO";

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
