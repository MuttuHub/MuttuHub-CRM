// Parámetros del semáforo v2 (valores PLACEHOLDER: el PO aún no los confirmó).
// Cada parámetro guarda su valor y un `confirmado` que solo se activa cuando un
// administrador lo marca de forma explícita. Pura: sin acceso a datos.

export const PARAMETRO_KEYS = [
  "umbral1",
  "umbral2",
  "tolerancia",
  "retraso",
  "avance_requiere_medio",
  "modificacion_bloquea_periodos_pasados",
] as const;

export type ParametroKey = (typeof PARAMETRO_KEYS)[number];

export type Parametro<T> = { valor: T; confirmado: boolean };

export type ParametrosV2 = {
  /** Puntos porcentuales (pp) de desviación del primer umbral. */
  umbral1: Parametro<number>;
  /** Puntos porcentuales (pp) de desviación del segundo umbral. */
  umbral2: Parametro<number>;
  /** Tolerancia en %. */
  tolerancia: Parametro<number>;
  /** Retraso en %. */
  retraso: Parametro<number>;
  avance_requiere_medio: Parametro<boolean>;
  modificacion_bloquea_periodos_pasados: Parametro<boolean>;
};

export const PARAMETROS_V2_DEFAULT: ParametrosV2 = {
  umbral1: { valor: 10, confirmado: false },
  umbral2: { valor: 20, confirmado: false },
  tolerancia: { valor: 10, confirmado: false },
  retraso: { valor: 70, confirmado: false },
  avance_requiere_medio: { valor: true, confirmado: false },
  modificacion_bloquea_periodos_pasados: { valor: true, confirmado: false },
};

const NUMERIC_KEYS = ["umbral1", "umbral2", "tolerancia", "retraso"] as const;

function isNumericValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Primer problema de coherencia entre parámetros (o null si es coherente). */
export function parametrosV2Issue(params: ParametrosV2): string | null {
  if (params.umbral1.valor >= params.umbral2.valor) {
    return "El umbral 1 debe ser menor que el umbral 2.";
  }
  return null;
}

/**
 * Lee el valor guardado en `settings` con fallback seguro: cualquier parámetro
 * ausente o mal formado vuelve a su default (sin confirmar); un par de umbrales
 * incoherente vuelve a los dos defaults.
 */
export function parseParametrosV2(raw: unknown): ParametrosV2 {
  const source = isRecord(raw) ? raw : {};
  const result: ParametrosV2 = structuredClone(PARAMETROS_V2_DEFAULT);

  for (const key of NUMERIC_KEYS) {
    const item = source[key];
    if (isRecord(item) && isNumericValue(item.valor) && typeof item.confirmado === "boolean") {
      result[key] = { valor: item.valor, confirmado: item.confirmado };
    }
  }
  for (const key of ["avance_requiere_medio", "modificacion_bloquea_periodos_pasados"] as const) {
    const item = source[key];
    if (isRecord(item) && typeof item.valor === "boolean" && typeof item.confirmado === "boolean") {
      result[key] = { valor: item.valor, confirmado: item.confirmado };
    }
  }

  if (parametrosV2Issue(result) !== null) {
    result.umbral1 = { ...PARAMETROS_V2_DEFAULT.umbral1 };
    result.umbral2 = { ...PARAMETROS_V2_DEFAULT.umbral2 };
  }
  return result;
}

export type ColorSemaforo = "verde" | "amarillo" | "rojo";

/**
 * Color of the technical semáforo from the deviation in percentage points.
 * Compared in tenths of a point so float noise (9.999999999999998) cannot flip a
 * boundary: 10.0 is verde, 10.1 amarillo, 20.0 amarillo, 20.1 rojo. A negative
 * deviation (ahead of schedule) is verde.
 */
export function colorTecnicoV2(
  desviacionPp: number,
  umbrales: { umbral1: number; umbral2: number },
): ColorSemaforo {
  const tenths = Math.round(desviacionPp * 10);
  if (tenths <= Math.round(umbrales.umbral1 * 10)) return "verde";
  if (tenths <= Math.round(umbrales.umbral2 * 10)) return "amarillo";
  return "rojo";
}
