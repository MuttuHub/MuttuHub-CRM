// Sample project report for the tests of the «Proyecto» tab and its print view (T9c, S15).
import type { ReporteProyecto } from "@/hooks/reportes"

export const REPORTE_PROYECTO: ReporteProyecto = {
  corte: "2026-11-26",
  resumen: {
    proyecto: { id: "p1", codigo: "PRY-0007", nombre: "Moda circular", estado: "EN_EJECUCION", origen: "POSICION_PROPIA" },
    cliente: "Posición propia · 2 aliados",
    responsable: { id: "r1", nombre: "Ana" },
    valor_total: "1000000.00",
    financiero: { programado: "400000.00", ejecutado: "150000.00" },
    financiacion: { meta: "1000000.00", comprometido: "600000.00", en_gestion: "250000.00", sin_cubrir: "150000.00" },
  },
  aliados: [
    {
      id: "a1",
      cliente: { id: "c1", nombre: "Fundación Telar" },
      rol: "FINANCIADOR",
      estado: "COMPROMETIDO",
      aporte_cop: 600000,
      ultima_interaccion: "2026-11-20",
    },
    {
      id: "a2",
      cliente: { id: "c2", nombre: "Alcaldía de Itagüí" },
      rol: "ALIADO",
      estado: "EN_GESTION",
      aporte_cop: 250000,
      ultima_interaccion: null,
    },
  ],
  oportunidades: [
    {
      id: "o1",
      nombre: "Convenio Telar 2027",
      estado: "EN_NEGOCIACION",
      fase: "PROSPECCION",
      valor_estimado_cop: "300000.00",
      cliente: { id: "c1", nombre: "Fundación Telar" },
      vinculo: "ALIADO",
    },
  ],
  bitacora: [
    {
      id: "b1",
      fecha: "2026-11-20",
      tipo: "REUNION",
      texto: "Firmamos el compromiso de aporte.",
      proximo_paso: "Enviar el acta firmada.",
      cliente: { id: "c1", nombre: "Fundación Telar" },
      autor: { id: "r1", nombre: "Ana" },
    },
  ],
  tareas: {
    resumen: { total: 5, completadas: 2, canceladas: 1, avance_pct: 50 },
    vencidas: [
      {
        id: "t1",
        titulo: "Llamar a la alcaldía",
        estado: "POR_HACER",
        fecha_entrega: "2026-11-10",
        responsable: { id: "r1", nombre: "Ana" },
      },
    ],
    proximas: [
      {
        id: "t2",
        titulo: "Preparar el informe de avance",
        estado: "EN_CURSO",
        fecha_entrega: "2026-12-05",
        responsable: { id: "r2", nombre: "Bruno" },
      },
    ],
  },
}

/** A project that is not posición propia, seen by a user without commercial access (S5): no financing, no allies, no opportunities. */
export const REPORTE_PROYECTO_SIN_COMERCIAL: ReporteProyecto = {
  ...REPORTE_PROYECTO,
  resumen: {
    ...REPORTE_PROYECTO.resumen,
    proyecto: { ...REPORTE_PROYECTO.resumen.proyecto, origen: "OPORTUNIDAD" },
    cliente: "Acme",
    financiacion: null,
  },
  aliados: [],
  oportunidades: null,
}
