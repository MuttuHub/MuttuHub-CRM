// Sample tag report for the tests of the «Etiqueta» tab and its print view (T3, S4).
import type { ReporteEtiqueta } from "@/hooks/reportes"

const KPIS_VACIOS = { cronograma: null, entregables: null, indicadores: null, beneficiarios: null }

export const REPORTE_ETIQUETA: ReporteEtiqueta = {
  etiqueta: "Comercial",
  periodo: { desde: "2026-10-01", hasta: "2026-10-31" },
  corte: "2026-10-31",
  confirmado: true,
  resumen: {
    clientes: 2,
    proyectos: 1,
    valor_total: "2500000.00",
    financiero: { programado: "500000.00", ejecutado: "120000.00" },
    pipeline: { oportunidades: 1, valor: "800000.00" },
    tareas: { total: 3, completadas: 1, vencidas: 1 },
  },
  proyectos: [
    {
      id: "p1",
      codigo: "PRY-0001",
      nombre: "Ruta del emprendimiento",
      estado: "EN_EJECUCION",
      cliente: { id: "c1", nombre: "Acme" },
      responsable: { id: "r1", nombre: "Ana" },
      linea_principal: null,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      semaforo_tecnico: "verde",
      semaforo_financiero: "rojo",
      alerta_retraso: false,
      atrasadas: 0,
      valor_total: "2500000.00",
      kpis: {
        corte: "2026-10-31",
        estado: "EN_EJECUCION",
        medible: true,
        confirmado: true,
        tecnico: { corte: "2026-10-31", avance_real: 42.5, avance_programado: 50, desviacion_pp: -7.5, color: "verde" },
        financiero: {
          corte: "2026-10-31",
          asignado: "1000000.00",
          programado: "500000.00",
          ejecutado: "120000.00",
          ea: 12,
          ep: 24,
          color: "rojo",
          alerta_retraso: false,
        },
        ...KPIS_VACIOS,
      },
    },
  ],
  clientes: [
    {
      id: "c1",
      nombre: "Acme",
      proyectos: 1,
      oportunidades_abiertas: 1,
      ultima_interaccion: "2026-10-28",
      dias_sin_interaccion: 3,
      sin_interaccion_reciente: false,
    },
    {
      id: "c2",
      nombre: "Beta Fundación",
      proyectos: 0,
      oportunidades_abiertas: 0,
      ultima_interaccion: "2026-09-01",
      dias_sin_interaccion: 60,
      sin_interaccion_reciente: true,
    },
  ],
  oportunidades: [
    {
      id: "o1",
      nombre: "Convenio 2027",
      estado: "EN_NEGOCIACION",
      valor_estimado_cop: "800000.00",
      cliente: { id: "c1", nombre: "Acme" },
    },
  ],
  bitacora: [
    {
      id: "b1",
      fecha: "2026-10-28",
      tipo: "REUNION",
      texto: "Revisamos el convenio.",
      proximo_paso: "Enviar la propuesta firmada.",
      cliente: { id: "c1", nombre: "Acme" },
      autor: { id: "r1", nombre: "Ana" },
    },
  ],
  tareas: [
    {
      id: "t1",
      titulo: "Llamar a Beta",
      estado: "POR_HACER",
      fecha_entrega: "2026-10-10",
      vencida: true,
      responsable: { id: "r1", nombre: "Ana" },
      cliente: { id: "c2", nombre: "Beta Fundación" },
    },
    {
      id: "t2",
      titulo: "Preparar informe",
      estado: "EN_CURSO",
      fecha_entrega: "2026-11-15",
      vencida: false,
      responsable: { id: "r2", nombre: "Bruno" },
      cliente: null,
    },
    {
      id: "t3",
      titulo: "Enviar acta",
      estado: "COMPLETADA",
      fecha_entrega: "2026-10-05",
      vencida: false,
      responsable: { id: "r1", nombre: "Ana" },
      cliente: { id: "c1", nombre: "Acme" },
    },
  ],
}

/** The same report for a user without commercial access: opportunities and pipeline come as null (S5). */
export const REPORTE_ETIQUETA_SIN_COMERCIAL: ReporteEtiqueta = {
  ...REPORTE_ETIQUETA,
  resumen: { ...REPORTE_ETIQUETA.resumen, pipeline: null },
  clientes: REPORTE_ETIQUETA.clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    proyectos: c.proyectos,
    ultima_interaccion: c.ultima_interaccion,
    dias_sin_interaccion: c.dias_sin_interaccion,
    sin_interaccion_reciente: c.sin_interaccion_reciente,
  })),
  oportunidades: null,
}
