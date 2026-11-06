import { describe, expect, it } from "vitest"
import {
  contextoDeEntradas,
  describirEntrada,
  iniciales,
  tipoDeEntrada,
  type EntradaRegistro,
} from "./registro-frases"

const BASE = {
  actividades: new Map([["act-11", "1.1"]]),
  entregables: new Map([["ent-1", "E1"]]),
  indicadores: new Map([["ind-1", "I2"]]),
  rubros: new Map<string, { codigo: string | null; nombre: string }>(),
  tiposModificacion: { TRASLADO: "Traslado entre rubros" },
}

const fila = (over: Partial<EntradaRegistro>): EntradaRegistro => ({
  id: "x",
  accion: "CREAR",
  entidad: "proyecto",
  entidad_id: "e",
  campo: null,
  valor_anterior: null,
  valor_nuevo: null,
  ...over,
})

describe("registro de cambios: sentences", () => {
  const creado = fila({ entidad: "gasto", entidad_id: "g1", valor_nuevo: { numero_documento: "FV-1", valor: "1000.00" } })
  const reporte = fila({ entidad: "reporte_actividad", entidad_id: "rep-1", valor_nuevo: { actividad_id: "act-11", porcentaje: 20, fecha: "2026-10-11" } })
  const ctx = contextoDeEntradas([creado, reporte], BASE)

  it("names a validated or rejected gasto by the number read from its creation", () => {
    expect(describirEntrada(fila({ accion: "VALIDAR", entidad: "gasto", entidad_id: "g1", campo: "estado", valor_nuevo: "VALIDADO" }), ctx)).toMatchObject({
      tipo: "gastos",
      predicado: "validó el gasto FV-1.",
      etiqueta: "Validación",
      gastoId: "g1",
    })
    expect(
      describirEntrada(fila({ accion: "RECHAZAR", entidad: "gasto", entidad_id: "g1", valor_nuevo: { estado: "RECHAZADO", motivo: "Sin firma" } }), ctx),
    ).toMatchObject({ predicado: "rechazó el gasto FV-1.", cita: "Sin firma", etiqueta: "Gasto rechazado" })
  })

  it("places a void in its activity through the report that created it", () => {
    const anulacion = fila({
      accion: "ANULAR",
      entidad: "reporte_actividad",
      entidad_id: "rep-1",
      valor_anterior: { porcentaje: "20.00", fecha: "2026-10-11T00:00:00.000Z" },
      valor_nuevo: { motivo_anulacion: "Duplicado" },
    })
    expect(describirEntrada(anulacion, ctx)).toMatchObject({
      tipo: "anulaciones",
      predicado: "anuló el reporte de 20 % del 11 oct en la actividad 1.1.",
      motivoAnulacion: "Duplicado",
      actividadId: "act-11",
    })
  })

  it("reads an attached medio, an entregable progress and a measurement", () => {
    expect(
      describirEntrada(fila({ entidad: "reporte_actividad", entidad_id: "rep-1", campo: "medio", valor_nuevo: { nombre: "acta.pdf" } }), ctx)?.predicado,
    ).toBe("adjuntó «acta.pdf» a un reporte de avance en la actividad 1.1.")
    expect(
      describirEntrada(fila({ entidad: "avance", valor_nuevo: { entregable_id: "ent-1", cantidad: "3.00", fecha: "2026-11-02" } }), ctx)?.predicado,
    ).toBe("registró 3 en el entregable E1, con fecha 02 nov.")
    expect(
      describirEntrada(fila({ entidad: "medicion", valor_nuevo: { indicador_id: "ind-1", valor: "12.5", fecha: "2026-11-02" } }), ctx)?.predicado,
    ).toBe("registró la medición 12,5 del indicador I2, con fecha 02 nov.")
  })

  it("reads the plan changes: request, approval, rejection and versions", () => {
    expect(
      describirEntrada(fila({ accion: "SOLICITAR", entidad: "solicitud", valor_nuevo: { tipo: "TRASLADO", motivo: "Ajuste" } }), ctx),
    ).toMatchObject({ tipo: "plan", predicado: "solicitó una modificación (traslado entre rubros).", cita: "Ajuste" })
    expect(describirEntrada(fila({ accion: "APROBAR", entidad: "solicitud" }), ctx)?.predicado).toBe("aprobó la solicitud de modificación.")
    expect(describirEntrada(fila({ accion: "RECHAZAR", entidad: "solicitud" }), ctx)?.predicado).toBe(
      "rechazó la solicitud de modificación. El plan no cambia.",
    )
    expect(describirEntrada(fila({ accion: "APROBAR", entidad: "version", valor_nuevo: { numero: 2, tipo: "MODIFICACION" } }), ctx)?.predicado).toBe(
      "creó la versión 2 del plan.",
    )
    expect(describirEntrada(fila({ accion: "APROBAR", entidad: "version", valor_nuevo: { numero: 0, tipo: "LINEA_BASE" } }), ctx)?.predicado).toBe(
      "aprobó la línea base: nació la versión original del plan.",
    )
  })

  it("leaves the other movements to the generic reading, filed under their type", () => {
    expect(describirEntrada(fila({ accion: "EDITAR", entidad: "proyecto", campo: "nombre" }), ctx)).toBeNull()
    expect(tipoDeEntrada({ accion: "EDITAR", entidad: "gasto" })).toBe("gastos")
    expect(tipoDeEntrada({ accion: "EDITAR", entidad: "proyecto_miembro" })).toBe("otros")
    expect(tipoDeEntrada({ accion: "ANULAR", entidad: "avance" })).toBe("anulaciones")
  })

  it("takes two initials for the avatar", () => {
    expect(iniciales("Laura Jiménez Gómez")).toBe("LJ")
    expect(iniciales("Usuario no disponible")).toBe("UN")
  })
})
