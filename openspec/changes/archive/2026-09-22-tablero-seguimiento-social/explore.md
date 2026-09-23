# Exploration: Tablero de Seguimiento y Gestión de Proyectos de Impacto Social

## Current State

Fully greenfield relative to `prisma/schema.prisma` (496 lines, read in full): no `Proyecto`, `Presupuesto`, `Rubro`, `Meta`, `Cronograma`, `Indicador`, or `Beneficiario` model/enum exists on any branch. The closest thing to "the Tablero" today is the existing Kanban `Tarea` model plus the just-shipped `Oportunidad.fase` (`PROSPECCION`|`EJECUCION`) from the immediately-prior SDD change `oportunidades-comerciales` (PRs #44-46, merged).

**Critical precedent — this exact module was already discussed and explicitly deferred.** The `oportunidades-comerciales` design (engram #519/#521) recorded decision D2: *"NO crear entidad Proyecto... Copiar a una entidad nueva rompe la cadena de trazabilidad... Tradeoff: se difiere el Proyecto formal (presupuesto, cronograma, impacto social)."* That deferred item is precisely this module. The convert endpoint was built knowing a real `Proyecto` entity would come later — this exploration is that "later."

`src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.ts` (69 lines, read in full):
- Lines 40-51: loads the `Oportunidad`, requires `estado === "GANADA"`, requires `fase !== "EJECUCION"` (409 if already converted — idempotency guard).
- Lines 53-57: writes ONLY `fase: "EJECUCION"` + `fecha_adjudicacion: new Date()` on the single `Oportunidad` row. Zero writes to `tareas` or any other table.
- Lines 59-65: audits via `logAudit({ entidad: "oportunidad", accion: "convertir", ... })`.
- Design doc D7 (assumption, not yet contradicted): `fase = EJECUCION` is treated as **terminal** — `PATCH estado` after conversion returns 409.
- Verify-report (engram #530): this endpoint is shipped and tested, `pass_with_warnings`, 11/11 requirements/scenarios green. Any change to it carries live-code regression risk.

Roles (`RolUsuario` enum, schema.prisma:15-20): `ADMINISTRADOR, GERENCIA, COORDINADOR, COLABORADOR`. Confirmed via two DIFFERENT permission axes, not one:
- `src/lib/permissions.ts` `MANAGE_ANY_ROLES` (write authority over others' records) = `ADMINISTRADOR, GERENCIA, COORDINADOR`.
- `src/lib/api/crm.ts` `FULL_ACCESS_ROLES` (read-scope: whether you see org-wide records or only your own `responsable_id` rows) = `ADMINISTRADOR, GERENCIA` only — **COORDINADOR is NOT in this list**, meaning a COORDINADOR can write/manage records they're scoped to see, but is read-scoped like a COLABORADOR for records outside that scope.
- Net result: **no role in the app today is purely read-only**. `GERENCIA` has both full read AND full write authority — it is not a "Directivo visualizador" analog. This confirms the doc's 3-role model (Administrador / Gestor-Ejecutor / Visualizador-Directivo) does NOT map 1:1 onto the app's 4 roles, and a genuine read-only "Visualizador" concept does not exist anywhere in the codebase today.
- **Directly relevant precedent**: when `oportunidades-comerciales` needed a new cross-cutting access axis, the owner explicitly REJECTED a new role and instead added `Usuario.gestiona_oportunidades Boolean @default(false)` (schema.prisma:111) as an orthogonal flag, composed via `hasCommercialAccess(actor) = canManageAny(rol) || actor.gestiona_oportunidades` (`permissions.ts:52-54`). Stated rationale (engram #519 D3): *"`rol` es enum de valor único; un eje comercial ahí fuerza un o-esto-o-lo-otro falso."* This same rationale applies verbatim to the "Visualizador" question — the propose phase should weigh a similar orthogonal read-only flag (e.g. a `puede_ver_tablero_gerencial`-shaped boolean) against introducing a genuine 5th `RolUsuario` value, using the prior owner-confirmed reasoning as direct precedent for consistency.

Attachment/storage pattern (`src/lib/api/files.ts`, 77 lines, read in full; `Documento`/`DocumentoVersion`/`DocumentoCliente`/`AdjuntoTarea` models, schema.prisma:301-396):
- `STORAGE_BUCKET` (`SUPABASE_STORAGE_BUCKET`, default `"muttu-docs"`), `MAX_FILE_BYTES` (10MB), `ALLOWED_FILE_EXTENSIONS`/`ALLOWED_FILE_MIME` (pdf/docx/xlsx/pptx/jpg/png), `sanitizeFileName`, `documentStoragePath(clienteId, documentoId, versionNumber, originalName)` → `documentos/{clienteId|"general"}/{documentoId}/v{n}_{name}`.
- `AdjuntoTarea` (schema.prisma:377-396) shows the established "mirror" shape: a lightweight per-parent-entity attachment row (`tarea_id`, `storage_path`, `nombre`, `tamano_bytes`) with an OPTIONAL `documento_id` mirror into the central `Documento` repository (nullable, no cascade — "mirror fails, attachment itself never depends on it").
- **Gap found**: nothing in the current attachment model supports "a URL instead of a file." `storage_path` always assumes an actually-uploaded object. RF-04 explicitly requires "adjuntar documentos O ingresar enlaces externos (URLs de Google Drive)" — this needs a new nullable `url_externa`-shaped column (mutually exclusive-ish with `storage_path`) that has no precedent in the existing schema. Not a blocker, just confirmed net-new.

Dashboard/KPI infra (`src/components/dashboard/*`, package.json checked): **no chart library dependency exists** — no recharts/chart.js/victory/visx/d3 in `package.json`. All visuals are hand-rolled:
- `sparkline.tsx` (65 lines): raw inline SVG polyline, no deps.
- `shared.tsx`: `BarRow` (horizontal bar via CSS width%), `StatTile` (KPI card), `CardSection` (panel wrapper) — all CSS/SVG, no deps.
- `dashboard-page.tsx` (`DashboardTabs`, 180 lines): 4-tab shell ("caras") + sticky shared filter bar + a `/print/dashboard/{cara}` printable-PDF-per-tab convention (`print-dashboard.tsx`) — directly reusable shell pattern for a 5th "Tablero de Control Gerencial" tab.
- **Gap found**: RF 3.4 asks for a gauge/tacómetro, a "curva S" (S-curve line), and a radar chart. NONE of these chart types have any existing analog (Sparkline is a plain line, BarRow is a plain bar). This is a genuine build-vs-adopt-a-library decision the current codebase gives zero precedent for either way.

Data-modeling conventions confirmed from `Oportunidad`/`Cliente` (schema.prisma):
- Soft delete via nullable `deleted_at DateTime?` everywhere on business entities (Cliente, Contacto, Oportunidad, Tarea, Documento, Carpeta) — never physical delete.
- Money: `valor_estimado_cop Decimal? @db.Decimal(15, 2)` — the field name itself hard-codes COP; no multi-currency precedent exists anywhere in the schema.
- Enum vs. free-string catalog: closed, business-meaningful lists are native Prisma enums (`EstadoCliente`, `TipoCliente`, `EstadoOportunidad`, etc.). Exactly one catalog-like field is deliberately a free string instead of an enum: `Documento.categoria` (schema.prisma:304, comment: *"String libre — configurable desde admin sin tocar código"*). This maps directly onto the PRD's two different catalog shapes: "Línea estratégica" is a closed, named list (Empleabilidad, Emprendimiento, Productividad, Cultural, Social, Cívico-político, Metodo Muttu, Ambiental — 8 items) → reads like a Prisma enum. "Rubros" (Personal, Transporte, Material POP, Oper Logística, **"etc."**) → doc explicitly leaves it open-ended/admin-configurable → reads like the `Documento.categoria` free-string-catalog pattern, not an enum.
- Composite-FK-with-invariant pattern: `Oportunidad` carries `@@unique([id, cliente_id])` (schema.prisma:205) purely so `Tarea`/`BitacoraEntrada` can hold a Prisma-native composite relation `(oportunidad_id, cliente_id) → (id, cliente_id)` that makes it DB-impossible for a task to reference an opportunity belonging to a different client (see design doc D1/D2, a hand-written Postgres `CHECK` closes the MATCH SIMPLE hole FKs alone don't cover). This exact pattern generalizes directly to any `Actividad`/`Meta` that must stay consistent with both a `Proyecto` and (optionally) a `Cliente`.
- Audit: `AuditEntidad`/`AuditAccion` (`src/lib/api/audit.ts:29-30`) are open string unions already widened once for `"oportunidad"`/`"convertir"` — trivially extends to `"proyecto"`, `"presupuesto"`, etc.

No generic role-based route middleware exists; every route composes small predicate functions from `permissions.ts` directly (`canManageAny`, `canEditClient`, `hasCommercialAccess`, `canManageOpportunity`). Any new module's RBAC should follow this exact compositional style, not introduce a new mechanism.

## Affected Areas (if this module is built)

- `prisma/schema.prisma` — net-new models: `Proyecto`, `Actividad`(?), `Meta`, `Indicador`, `Presupuesto`/rubro line items, `Beneficiario`(?), plus a possible `AdjuntoActividad`/`SoporteGasto` mirroring `AdjuntoTarea`.
- `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.ts` — the literal integration point IF conversion is decided to create a `Proyecto` transactionally (see Approaches). Currently 69 lines, tested, shipped.
- `src/lib/permissions.ts` / `src/lib/api/crm.ts` — new predicates for project visibility/edit, following `hasCommercialAccess`/`canManageOpportunity` shape.
- `src/lib/api/files.ts` — likely extended (not replaced) for RF-04/RF-06 attachments, plus a net-new external-URL field with no precedent.
- `src/components/dashboard/*` — a 5th "cara" (`CARAS` array in `dashboard-page.tsx:46-51`) for the Tablero de Control Gerencial; new gauge/S-curve/radar chart primitives with zero precedent in the codebase.
- `src/lib/api/audit.ts` — widen `AuditEntidad`/`AuditAccion` unions (trivial, same shape as the prior `"oportunidad"`/`"convertir"` addition).

## Approaches (Proyecto ↔ Oportunidad/Cliente relationship — the central fork)

1. **Decoupled: Proyecto is Administrador-created directly, no auto-link from convert** — `Proyecto.cliente_id` required FK (mirrors `Oportunidad`'s own shape), `Proyecto.oportunidad_id` nullable/optional traceability FK, NOT auto-populated by the convert endpoint.
   - Pros: zero regression risk to the already-shipped, tested convert endpoint (11/11 scenarios green); matches RF-01's literal wording ("Administrador... Creación de proyectos" — doesn't say "on conversion"); no interaction with D7 (fase EJECUCION terminal).
   - Cons: doesn't close the exact traceability loop the prior design's D2 explicitly deferred; the business's own framing ("interconectar la planificación... con la ejecución...") reads like `fase=EJECUCION` should literally mean "a Proyecto now exists" — decoupling may just relocate the same open question one hop later.
   - Effort: Medium.

2. **Coupled: Proyecto auto-created transactionally inside the existing convert endpoint** — extends `convert/route.ts:53-57`'s single `db.oportunidad.update` into a transaction that also creates `Proyecto` (with `Proyecto.oportunidad_id` required + unique) and extends the `logAudit` payload.
   - Pros: closes the exact chain D2's rationale asked for; one atomic, audited action; matches the framing "this new module is what a won opportunity converts INTO."
   - Cons: retrofits already-merged, tested code (regression risk lands on shipped PR #46); the doc's required `Proyecto` fields (código, territorio, línea estratégica, fechas, cronograma, presupuesto) can't realistically all be collected inside a single conversion click — needs either sensible defaults/nullability at creation with a follow-up "complete the project" step, or a two-step UI (convert → then a mandatory setup wizard) the doc doesn't describe; also collides with D7 (fase EJECUCION marked terminal) if a botched auto-created Proyecto ever needs to be corrected/recreated.
   - Effort: Medium-High.

3. **Independent: Proyecto has no FK to Oportunidad at all, sibling entities under Cliente** — both `Proyecto` and `Oportunidad` FK to `Cliente` directly; "conversion" becomes a UI convenience only (pre-fill a new Proyecto form from a won Oportunidad's data client-side), no schema relationship.
   - Pros: simplest schema; avoids coupling two independently-evolving lifecycles; zero touch to the convert endpoint.
   - Cons: loses the auditable, queryable traceability link the business's own "interconectar" framing implies; duplicates already-entered data (nombre, fechas) with no DB-enforced consistency.
   - Effort: Low-Medium.

**Sub-decision (independent of the above 3):** RF-02's "cronograma de actividades vinculadas a metas" — extend the existing unified `Tarea` model (already overloaded with CRM+Kanban+`oportunidad_id` semantics per the prior change) with `proyecto_id`/`meta_id` nullable FKs and a third `origen` value, OR introduce a dedicated `Actividad` model scoped only to `Proyecto`. Given `Tarea` is already carrying two purposes and just grew commercial semantics, a fresh `Actividad` model avoids further overloading a model whose own design doc already flagged the cost of stretching it — but this is a genuine open call, not a clear win either way.

## Recommendation

No single approach is forced by the codebase — this is a business/product decision (same shape as D1-D9 in the prior change, which the owner explicitly signed off on). Leaning: Approach 2 (coupled, transactional) best matches the task's own framing ("this new module is what a won opportunity should convert INTO") and the prior design's stated intent to eventually close the loop it deferred — but it is the highest-effort and highest-regression-risk option, touching code with an existing passing verify-report. If the propose phase cannot get an explicit product answer on how much of `Proyecto`'s required data can be deferred post-creation, Approach 1 (decoupled) is the safer default that doesn't foreclose adding the FK link later. A dedicated `Actividad` model (not extending `Tarea`) is the safer default for the RF-02 sub-decision given `Tarea`'s existing overload.

## Open Questions (blocking a confident propose-phase design)

1. **Role mapping** — is "Visualizador/Directivo" a new orthogonal boolean flag (precedent: `gestiona_oportunidades`) or a genuine 5th `RolUsuario` value? No existing role is read-only today (`GERENCIA` has full read+write).
2. **Semaphore thresholds** (RF-03 técnico, RF-07 financiero) — doc explicitly says "pendiente por definir." Cannot be designed/speced without the business supplying exact percentage bands for verde/amarillo/rojo.
3. **Proyecto ↔ Oportunidad/Cliente cardinality and conversion coupling** — see the 3 approaches above; this is the central schema fork.
4. **RF-02 Actividad modeling** — extend `Tarea` vs. new dedicated `Actividad` model.
5. **Currency/precision** — doc is silent on multi-currency; does `Presupuesto`/`Rubro` follow the same COP-only `Decimal(15,2)` convention as `Oportunidad.valor_estimado_cop`, or does the business need foreign-currency tracking for funders?
6. **Rubro catalog shape** — closed Prisma enum vs. free-string admin-configurable catalog (like `Documento.categoria`)? The doc's "etc." after listing rubros suggests open-ended, but this needs explicit confirmation.
7. **Beneficiario** — doc's KPI is a simple "tarjeta resumen" (Beneficiarios Atendidos/Meta) — does the business want a full named-beneficiary registry entity, or just numeric target/actual counters on `Meta`/`Proyecto`? The doc gives no detail beyond the dashboard card.
8. **Chart primitives for 3.4** — gauge/tacómetro, S-curve, radar have zero precedent in this codebase (no chart library dependency exists at all). Build custom SVG (matching the existing `Sparkline`/`BarRow` house style) vs. adopt a charting library — a real build-vs-buy fork with no existing signal either way.
9. **External-link attachments** — RF-04's "O ingresar enlaces externos (URLs de Drive)" has no precedent in `AdjuntoTarea`/`Documento` (both assume an uploaded object via `storage_path`). Needs a net-new nullable URL field design.
10. **RNF-02 "<3s" performance target** — no existing dashboard endpoint has a documented latency SLA to compare against; needs confirmation this is a genuine hard requirement vs. aspirational.

## Risks

- Regression risk on the already-shipped, tested `convert/route.ts` (11/11 scenarios passing) if Approach 2 is chosen — any coupling change must not break that endpoint's existing contract/tests.
- Two of the ten open questions (semaphore thresholds, RF-02 modeling choice) are pure business decisions that CANNOT be resolved by more code investigation — the propose phase must either get an explicit owner answer or make and clearly flag an assumption, exactly as the prior change's D7/D8 did.
- `Tarea` is already an overloaded model (CRM + Kanban + commercial `oportunidad_id`); a decision to extend it further for RF-02 compounds an already-flagged design cost from the prior change.
- No chart library exists in `package.json` today — introducing one (if chosen) is a new dependency decision with its own bundle-size/maintenance tradeoff, not purely a "reuse what's there" story.

## Ready for Proposal

Yes. All ten open questions above are the propose phase's explicit decision surface (same pattern as D1-D9 in `oportunidades-comerciales`) — they are not gaps in this exploration, they are the actual scope of the next phase's work. The propose phase should resolve #1-#4 first (they gate the schema shape), treat #2 and #7 as flagged assumptions if no owner input is available (matching the prior change's D7/D8 precedent), and can defer #8/#9/#10 to the design phase.

## Key Learnings

1. This exact module (`Proyecto` entity) was already discussed and explicitly deferred by name in the prior `oportunidades-comerciales` design's decision D2 — this is not a fresh idea, it is a known deferred item now being picked up.
2. No `RolUsuario` value in the app is purely read-only; the prior change's precedent for a cross-cutting access need was an orthogonal boolean flag (`gestiona_oportunidades`), not a new role, and that same rationale applies to the "Visualizador" question here.
3. The dashboard has zero chart-library dependency — gauge, S-curve, and radar visualizations required by RF 3.4 have no existing analog and are a genuine build-vs-buy decision.
4. The existing attachment pattern (`AdjuntoTarea`/`Documento`) has no concept of an external URL-only attachment, which RF-04 explicitly requires alongside file uploads.
5. `Tarea` is already an overloaded model (CRM + Kanban + commercial linkage); extending it again for RF-02 activities compounds a design cost the prior change's own docs already flagged.
