# Management Dashboard Specification

> New capability — quinta cara del tablero (`Tablero de Control Gerencial`): seis KPIs sobre un único endpoint agregado (D9), renderizados con primitivas SVG propias (D7), imprimibles vía `/print/dashboard/{cara}`. Rendimiento tratado como presupuesto medido, no bloqueante (RNF-02, D9). No existe `openspec/specs/management-dashboard/spec.md` todavía — este delta siembra el spec completo al archivar.

## Requirements

### Requirement: Avance Técnico (%)

The system MUST expose `avance_tecnico` per `Proyecto` as defined in `project-schedule` (weighted average of activity progress), rendered as tacómetro/barra de progreso.

- **Valor coincide exactamente con el cálculo de `project-schedule`** — `dashboard/route.test.ts`

### Requirement: Avance Financiero (%)

The system MUST expose `avance_financiero` as `ejecutado_total_cop / proyectado_total_cop` across all rubros of the project, rendered as curva S.

#### Scenario: Cálculo agregado
- GIVEN un proyecto con proyectado total 100.000.000 COP y ejecutado total 60.000.000 COP
- WHEN se calcula avance_financiero
- THEN el resultado es 60%

### Requirement: Cumplimiento de Indicadores (%)

The system MUST expose `cumplimiento_indicadores` as the percentage of `Indicador` records whose `valor_actual` meets or exceeds `meta_valor`, rendered as radar.

- **Indicador sin `valor_actual` registrado no cuenta como cumplido** — `dashboard/route.test.ts`

### Requirement: Cumplimiento de Cronograma (%)

The system MUST expose `cumplimiento_cronograma` as activities completed on time (`fecha_real <= fecha_planificada`) over total scheduled in the period.

- **Actividad sin `fecha_real` aún no cuenta como cumplida ni como incumplida hasta que se resuelva** — `dashboard/route.test.ts`

### Requirement: Productos Entregados / Programados

The system MUST expose an absolute count of `Actividad` finalizadas con soporte (per `project-attachments`) vs. total pactado, rendered as a comparative bar chart.

- **Actividad finalizada sin soporte no cuenta como "entregada"** — `dashboard/route.test.ts`

### Requirement: Beneficiarios Atendidos / Meta — D6

The system MUST expose `beneficiarios_meta` (stored on `Proyecto`) against a derived `beneficiarios_atendidos` count sourced from `Indicador` measurements — MUST NOT require a nominal beneficiary registry with personal data.

- **`beneficiarios_atendidos` se deriva de mediciones de Indicador existentes, nunca de una tabla de personas** — `dashboard/route.test.ts`

### Requirement: Un único endpoint agregado — D9

The dashboard's fifth face MUST resolve from exactly one aggregated endpoint (no N+1 per-KPI calls), using SQL-level aggregation (`groupBy`) and indexes on `(proyecto_id)`, `(deleted_at)` and cronograma date keys.

- **Un solo round-trip HTTP resuelve los seis KPIs** — `dashboard/route.test.ts`

### Requirement: Primitivas SVG propias — D7

Gauge, CurvaS and Radar visualizations MUST be implemented as custom in-house SVG components (same house style as `sparkline.tsx`/`BarRow`) — MUST NOT introduce a new charting library dependency. They MUST render deterministically for `/print/dashboard/{cara}`.

- **Render en modo impresión no depende de medición del DOM en tiempo de ejecución** — print/dashboard smoke test

### Requirement: Integración en el shell existente

The fifth face MUST reuse the existing `DashboardTabs` shell and the `CARAS` array convention, and MUST be reachable at `/print/dashboard/{cara}` like the other four faces.

- **Quinta cara aparece en `CARAS` y responde en la ruta de impresión** — dashboard shell smoke test

### Requirement: Rendimiento — presupuesto medido, no bloqueante — RNF-02, D9

Response time of the aggregated dashboard endpoint SHOULD be under 3 seconds p95 against a seeded reference dataset (~50 proyectos × 20 metas × 200 actividades). This is a measured engineering budget, not a blocking acceptance gate — the absence of a documented SLA in the repository MUST NOT be treated as license to skip measurement; p95 MUST be measured and reported against the 3s target.

- **p95 medido y reportado contra el objetivo de 3s en el dataset de referencia** — perf smoke test / manual report

### Requirement: Usabilidad y accesibilidad de las vistas gerenciales — RNF-01

The dashboard views MUST be usable by both field execution teams and directive/office users without role-specific UI forks — same interface, permission-gated content, per the "Interfaz intuitiva y adaptada para equipos de ejecución en campo y oficinas directivas" requirement.

- **Vista se adapta sin requerir modo de UI separado por rol** — dashboard UI smoke test
