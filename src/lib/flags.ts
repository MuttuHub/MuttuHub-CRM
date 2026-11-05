// Feature flags de servidor. Se leen de variables de entorno y no tocan la base de datos: encender una
// bandera es un cambio de configuración, no un despliegue de datos.
//
// `FEATURE_PROYECTOS_V3` gobierna la sección nueva de Proyectos (`/proyectos-v3`). Tres valores:
//   · `off`   (por defecto) — la ruta responde 404;
//   · `admin`             — solo ADMINISTRADOR y GERENCIA la ven;
//   · `on`                — cualquiera con sesión la ve.
// Cualquier otro valor se trata como `off`: una bandera mal escrita nunca enciende nada.

export type ProyectosV3Flag = "off" | "admin" | "on";

/** Roles que entran cuando la bandera está en `admin`. */
const ROLES_ADMIN: ReadonlySet<string> = new Set(["ADMINISTRADOR", "GERENCIA"]);

export function leerBanderaProyectosV3(valor: string | undefined): ProyectosV3Flag {
  const limpio = (valor ?? "").trim().toLowerCase();
  return limpio === "admin" || limpio === "on" ? limpio : "off";
}

/** La bandera vigente en este proceso. */
export function banderaProyectosV3(): ProyectosV3Flag {
  return leerBanderaProyectosV3(process.env.FEATURE_PROYECTOS_V3);
}

/**
 * ¿Esta sesión puede ver la sección v3? Sin sesión, no; y una bandera desconocida es `off`.
 */
export function puedeVerProyectosV3(bandera: ProyectosV3Flag, rol: string | null | undefined): boolean {
  if (bandera === "off" || !rol) return false;
  if (bandera === "on") return true;
  return ROLES_ADMIN.has(rol);
}
