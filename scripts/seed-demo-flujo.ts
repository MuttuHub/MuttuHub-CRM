/**
 * WHY: the live demo of the project creation flow (`/proyectos/nuevo`, origins "Desde una
 * oportunidad ganada" and "Proyecto independiente") feels empty with only the base seed: few
 * clients and just a couple of free GANADA opportunities. This is a LOCAL-ONLY, idempotent
 * enrichment, not a feature. It adds, all of it FICTITIOUS (invented organizations and people,
 * `@demo.muttuhub.local` e-mails, fake phones):
 *
 *   - 6 clients (aliados) in cities of the demo municipios catalog, 1-2 contacts each with the
 *     stakeholder matrix (poder / interes / fuerza_relacion) and an internal owner;
 *   - 12 opportunities spread over EVERY EstadoOportunidad, 4 of them GANADA without a project
 *     (phase PROSPECCION, no adjudication date: the real conversion sets both), so the
 *     "Convertir en proyecto" / stepper path can be shown several times;
 *   - 3 interactions (bitácora) per client with type and `proximo_paso`, so the client sheets
 *     are not empty.
 *
 * It never creates projects (scripts/seed-projects-demo.ts owns those). Run order on a fresh
 * database: `db:migrate:reset:local` -> `db:seed:local` -> `db:demo:seed-projects:local -- --apply`
 * -> this script with `--apply`. Running it before the projects seed would let that seed pick
 * these (higher value) opportunities for its two demo projects.
 *
 * Idempotency: every row has a deterministic id inside the `MARKER_ID_PREFIX` namespace (which
 * does not overlap prisma/seed.ts ids). The run reads which ids exist and creates only the
 * missing ones, never updating a row: a GANADA opportunity that was converted during a rehearsal
 * keeps its state. A second run changes nothing.
 *
 *   npm run db:demo:seed-flujo:local                # dry run (default)
 *   npm run db:demo:seed-flujo:local -- --apply
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local` and refuses a
 * non-loopback database before `@/lib/db` builds a Prisma client.
 */
import "../prisma/require-local-db"

import { NonLocalDatabaseError, connectionTarget, isLocalTarget } from "../prisma/local-env"
import { db } from "../src/lib/db"

// ---------------------------------------------------------------------------
// Pure part: modes, guard, fictitious data, consistency, idempotency plan
// ---------------------------------------------------------------------------

export type SeedMode = "dry-run" | "apply" | "help"

export type DemoFlujoClient = typeof db

/** Fixed uuid-shaped ids (like prisma/seed.ts) in their own 4th-group range d001-d004. */
export const MARKER_ID_PREFIX = "00000000-0000-4000-d00"
/** Free GANADA opportunities this seed leaves for the live conversion. */
export const FREE_GANADA_COUNT = 4

const ID_CODE = { cliente: "d001", contacto: "d002", oportunidad: "d003", interaccion: "d004" } as const

function demoId(kind: keyof typeof ID_CODE, n: number): string {
  return `00000000-0000-4000-${ID_CODE[kind]}-${n.toString(16).padStart(12, "0")}`
}

export const DEMO_EMAIL_DOMAIN = "demo.muttuhub.local"

/** Existing demo users (prisma/seed.ts personas) that own the fictitious clients. */
export type ResponsableKey = "admin" | "gerencia" | "coordinador"
const RESPONSABLE_EMAIL: Record<ResponsableKey, string> = {
  admin: `admin@${DEMO_EMAIL_DOMAIN}`,
  gerencia: `gerencia@${DEMO_EMAIL_DOMAIN}`,
  coordinador: `coordinador@${DEMO_EMAIL_DOMAIN}`,
}

const USAGE = [
  "Usage:",
  "  npm run db:demo:seed-flujo:local                # dry run (default)",
  "  npm run db:demo:seed-flujo:local -- --apply     # writes the demo clients, opportunities and interactions",
  "Local database only. Idempotent: a second run changes nothing.",
]

export function parseSeedArgs(argv: readonly string[]): SeedMode {
  if (argv.includes("--help")) return "help"
  for (const arg of argv) {
    if (arg !== "--apply") throw new Error(`Unknown argument "${arg}". Use --help.`)
  }
  return argv.includes("--apply") ? "apply" : "dry-run"
}

/** Loopback only; `require-local-db` already refused at import time, this is the second line. */
export function assertLocalTarget(url: string | undefined | null): void {
  if (!isLocalTarget(url)) {
    throw new NonLocalDatabaseError(`Refusing to run: DATABASE_URL points to "", not to a loopback database.`)
  }
}

type TipoCliente = "GOBIERNO_LOCAL" | "COOPERANTE_MULTILATERAL" | "EMPRESA_PRIVADA" | "FUNDACION" | "ALIADO_ACADEMICO"
type EstadoCliente = "PROSPECTO" | "EN_ACERCAMIENTO" | "CLIENTE_ACTIVO"
type Prioridad = "ALTA" | "MEDIA" | "BAJA"
type RolContacto = "DECISOR" | "TECNICO" | "INFLUENCIADOR" | "OTRO"
type TipoInteraccion = "REUNION" | "CORREO" | "LLAMADA" | "VISITA" | "OTRO"

export type EstadoOportunidad =
  | "EN_REVISION"
  | "DISENANDO_PROPUESTA"
  | "PRESENTADA"
  | "EN_NEGOCIACION"
  | "GANADA"
  | "PERDIDA"
  | "STANDBY"

export type DemoCliente = {
  id: string
  nombre: string
  tipoCliente: TipoCliente
  estado: EstadoCliente
  prioridad: Prioridad
  tamanoOrg: string
  ubicacion: string
  canalContactoInicial: string
  responsable: ResponsableKey
  diasPrimerContacto: number
  resumenRelacion: string
  riesgosBarreras: string
  prioridadesIdentificadas: string
}

export type DemoContacto = {
  id: string
  clienteId: string
  nombre: string
  cargo: string
  correo: string
  telefono: string
  rolDecision: RolContacto
  notas: string
  poder: number
  interes: number
  fuerzaRelacion: number
  owner: ResponsableKey
}

export type DemoOportunidad = {
  id: string
  clienteId: string
  nombre: string
  problemaDetectado: string
  solucionPropuesta: string
  serviciosInteres: string
  valor: number
  estado: EstadoOportunidad
  fase: "PROSPECCION"
  /** Days before today. `null` on a free GANADA: the real conversion sets phase and date. */
  diasAdjudicacion: number | null
  diasUltimaGestion: number
  /** `fecha_envio_propuesta`, days before today; `null` while the proposal is still being designed. */
  diasEnvioPropuesta: number | null
}

export type DemoInteraccion = {
  id: string
  clienteId: string
  oportunidadId: string | null
  autor: ResponsableKey
  tipo: TipoInteraccion
  texto: string
  proximoPaso: string | null
  diasAtras: number
}

export type DemoFlujoData = {
  clientes: DemoCliente[]
  contactos: DemoContacto[]
  oportunidades: DemoOportunidad[]
  interacciones: DemoInteraccion[]
}

type ClienteDef = Omit<DemoCliente, "id">
type ContactoDef = Omit<DemoContacto, "id" | "clienteId" | "correo" | "telefono"> & { cliente: number; correoLocal: string }
type OportunidadDef = Omit<DemoOportunidad, "id" | "clienteId" | "fase" | "diasAdjudicacion"> & { cliente: number }
type InteraccionDef = Omit<DemoInteraccion, "id" | "clienteId" | "oportunidadId"> & { cliente: number; oportunidad?: number }

// Invented organizations in cities of the demo municipios catalog (prisma/seed.ts MUNICIPIOS_DEMO).
const CLIENTES: ClienteDef[] = [
  {
    nombre: "Fundación Tejiendo Caribe",
    tipoCliente: "FUNDACION",
    estado: "CLIENTE_ACTIVO",
    prioridad: "ALTA",
    tamanoOrg: "Mediana (30-80 personas)",
    ubicacion: "Barranquilla, Atlántico",
    canalContactoInicial: "Encuentro regional de economía solidaria",
    responsable: "gerencia",
    diasPrimerContacto: -210,
    resumenRelacion: "Aliado histórico en proyectos de fortalecimiento de unidades productivas textiles lideradas por mujeres.",
    riesgosBarreras: "Depende de recursos de cooperación con ventanas de ejecución cortas.",
    prioridadesIdentificadas: "Escalar la dotación productiva y la comercialización conjunta en tres municipios más.",
  },
  {
    nombre: "Cooperativa Agroproductiva Alto Cauca",
    tipoCliente: "EMPRESA_PRIVADA",
    estado: "CLIENTE_ACTIVO",
    prioridad: "MEDIA",
    tamanoOrg: "Mediana (120 asociados)",
    ubicacion: "Cali, Valle del Cauca",
    canalContactoInicial: "Referido por una organización aliada",
    responsable: "coordinador",
    diasPrimerContacto: -165,
    resumenRelacion: "Cooperativa de pequeños productores interesada en asociatividad y mercados institucionales.",
    riesgosBarreras: "Rotación de la junta directiva cada dos años.",
    prioridadesIdentificadas: "Consolidar un modelo de comercialización asociativa antes de la próxima cosecha.",
  },
  {
    nombre: "Agencia de Desarrollo Local Manizales Futuro",
    tipoCliente: "GOBIERNO_LOCAL",
    estado: "EN_ACERCAMIENTO",
    prioridad: "ALTA",
    tamanoOrg: "Mediana (60 funcionarios)",
    ubicacion: "Manizales, Caldas",
    canalContactoInicial: "Mesa de empleo y emprendimiento",
    responsable: "coordinador",
    diasPrimerContacto: -95,
    resumenRelacion: "Agencia local que busca programas de empleabilidad y formación para población joven.",
    riesgosBarreras: "Los proyectos dependen del plan de desarrollo vigente y de la disponibilidad presupuestal.",
    prioridadesIdentificadas: "Definir un piloto de formación técnica con metas medibles de empleo.",
  },
  {
    nombre: "Instituto Andino de Innovación Productiva",
    tipoCliente: "ALIADO_ACADEMICO",
    estado: "CLIENTE_ACTIVO",
    prioridad: "MEDIA",
    tamanoOrg: "Grande (200 docentes e investigadores)",
    ubicacion: "Bucaramanga, Santander",
    canalContactoInicial: "Convocatoria conjunta de innovación",
    responsable: "admin",
    diasPrimerContacto: -140,
    resumenRelacion: "Aliado académico con laboratorios de diseño y capacidad de formación técnica certificada.",
    riesgosBarreras: "Calendario académico rígido para el inicio de cohortes.",
    prioridadesIdentificadas: "Abrir una escuela de formación técnica en confección con práctica empresarial.",
  },
  {
    nombre: "Agencia de Cooperación Delta Verde",
    tipoCliente: "COOPERANTE_MULTILATERAL",
    estado: "EN_ACERCAMIENTO",
    prioridad: "ALTA",
    tamanoOrg: "Grande",
    ubicacion: "Bogotá D.C.",
    canalContactoInicial: "Invitación a convocatoria cerrada",
    responsable: "gerencia",
    diasPrimerContacto: -75,
    resumenRelacion: "Cooperante con línea de financiación para emprendimientos de mujeres rurales y economía circular.",
    riesgosBarreras: "Exige cofinanciación y reportes trimestrales con indicadores de impacto.",
    prioridadesIdentificadas: "Cerrar el convenio marco antes de la apertura de la siguiente ventana de financiación.",
  },
  {
    nombre: "Grupo Empresarial Hilos del Valle de Aburrá",
    tipoCliente: "EMPRESA_PRIVADA",
    estado: "PROSPECTO",
    prioridad: "MEDIA",
    tamanoOrg: "Pequeña (25 personas)",
    ubicacion: "Medellín, Antioquia",
    canalContactoInicial: "Feria textil regional",
    responsable: "coordinador",
    diasPrimerContacto: -40,
    resumenRelacion: "Agrupación de talleres de confección que explora diagnósticos de capacidad exportadora.",
    riesgosBarreras: "Capacidad financiera limitada para cofinanciar servicios.",
    prioridadesIdentificadas: "Medir capacidad instalada y definir una ruta de formalización.",
  },
]

const CONTACTOS: ContactoDef[] = [
  { cliente: 1, nombre: "Marta Elena Ricaurte", cargo: "Directora ejecutiva", correoLocal: "marta.ricaurte", rolDecision: "DECISOR", notas: "Define las prioridades de cada convenio.", poder: 5, interes: 5, fuerzaRelacion: 3, owner: "gerencia" },
  { cliente: 1, nombre: "Julián Camargo", cargo: "Coordinador de programas", correoLocal: "julian.camargo", rolDecision: "TECNICO", notas: "Punto de contacto operativo semanal.", poder: 3, interes: 5, fuerzaRelacion: 3, owner: "coordinador" },
  { cliente: 2, nombre: "Ofelia Quintero", cargo: "Gerente general", correoLocal: "ofelia.quintero", rolDecision: "DECISOR", notas: "Prefiere reuniones presenciales en la sede de la cooperativa.", poder: 5, interes: 4, fuerzaRelacion: 2, owner: "coordinador" },
  { cliente: 2, nombre: "Hernán Dario Lasso", cargo: "Presidente de la junta", correoLocal: "hernan.lasso", rolDecision: "INFLUENCIADOR", notas: "Aprueba los convenios en asamblea.", poder: 4, interes: 3, fuerzaRelacion: 2, owner: "coordinador" },
  { cliente: 3, nombre: "Sandra Patricia Mejía", cargo: "Directora de empleo", correoLocal: "sandra.mejia", rolDecision: "DECISOR", notas: "Impulsa el piloto de formación para jóvenes.", poder: 4, interes: 5, fuerzaRelacion: 2, owner: "coordinador" },
  { cliente: 4, nombre: "Rodrigo Valbuena", cargo: "Decano de innovación", correoLocal: "rodrigo.valbuena", rolDecision: "DECISOR", notas: "Firma los convenios académicos.", poder: 5, interes: 4, fuerzaRelacion: 3, owner: "admin" },
  { cliente: 4, nombre: "Natalia Ospina", cargo: "Coordinadora de extensión", correoLocal: "natalia.ospina", rolDecision: "TECNICO", notas: "Diseña las cohortes de formación.", poder: 2, interes: 5, fuerzaRelacion: 3, owner: "admin" },
  { cliente: 5, nombre: "Beatriz Arboleda", cargo: "Oficial de programa", correoLocal: "beatriz.arboleda", rolDecision: "INFLUENCIADOR", notas: "Evalúa técnicamente las propuestas.", poder: 3, interes: 4, fuerzaRelacion: 2, owner: "gerencia" },
  { cliente: 5, nombre: "Alonso Gaviria", cargo: "Director de país", correoLocal: "alonso.gaviria", rolDecision: "DECISOR", notas: "Decide la aprobación final del convenio.", poder: 5, interes: 3, fuerzaRelacion: 1, owner: "gerencia" },
  { cliente: 6, nombre: "Luz Adriana Betancur", cargo: "Representante legal", correoLocal: "luz.betancur", rolDecision: "DECISOR", notas: "Lidera la agrupación de talleres.", poder: 4, interes: 4, fuerzaRelacion: 1, owner: "coordinador" },
]

const OPORTUNIDADES: OportunidadDef[] = [
  {
    cliente: 6, nombre: "Observatorio de empleo textil regional", estado: "EN_REVISION", valor: 95_000_000,
    problemaDetectado: "No existe información consolidada sobre empleo y brechas de talento en confección.",
    solucionPropuesta: "Observatorio con levantamiento de datos, tablero de indicadores y boletines semestrales.",
    serviciosInteres: "Diagnóstico, analítica, comunicación de resultados.",
    diasUltimaGestion: 3, diasEnvioPropuesta: 12,
  },
  {
    cliente: 6, nombre: "Diagnóstico de capacidades exportadoras", estado: "DISENANDO_PROPUESTA", valor: 38_000_000,
    problemaDetectado: "Los talleres no conocen los requisitos para vender a mercados internacionales.",
    solucionPropuesta: "Diagnóstico de capacidad instalada y hoja de ruta de formalización y certificación.",
    serviciosInteres: "Consultoría, formación.",
    diasUltimaGestion: 2, diasEnvioPropuesta: null,
  },
  {
    cliente: 3, nombre: "Plan de formación para cuidadoras y emprendedoras", estado: "DISENANDO_PROPUESTA", valor: 72_000_000,
    problemaDetectado: "Mujeres cuidadoras sin acceso a formación para generar ingresos propios.",
    solucionPropuesta: "Ruta de formación flexible con acompañamiento a ideas de negocio.",
    serviciosInteres: "Formación, acompañamiento, seguimiento.",
    diasUltimaGestion: 1, diasEnvioPropuesta: null,
  },
  {
    cliente: 4, nombre: "Laboratorio de diseño y moda sostenible", estado: "PRESENTADA", valor: 135_000_000,
    problemaDetectado: "Las confeccionistas carecen de acceso a diseño y prototipado con materiales sostenibles.",
    solucionPropuesta: "Laboratorio compartido con asesoría de diseño y pruebas de producto.",
    serviciosInteres: "Diseño, prototipado, formación técnica.",
    diasUltimaGestion: 5, diasEnvioPropuesta: 9,
  },
  {
    cliente: 5, nombre: "Convenio de acompañamiento a cooperativas de mujeres", estado: "EN_NEGOCIACION", valor: 230_000_000,
    problemaDetectado: "Cooperativas de mujeres rurales sin capacidad de gestión para acceder a financiación.",
    solucionPropuesta: "Acompañamiento a 12 cooperativas en gestión, finanzas y monitoreo de resultados.",
    serviciosInteres: "Acompañamiento, formación, monitoreo y evaluación.",
    diasUltimaGestion: 2, diasEnvioPropuesta: 30,
  },
  {
    cliente: 1, nombre: "Ampliación del programa de dotación productiva", estado: "EN_NEGOCIACION", valor: 160_000_000,
    problemaDetectado: "Unidades productivas con maquinaria obsoleta que limita su volumen de producción.",
    solucionPropuesta: "Dotación de equipos y capacitación en uso, mantenimiento y control de calidad.",
    serviciosInteres: "Dotación, formación, seguimiento.",
    diasUltimaGestion: 4, diasEnvioPropuesta: 21,
  },
  {
    cliente: 1, nombre: "Fortalecimiento de unidades productivas textiles del Caribe", estado: "GANADA", valor: 185_000_000,
    problemaDetectado: "Unidades productivas informales con baja productividad y sin acceso a mercados.",
    solucionPropuesta: "Ruta de fortalecimiento: caracterización, formación, acompañamiento técnico y dotación.",
    serviciosInteres: "Caracterización, formación, acompañamiento técnico, dotación.",
    diasUltimaGestion: 6, diasEnvioPropuesta: 45,
  },
  {
    cliente: 2, nombre: "Programa de asociatividad y comercialización agroproductiva", estado: "GANADA", valor: 120_000_000,
    problemaDetectado: "Productores que venden por separado y pierden poder de negociación.",
    solucionPropuesta: "Fortalecimiento de la cooperativa y acceso a compras públicas e institucionales.",
    serviciosInteres: "Asociatividad, comercialización, formación empresarial.",
    diasUltimaGestion: 8, diasEnvioPropuesta: 38,
  },
  {
    cliente: 4, nombre: "Escuela de formación técnica en confección", estado: "GANADA", valor: 210_000_000,
    problemaDetectado: "Escasez de operarios certificados y desajuste entre formación y demanda empresarial.",
    solucionPropuesta: "Escuela con tres cohortes de formación técnica y práctica en empresas aliadas.",
    serviciosInteres: "Formación técnica, certificación, intermediación laboral.",
    diasUltimaGestion: 10, diasEnvioPropuesta: 60,
  },
  {
    cliente: 5, nombre: "Diagnóstico de cadena de valor de economía circular", estado: "GANADA", valor: 48_000_000,
    problemaDetectado: "Residuos textiles sin trazabilidad ni aprovechamiento comercial.",
    solucionPropuesta: "Diagnóstico de la cadena de valor y portafolio de proyectos de aprovechamiento.",
    serviciosInteres: "Diagnóstico, estructuración de proyectos.",
    diasUltimaGestion: 7, diasEnvioPropuesta: 33,
  },
  {
    cliente: 2, nombre: "Plataforma de compras asociativas", estado: "PERDIDA", valor: 55_000_000,
    problemaDetectado: "Compra de insumos sin economías de escala.",
    solucionPropuesta: "Plataforma digital de compras conjuntas para los asociados.",
    serviciosInteres: "Tecnología, formación en gestión de compras.",
    diasUltimaGestion: 25, diasEnvioPropuesta: 70,
  },
  {
    cliente: 3, nombre: "Centro de acopio y transformación", estado: "STANDBY", valor: 175_000_000,
    problemaDetectado: "Sin infraestructura local para acopiar y transformar la producción de emprendedores.",
    solucionPropuesta: "Estudio de factibilidad y diseño de un centro de acopio compartido.",
    serviciosInteres: "Estudios de factibilidad, diseño de modelo operativo.",
    diasUltimaGestion: 35, diasEnvioPropuesta: 80,
  },
]

const INTERACCIONES: InteraccionDef[] = [
  { cliente: 1, tipo: "REUNION", autor: "gerencia", diasAtras: 52, texto: "Reunión de cierre del convenio anterior: balance de resultados y lecciones aprendidas.", proximoPaso: "Enviar propuesta de la ruta de fortalecimiento.", oportunidad: 7 },
  { cliente: 1, tipo: "LLAMADA", autor: "coordinador", diasAtras: 18, texto: "Llamada de seguimiento: la fundación confirmó la adjudicación de recursos para la nueva ruta.", proximoPaso: "Programar la convocatoria de unidades productivas.", oportunidad: 7 },
  { cliente: 1, tipo: "CORREO", autor: "gerencia", diasAtras: 6, texto: "Se envió la propuesta ajustada para la ampliación de dotación productiva.", proximoPaso: "Agendar mesa de negociación con la directora.", oportunidad: 6 },
  { cliente: 2, tipo: "VISITA", autor: "coordinador", diasAtras: 40, texto: "Visita a la sede de la cooperativa y a dos fincas asociadas para entender el proceso productivo.", proximoPaso: "Redactar propuesta de asociatividad y comercialización.", oportunidad: 8 },
  { cliente: 2, tipo: "REUNION", autor: "coordinador", diasAtras: 14, texto: "Presentación de resultados a la junta; se aprobó el programa de asociatividad.", proximoPaso: "Firmar el convenio y definir el cronograma de arranque.", oportunidad: 8 },
  { cliente: 2, tipo: "CORREO", autor: "admin", diasAtras: 3, texto: "Se envió el borrador del convenio y la lista de documentos de la cooperativa.", proximoPaso: null },
  { cliente: 3, tipo: "REUNION", autor: "coordinador", diasAtras: 30, texto: "Mesa de trabajo con la dirección de empleo: se priorizó un piloto para jóvenes.", proximoPaso: "Construir la propuesta del plan de formación.", oportunidad: 3 },
  { cliente: 3, tipo: "LLAMADA", autor: "coordinador", diasAtras: 9, texto: "La agencia pidió pausar el centro de acopio hasta el próximo presupuesto.", proximoPaso: "Retomar la conversación en el primer trimestre.", oportunidad: 12 },
  { cliente: 3, tipo: "CORREO", autor: "gerencia", diasAtras: 2, texto: "Se compartió el esquema preliminar del plan de formación para comentarios.", proximoPaso: "Recoger observaciones antes de la próxima mesa." },
  { cliente: 4, tipo: "REUNION", autor: "admin", diasAtras: 58, texto: "Sesión con el decanato para definir el alcance de la escuela de formación técnica.", proximoPaso: "Entregar presupuesto detallado por cohorte.", oportunidad: 9 },
  { cliente: 4, tipo: "VISITA", autor: "admin", diasAtras: 25, texto: "Recorrido por los talleres y laboratorios del instituto con el equipo técnico.", proximoPaso: "Validar la capacidad de prototipado para el laboratorio.", oportunidad: 4 },
  { cliente: 4, tipo: "LLAMADA", autor: "coordinador", diasAtras: 4, texto: "El instituto confirmó la aprobación de la escuela de formación en su consejo directivo.", proximoPaso: "Preparar la conversión a proyecto y el cronograma.", oportunidad: 9 },
  { cliente: 5, tipo: "REUNION", autor: "gerencia", diasAtras: 32, texto: "Primera reunión técnica con la oficial de programa sobre el convenio de cooperativas.", proximoPaso: "Remitir matriz de resultados e indicadores.", oportunidad: 5 },
  { cliente: 5, tipo: "CORREO", autor: "gerencia", diasAtras: 11, texto: "Respuesta a las observaciones sobre cofinanciación y reportes trimestrales.", proximoPaso: "Esperar decisión del comité del cooperante.", oportunidad: 5 },
  { cliente: 5, tipo: "LLAMADA", autor: "gerencia", diasAtras: 5, texto: "El cooperante aprobó el diagnóstico de economía circular como primer entregable.", proximoPaso: "Convertir la oportunidad en proyecto y definir equipo.", oportunidad: 10 },
  { cliente: 6, tipo: "VISITA", autor: "coordinador", diasAtras: 38, texto: "Visita a dos talleres en Medellín durante la feria textil regional.", proximoPaso: "Enviar presentación de servicios." },
  { cliente: 6, tipo: "REUNION", autor: "coordinador", diasAtras: 15, texto: "Reunión virtual con la representante legal sobre el observatorio de empleo textil.", proximoPaso: "Elaborar propuesta del observatorio.", oportunidad: 1 },
  { cliente: 6, tipo: "CORREO", autor: "coordinador", diasAtras: 1, texto: "Se solicitó información de capacidad instalada para el diagnóstico exportador.", proximoPaso: "Recibir formulario diligenciado.", oportunidad: 2 },
]

/** Pure: the whole fictitious dataset, ids assigned from the declaration order. */
export function buildDemoFlujoData(): DemoFlujoData {
  const clientes: DemoCliente[] = CLIENTES.map((c, i) => ({ id: demoId("cliente", i + 1), ...c }))
  const clienteId = (n: number): string => clientes[n - 1].id

  const contactos: DemoContacto[] = CONTACTOS.map(({ cliente, correoLocal, ...c }, i) => ({
    id: demoId("contacto", i + 1),
    clienteId: clienteId(cliente),
    correo: `${correoLocal}@${DEMO_EMAIL_DOMAIN}`,
    telefono: `+57 300 555 ${String(1000 + i * 37).slice(-4)}`,
    ...c,
  }))

  const oportunidades: DemoOportunidad[] = OPORTUNIDADES.map(({ cliente, ...o }, i) => ({
    id: demoId("oportunidad", i + 1),
    clienteId: clienteId(cliente),
    fase: "PROSPECCION",
    diasAdjudicacion: null,
    ...o,
  }))

  const interacciones: DemoInteraccion[] = INTERACCIONES.map(({ cliente, oportunidad, ...x }, i) => ({
    id: demoId("interaccion", i + 1),
    clienteId: clienteId(cliente),
    oportunidadId: oportunidad ? oportunidades[oportunidad - 1].id : null,
    ...x,
  }))

  return { clientes, contactos, oportunidades, interacciones }
}

const TODOS_LOS_ESTADOS: readonly EstadoOportunidad[] = [
  "EN_REVISION",
  "DISENANDO_PROPUESTA",
  "PRESENTADA",
  "EN_NEGOCIACION",
  "GANADA",
  "PERDIDA",
  "STANDBY",
]

function duplicados(valores: readonly string[]): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const v of valores) (vistos.has(v) ? repetidos : vistos).add(v)
  return [...repetidos]
}

/** Returns the problems found in the dataset; an empty list means it is safe to write. */
export function checkDemoFlujoData(data: DemoFlujoData): string[] {
  const problemas: string[] = []
  const clientes = new Set(data.clientes.map((c) => c.id))

  const ids = [...data.clientes, ...data.contactos, ...data.oportunidades, ...data.interacciones].map((x) => x.id)
  for (const id of ids) if (!id.startsWith(MARKER_ID_PREFIX)) problemas.push(`id ${id} is outside the marker namespace`)
  for (const d of duplicados(ids)) problemas.push(`duplicate id ${d}`)
  for (const d of duplicados([...data.clientes, ...data.oportunidades].map((x) => x.nombre))) problemas.push(`duplicate name "${d}"`)

  for (const c of data.contactos) if (!clientes.has(c.clienteId)) problemas.push(`contacto "${c.nombre}" points to an unknown client`)
  for (const o of data.oportunidades) if (!clientes.has(o.clienteId)) problemas.push(`oportunidad "${o.nombre}" points to an unknown client`)

  const porId = new Map(data.oportunidades.map((o) => [o.id, o]))
  for (const i of data.interacciones) {
    if (!clientes.has(i.clienteId)) problemas.push(`interaccion ${i.id} points to an unknown client`)
    if (i.oportunidadId !== null && porId.get(i.oportunidadId)?.clienteId !== i.clienteId) {
      problemas.push(`interaccion ${i.id} points to an opportunity of another client`)
    }
  }

  for (const estado of TODOS_LOS_ESTADOS) {
    if (!data.oportunidades.some((o) => o.estado === estado)) problemas.push(`no opportunity in state ${estado}`)
  }
  const libres = data.oportunidades.filter((o) => o.estado === "GANADA")
  if (libres.length !== FREE_GANADA_COUNT) problemas.push(`expected ${FREE_GANADA_COUNT} free GANADA opportunities, found ${libres.length}`)
  for (const o of libres) {
    if (o.valor < 40_000_000 || o.valor > 250_000_000) problemas.push(`GANADA "${o.nombre}" is outside 40M-250M COP`)
    if (o.diasAdjudicacion !== null) problemas.push(`GANADA "${o.nombre}" must stay unconverted (no adjudication date)`)
  }
  for (const o of data.oportunidades) {
    if (o.estado === "DISENANDO_PROPUESTA" && o.diasEnvioPropuesta !== null) problemas.push(`"${o.nombre}" has a sent date while the proposal is being designed`)
    if (["PRESENTADA", "EN_REVISION", "EN_NEGOCIACION", "GANADA", "PERDIDA"].includes(o.estado) && o.diasEnvioPropuesta === null) {
      problemas.push(`"${o.nombre}" (${o.estado}) needs a proposal sent date`)
    }
  }
  return problemas
}

export type ExistingIds = {
  clientes: Set<string>
  contactos: Set<string>
  oportunidades: Set<string>
  interacciones: Set<string>
}

export type FlujoDecision = "seed" | "top-up" | "already-seeded"

export type DemoFlujoPlan = DemoFlujoData & { decision: FlujoDecision }

/** Pure: keeps only the rows whose id does not exist yet. Nothing is ever updated. */
export function planDemoFlujo(data: DemoFlujoData, existing: ExistingIds): DemoFlujoPlan {
  const plan = {
    clientes: data.clientes.filter((x) => !existing.clientes.has(x.id)),
    contactos: data.contactos.filter((x) => !existing.contactos.has(x.id)),
    oportunidades: data.oportunidades.filter((x) => !existing.oportunidades.has(x.id)),
    interacciones: data.interacciones.filter((x) => !existing.interacciones.has(x.id)),
  }
  const pendientes = plan.clientes.length + plan.contactos.length + plan.oportunidades.length + plan.interacciones.length
  const total = data.clientes.length + data.contactos.length + data.oportunidades.length + data.interacciones.length
  const decision: FlujoDecision = pendientes === 0 ? "already-seeded" : pendientes === total ? "seed" : "top-up"
  return { ...plan, decision }
}

// ---------------------------------------------------------------------------
// Runner: read-only unless --apply
// ---------------------------------------------------------------------------

type Printer = (line: string) => void

export type FlujoWriter = (client: DemoFlujoClient, plan: DemoFlujoPlan) => Promise<{ lines: string[] }>

export type FlujoRunResult = { mode: SeedMode | "already-seeded" }

async function idsExistentes(
  finder: { findMany: (args: { where: { id: { in: string[] } }; select: { id: true } }) => Promise<{ id: string }[]> },
  ids: string[],
): Promise<Set<string>> {
  const rows = await finder.findMany({ where: { id: { in: ids } }, select: { id: true } })
  return new Set(rows.map((r) => r.id))
}

async function leerExistentes(client: DemoFlujoClient, data: DemoFlujoData): Promise<ExistingIds> {
  return {
    clientes: await idsExistentes(client.cliente, data.clientes.map((x) => x.id)),
    contactos: await idsExistentes(client.contacto, data.contactos.map((x) => x.id)),
    oportunidades: await idsExistentes(client.oportunidad, data.oportunidades.map((x) => x.id)),
    interacciones: await idsExistentes(client.bitacoraEntrada, data.interacciones.map((x) => x.id)),
  }
}

const cop = (valor: number): string => `$${valor.toLocaleString("es-CO")} COP`

function describirPlan(plan: DemoFlujoPlan, data: DemoFlujoData, print: Printer): void {
  print(
    `Creates: ${plan.clientes.length} clientes, ${plan.contactos.length} contactos, ` +
      `${plan.oportunidades.length} oportunidades, ${plan.interacciones.length} interacciones.`,
  )
  const porEstado = new Map<string, number>()
  for (const o of plan.oportunidades) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1)
  print(`Opportunities by state: ${[...porEstado].map(([e, n]) => `${e}=${n}`).join(", ")}`)
  print(`Free GANADA opportunities (ready for "Convertir en proyecto"):`)
  const nombreCliente = new Map(data.clientes.map((c) => [c.id, c.nombre]))
  for (const o of data.oportunidades.filter((x) => x.estado === "GANADA")) {
    print(`  - ${o.nombre} | ${nombreCliente.get(o.clienteId)} | ${cop(o.valor)}`)
  }
}

export async function runSeedDemoFlujo(
  client: DemoFlujoClient,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
  writer: FlujoWriter = applyDemoFlujo,
): Promise<FlujoRunResult> {
  const mode = parseSeedArgs(argv)
  if (mode === "help") {
    for (const line of USAGE) print(line)
    return { mode }
  }

  assertLocalTarget(process.env.DATABASE_URL)
  const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
  print(`${mode === "apply" ? "Demo flow seed — apply" : "Demo flow seed — dry run (no writes)"}  (db host: ${host})`)

  const data = buildDemoFlujoData()
  const problemas = checkDemoFlujoData(data)
  if (problemas.length > 0) throw new Error(`The seed data is inconsistent: ${problemas.join("; ")}`)

  const plan = planDemoFlujo(data, await leerExistentes(client, data))
  if (plan.decision === "already-seeded") {
    print("Demo flow data already seeded. Nothing was changed.")
    return { mode: "already-seeded" }
  }
  if (plan.decision === "top-up") print("A previous run was incomplete: only the missing rows are created.")
  describirPlan(plan, data, print)

  if (mode === "dry-run") {
    print("Dry run: nothing was written. Re-run with --apply to write.")
    return { mode }
  }

  const { lines } = await writer(client, plan)
  for (const line of lines) print(line)
  return { mode }
}

// ---------------------------------------------------------------------------
// Writer (real database)
// ---------------------------------------------------------------------------

/** UTC midnight of the calendar day `days` from now (same rule as prisma/seed.ts `calendarDayFromNow`). */
function calendarDayFromNow(days: number): Date {
  const local = new Date()
  local.setDate(local.getDate() + days)
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
}

/** A real instant `days` ago, at a fixed working hour so the bitácora order is stable. */
function instantDaysAgo(days: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d
}

async function cargarResponsables(client: DemoFlujoClient): Promise<Record<ResponsableKey, string>> {
  const ids = {} as Record<ResponsableKey, string>
  for (const key of Object.keys(RESPONSABLE_EMAIL) as ResponsableKey[]) {
    const email = RESPONSABLE_EMAIL[key]
    const usuario = await client.usuario.findFirst({ where: { email, activo: true }, select: { id: true } })
    if (!usuario) throw new Error(`Demo user ${email} not found: run "npm run db:seed:local" first.`)
    ids[key] = usuario.id
  }
  return ids
}

export async function applyDemoFlujo(client: DemoFlujoClient, plan: DemoFlujoPlan): Promise<{ lines: string[] }> {
  const usuarios = await cargarResponsables(client)

  await client.$transaction(
    async (tx) => {
      for (const c of plan.clientes) {
        await tx.cliente.create({
          data: {
            id: c.id,
            nombre: c.nombre,
            tipo_cliente: c.tipoCliente,
            estado: c.estado,
            prioridad: c.prioridad,
            tamano_org: c.tamanoOrg,
            ubicacion: c.ubicacion,
            canal_contacto_inicial: c.canalContactoInicial,
            fecha_primer_contacto: calendarDayFromNow(c.diasPrimerContacto),
            responsable_id: usuarios[c.responsable],
            resumen_relacion: c.resumenRelacion,
            riesgos_barreras: c.riesgosBarreras,
            prioridades_identificadas: c.prioridadesIdentificadas,
          },
        })
      }
      for (const c of plan.contactos) {
        await tx.contacto.create({
          data: {
            id: c.id,
            cliente_id: c.clienteId,
            nombre: c.nombre,
            cargo: c.cargo,
            correo: c.correo,
            telefono: c.telefono,
            rol_decision: c.rolDecision,
            notas: c.notas,
            poder: c.poder,
            interes: c.interes,
            fuerza_relacion: c.fuerzaRelacion,
            owner_id: usuarios[c.owner],
          },
        })
      }
      for (const o of plan.oportunidades) {
        await tx.oportunidad.create({
          data: {
            id: o.id,
            cliente_id: o.clienteId,
            nombre: o.nombre,
            problema_detectado: o.problemaDetectado,
            solucion_propuesta: o.solucionPropuesta,
            servicios_interes: o.serviciosInteres,
            valor_estimado_cop: o.valor,
            estado: o.estado,
            fase: o.fase,
            fecha_ultima_gestion: calendarDayFromNow(-o.diasUltimaGestion),
            fecha_envio_propuesta: o.diasEnvioPropuesta === null ? null : calendarDayFromNow(-o.diasEnvioPropuesta),
          },
        })
      }
      for (const [i, x] of plan.interacciones.entries()) {
        await tx.bitacoraEntrada.create({
          data: {
            id: x.id,
            cliente_id: x.clienteId,
            oportunidad_id: x.oportunidadId,
            autor_id: usuarios[x.autor],
            tipo: x.tipo,
            texto: x.texto,
            proximo_paso: x.proximoPaso,
            created_at: instantDaysAgo(x.diasAtras, 9 + (i % 8)),
          },
        })
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )

  return {
    lines: [
      `  ${plan.clientes.length} clientes, ${plan.contactos.length} contactos, ${plan.oportunidades.length} oportunidades, ` +
        `${plan.interacciones.length} interacciones created.`,
      `  ${plan.oportunidades.filter((o) => o.estado === "GANADA").length} GANADA opportunities left free for "Convertir en proyecto".`,
    ],
  }
}

async function main(): Promise<void> {
  await runSeedDemoFlujo(db)
}

// Only run when invoked as a script: a test imports this module and must not
// query a database as an import side effect.
const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/seed-demo-flujo.ts")

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
