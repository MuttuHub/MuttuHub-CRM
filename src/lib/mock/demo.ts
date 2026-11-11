// DEMO DATA — replaced by API in milestone 6
// Mirrors the approved Muttu Hub mockup (docs/muttu-hub-v2.html).

export type Tone =
  | "neutro"
  | "activo"
  | "alerta"
  | "riesgo"
  | "exito"
  | "info";

export type Kpi = {
  label: string;
  val: string;
  delta: string;
  foot: string;
  icon: "pipeline" | "bandera" | "reloj" | "tendencia";
  acento?: boolean;
  malo?: boolean;
};

export const KPIS_INICIO: Kpi[] = [
  {
    label: "Pipeline activo",
    val: "$5,4 MM",
    delta: "↑ 8,1 %",
    foot: "vs. julio",
    icon: "pipeline",
    acento: true,
  },
  {
    label: "Compromisos vencidos",
    val: "3",
    delta: "↑ 1",
    foot: "desde ayer",
    icon: "bandera",
    malo: true,
  },
  {
    label: "Tareas de hoy",
    val: "4",
    delta: "↑ 2",
    foot: "esta semana",
    icon: "reloj",
    malo: true,
  },
  {
    label: "Tasa de cierre",
    val: "38 %",
    delta: "↑ 5 pts",
    foot: "últimos 90 días",
    icon: "tendencia",
  },
];

export type Mes = {
  label: string;
  v: number;
  hoy?: boolean;
  proy?: boolean;
  tooltip?: string;
};

export const MESES: Mes[] = [
  { label: "Ene", v: 42 },
  { label: "Feb", v: 58 },
  { label: "Mar", v: 51 },
  { label: "Abr", v: 74 },
  { label: "May", v: 63 },
  { label: "Jun", v: 88 },
  { label: "Jul", v: 71 },
  { label: "Ago", v: 96, hoy: true, tooltip: "$1.184 M" },
  { label: "Sep", v: 54, proy: true },
  { label: "Oct", v: 67, proy: true },
  { label: "Nov", v: 80, proy: true },
  { label: "Dic", v: 45, proy: true },
];

export type AgendaItem = {
  k: string;
  hora: string;
  titulo: string;
  detalle: string;
  badge: string;
  tono: Tone;
};

export const AGENDA: Record<number, AgendaItem[]> = {
  6: [
    {
      k: "a1",
      hora: "08:30",
      titulo: "Comité técnico · Alcaldía de Barranquilla",
      detalle: "Elena Barrios y 4 más",
      badge: "Presencial",
      tono: "neutro",
    },
    {
      k: "a2",
      hora: "11:00",
      titulo: "Enviar informe trimestral a ACNUR",
      detalle: "Adrián Guerra · vence hoy",
      badge: "Vence hoy",
      tono: "riesgo",
    },
    {
      k: "a3",
      hora: "14:30",
      titulo: "Revisión de propuesta ventanilla única",
      detalle: "Diana Castro, Laura Mendoza",
      badge: "Interna",
      tono: "neutro",
    },
    {
      k: "a4",
      hora: "16:00",
      titulo: "Llamada Fundación Santo Domingo",
      detalle: "Seguimiento a línea base cohorte 3",
      badge: "Cliente",
      tono: "activo",
    },
  ],
  9: [
    {
      k: "b1",
      hora: "09:00",
      titulo: "Agendar comité técnico de agosto",
      detalle: "Adrián Guerra",
      badge: "Compromiso",
      tono: "alerta",
    },
  ],
  12: [
    {
      k: "c1",
      hora: "10:00",
      titulo: "Ajustar propuesta técnica",
      detalle: "Diana Castro · MTT-0912",
      badge: "Tarea",
      tono: "neutro",
    },
    {
      k: "c2",
      hora: "15:00",
      titulo: "Mesa de trabajo Gobernación del Magdalena",
      detalle: "Juan Rivas · Santa Marta",
      badge: "Viaje",
      tono: "activo",
    },
  ],
  19: [
    {
      k: "d1",
      hora: "08:00",
      titulo: "Entrega de informe Fundación Santo Domingo",
      detalle: "Laura Mendoza",
      badge: "Compromiso",
      tono: "alerta",
    },
  ],
};
