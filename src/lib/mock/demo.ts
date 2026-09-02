// DEMO DATA — replaced by API in milestone 6
// Mirrors the approved Muttu Hub mockup (docs/muttu-hub-v2.html).

export type Tone =
  | "neutro"
  | "activo"
  | "alerta"
  | "riesgo"
  | "exito"
  | "info";

export const DEMO_USER = {
  nombre: "Adriana Gómez",
  iniciales: "AG",
};

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

export const CARTERA_TOTAL = { valor: "$5,4", unidad: "MM COP" };

export const CARTERA_LEYENDA: { label: string; pct: string; color: string }[] =
  [
    { label: "Gobierno", pct: "38 %", color: "#CD1560" },
    { label: "Cooperación", pct: "24 %", color: "#E4569A" },
    { label: "Fundaciones", pct: "20 %", color: "#F5BAD2" },
    { label: "Privado", pct: "18 %", color: "#DDD2D5" },
  ];

export type SinGestionItem = {
  nombre: string;
  responsable: string;
  dias: string;
  grave?: boolean;
};

export const SIN_GESTION_COUNT = "6 aliados";

export const SIN_GESTION: SinGestionItem[] = [
  {
    nombre: "Universidad del Norte",
    responsable: "María Peña",
    dias: "47 d",
    grave: true,
  },
  {
    nombre: "Ministerio de Igualdad",
    responsable: "Diana Castro",
    dias: "39 d",
    grave: true,
  },
  { nombre: "Cámara de Comercio", responsable: "Juan Rivas", dias: "33 d" },
  {
    nombre: "Comfamiliar Atlántico",
    responsable: "Laura Mendoza",
    dias: "31 d",
  },
];

export const DIAS_SEMANA = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

/** August 2026 starts on a Saturday (6 empty leading cells). */
export const CALENDARIO_AGOSTO_2026 = {
  titulo: "Agosto 2026",
  mesNombre: "agosto",
  primerDia: 6,
  totalDias: 31,
  diaSeleccionado: 6,
};

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

export type Cliente = {
  id: string;
  nombre: string;
  ubicacion: string;
  tipo: string;
  estado: string;
  tono: Tone;
  valor: string;
  compromiso: string;
  urgente?: boolean;
};

export const CLIENTES: Cliente[] = [
  {
    id: "c1",
    nombre: "Alcaldía de Barranquilla",
    ubicacion: "Barranquilla, Atlántico",
    tipo: "Gobierno local",
    estado: "Cliente activo",
    tono: "activo",
    valor: "1.284.500.000",
    compromiso: "Vencido hace 4 d",
    urgente: true,
  },
  {
    id: "c2",
    nombre: "ACNUR Colombia",
    ubicacion: "Bogotá D.C.",
    tipo: "Cooperante multilateral",
    estado: "En negociación",
    tono: "info",
    valor: "890.000.000",
    compromiso: "12/08/2026",
  },
  {
    id: "c3",
    nombre: "Fundación Santo Domingo",
    ubicacion: "Barranquilla, Atlántico",
    tipo: "Fundación",
    estado: "Cliente activo",
    tono: "activo",
    valor: "640.000.000",
    compromiso: "19/08/2026",
  },
  {
    id: "c4",
    nombre: "Gobernación del Magdalena",
    ubicacion: "Santa Marta, Magdalena",
    tipo: "Gobierno local",
    estado: "En acercamiento",
    tono: "neutro",
    valor: "415.700.000",
    compromiso: "Vence hoy",
    urgente: true,
  },
  {
    id: "c5",
    nombre: "Universidad del Norte",
    ubicacion: "Puerto Colombia, Atlántico",
    tipo: "Aliado académico",
    estado: "Standby",
    tono: "neutro",
    valor: "122.000.000",
    compromiso: "Sin fecha",
  },
  {
    id: "c6",
    nombre: "Grupo Argos",
    ubicacion: "Medellín, Antioquia",
    tipo: "Empresa privada",
    estado: "Ganada",
    tono: "exito",
    valor: "2.100.000.000",
    compromiso: "28/09/2026",
  },
  {
    id: "c7",
    nombre: "Ministerio de Igualdad",
    ubicacion: "Bogotá D.C.",
    tipo: "Gobierno nacional",
    estado: "Prospecto",
    tono: "neutro",
    valor: "—",
    compromiso: "Sin fecha",
  },
];
