// Reporte semanal de ejemplo para las pruebas de la pestaña «Semanal» y de su vista de impresión.
import type { ReporteSemanal } from "@/hooks/reportes"

const COLORES = { verde: 0, amarillo: 0, rojo: 0 }

export const REPORTE_SEMANAL: ReporteSemanal = {
  semana: { desde: "2026-10-19", hasta: "2026-10-25" },
  semana_anterior: { desde: "2026-10-12", hasta: "2026-10-18" },
  corte: "2026-10-25",
  confirmado: true,
  portafolio: {
    proyectos: [
      {
        id: "p1",
        codigo: "PRY-0001",
        nombre: "Ruta del emprendimiento",
        estado: "EN_EJECUCION",
        cliente: { id: "c1", nombre: "Acme" },
        responsable: { id: "r1", nombre: "Ana" },
        semaforo_tecnico: "verde",
        semaforo_financiero: "rojo",
        alerta_retraso: true,
        avance_real: 42.5,
        avance_programado: 50,
        asignado: "1000000.00",
        programado: "500000.00",
        ejecutado: "120000.00",
        atrasadas: 1,
      },
    ],
    total: {
      tecnico: { proyectos: 1, avance_real: 42.5, avance_programado: 50 },
      financiero: { proyectos: 1, asignado: "1000000.00", programado: "500000.00", ejecutado: "120000.00", ea: 12, ep: 24 },
      atrasadas: 1,
      por_color_tecnico: { ...COLORES, verde: 1 },
      por_color_financiero: { ...COLORES, rojo: 1 },
    },
    por_cliente: [
      {
        cliente: { id: "c1", nombre: "Acme" },
        proyectos: 1,
        tecnico: { proyectos: 1, avance_real: 42.5, avance_programado: 50 },
        financiero: { proyectos: 1, asignado: "1000000.00", programado: "500000.00", ejecutado: "120000.00", ea: 12, ep: 24 },
        atrasadas: 1,
        por_color_tecnico: { ...COLORES, verde: 1 },
        por_color_financiero: { ...COLORES, rojo: 1 },
      },
    ],
  },
  actividades_atrasadas: [
    {
      proyecto: { id: "p1", codigo: "PRY-0001", nombre: "Ruta del emprendimiento" },
      actividad_id: "a1",
      detalle: "A1 Diagnóstico: vencida el 20 oct 2026 con avance 40 %.",
    },
  ],
  tareas: { semana: { cerradas: 5, vencidas: 2 }, semana_anterior: { cerradas: 3, vencidas: 4 } },
  atencion: [
    {
      proyecto: { id: "p1", codigo: "PRY-0001", nombre: "Ruta del emprendimiento" },
      items: [{ tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R01 Personal: ejecutado supera lo asignado." }],
    },
  ],
  gastos_por_validar: {
    cantidad: 2,
    monto: "300000.00",
    por_proyecto: [
      { proyecto: { id: "p1", codigo: "PRY-0001", nombre: "Ruta del emprendimiento" }, cantidad: 2, monto: "300000.00", mas_antiguo: "2026-10-10" },
    ],
  },
}
