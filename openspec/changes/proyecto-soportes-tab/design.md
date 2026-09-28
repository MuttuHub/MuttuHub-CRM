# Design: proyecto-soportes-tab — Pestaña Soportes

## Technical Approach

Two components plus one wiring change, in dependency order:

1. **`tabs/soportes-tab.tsx`** — reads `useAttachments(projectId)` for the list, `useUsers()` (from `src/hooks/crm.ts`) for author names, `useActivities(projectId)` and `useExpenses(projectId)` (both from `src/hooks/projects.ts`) to resolve the "vinculado a" label. All four are pre-existing hooks; none is touched.
2. **`soporte-dialog.tsx`** — "Agregar soporte" modal, calls `useUploadAttachment(projectId)` (pre-existing, multipart, `file` XOR `url`).
3. **`project-workspace.tsx`** — adds the 7th tab, `"soportes"`.

No schema change, no migration, no API route touched. This is the exact case the Auditoría already classified as `UI`-only for RF-04 (`Auditoria v6.dc.html` line 183: brecha = "No hay pestaña Soportes en el workspace", nothing about data).

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | The dialog exposes the real XOR the backend enforces — a radio "Archivo" / "Enlace" — instead of the v6 mock's "Formato" select (`Drive`/`PDF`) | Reproduce the mock's `Formato` select verbatim | The mock's `Formato` field doesn't correspond to any real column or API parameter — `POST .../attachments` accepts exactly one of `file`/`url` in the multipart body (`src/app/api/v1/projects/[id]/attachments/route.ts`, `hasFile === hasUrl` rejected). A `Formato: Drive/PDF` select would either be decorative (never sent to the API) or would require inventing a field the backend doesn't have — both violate "prefer UI over the existing backend" and "do not invent data". The radio reproduces the one thing that IS real: you attach a file or a link, never both. |
| D2 | "Vinculado a" resolves client-side by cross-referencing `useUsers()`/`useActivities()`/`useExpenses()` already-cached data, never a new API call or a schema change | Extend `SUPPORT_SELECT` (`attachments/route.ts`) with `subido_por: { select: { nombre } } }`, `actividad: { select: { nombre } } }`, `gasto: { select: { concepto } } }` via new Prisma relations | `SoporteProyecto.subido_por_id` has no Prisma relation field today, and no FK constraint exists at the DB level either (checked: `prisma/migrations/**/migration.sql` never adds one) — wiring a relation would require an additive migration (`ADD CONSTRAINT ... FOREIGN KEY`), which is unnecessary work when `useUsers()` (`/api/v1/catalogs/users`, "any authenticated user may read it") already returns `{id, nombre}` for every active usuario, and `useActivities`/`useExpenses` already return `nombre`/`concepto` for this exact project. Same principle F1.2's D1 used for `estado_legalizacion`: never duplicate or newly wire what's already derivable from data the client already has. |
| D3 | The Soportes tab has no KPI cards and no filter chips, unlike `financiero-tab`/`legalizacion-tab` | Add 3 KPI cards (e.g. "N soportes", "Con vínculo/Sin vínculo") and Todos/Verificación/Legalización filter chips, mirroring the sibling tabs' shape | The v6 mock's Soportes tab (`ptSop` block, `Muttu Hub v6.dc.html` lines 660-673) has neither — only the "Agregar soporte" control and the flat list. RF-04's source requirement text doesn't call for KPIs or filters either. Inventing them would be scope creep beyond what the source specifies; a real user need for filtering can be proposed later as its own change if it surfaces in practice. |
| D4 | Author lookup, activity lookup and expense lookup are each allowed to degrade independently (show raw id or "—" while `isLoading`), never gate the whole tab's render | A single combined "loading" gate that waits for all four queries before rendering any row | `useUsers`/`useActivities`/`useExpenses` are secondary display data for a list whose primary data (`useAttachments`) may already be ready. Gating the whole list on three extra queries the user may not even need yet (e.g. every soporte has `actividad_id: null`) adds latency for no benefit — same reasoning as the backend's own `resolveDownloadUrls`, where a slow/failed secondary lookup (`storage.createSignedUrl`) never blocks the primary listing. |

## Data Model

No changes. `SoporteProyecto` (`prisma/schema.prisma`), `SUPPORT_SELECT` (`attachments/route.ts`), and the `Soporte`/`UploadAttachmentInput` types (`src/hooks/projects.ts`) are consumed exactly as they exist today.

Client-side derivation only, inside `soportes-tab.tsx`:

```ts
function autorNombre(usuarios: UsuarioMini[], subidoPorId: string): string {
  return usuarios.find((u) => u.id === subidoPorId)?.nombre ?? "—";
}

function vinculadoA(soporte: Soporte, actividades: Actividad[], gastos: Gasto[]): string {
  if (soporte.actividad_id) {
    return actividades.find((a) => a.id === soporte.actividad_id)?.nombre ?? "Actividad";
  }
  if (soporte.gasto_id) {
    const gasto = gastos.find((g) => g.id === soporte.gasto_id);
    return gasto ? `Gasto · ${gasto.linea.rubro.nombre}` : "Gasto";
  }
  return "Soporte general del proyecto";
}

function formato(soporte: Soporte): string {
  if (soporte.storage_path) {
    const ext = soporte.storage_path.split(".").pop()?.toUpperCase();
    return ext || "Archivo";
  }
  return "Enlace";
}
```

These three functions live once, in the tab component, purely for display — none of them feeds back into a mutation or a stored value.

## Component Structure

### `tabs/soportes-tab.tsx`

- `"Agregar soporte"` button (top-right, same placement as `legalizacion-tab.tsx`'s `RegistrarGastoButton`), `min-h-11`.
- Loading state while `useAttachments` is pending: `"Cargando…"` (same copy as `legalizacion-tab.tsx`).
- Empty state: `"Este proyecto no tiene soportes registrados todavía."`
- Populated: a card list (not a wide table — 6 fields per row is wide, but unlike Legalización's ledger this isn't tabular financial data with aligned columns; a card list reads better at 390px without `overflow-x-auto`, closer to the v6 mock's flex-wrap row shape at `Muttu Hub v6.dc.html:670`). Each card:
  - Type chip: `Verificación` → `bg-info-bg text-info`; `Legalización` → `bg-accent text-accent-foreground` (exact token pair the repo's `globals.css` already defines for "info blue"/pink, matching README.md's description verbatim).
  - `nombre` (bold).
  - `vinculadoA(...)` + autor + fecha, as a muted subtitle line (mirrors the mock's `{{ s.v }} · {{ s.q }} · {{ s.f }}` composition).
  - `formato(...)` badge, monospace (mirrors the mock's `font-family:'JetBrains Mono'` format tag).
  - Download link (`<a href={soporte.download_url} target="_blank" rel="noopener noreferrer">`, disabled/hidden if `download_url` is `null`) and a delete button (`useDeleteAttachment`, confirm-before-delete, same "zona de peligro" convention as `task-dialog.tsx`'s `DangerZone`, scoped inline per-row here since a soporte is a leaf entity, not a whole record like a task).

### `soporte-dialog.tsx`

Fields, in order (v6 mock's `formCatalog.soporte`, `Muttu Hub v6.dc.html:1341`, copy quoted verbatim):

| Field | Control | Notes |
|---|---|---|
| "Tipo" | native `<select>`: `Verificación`, `Legalización` | Changes which list "Vincular a" offers |
| "Documento" | text input, required, placeholder `"Ej. Listas de asistencia taller 3"` | Maps to `nombre` |
| "Vincular a" | native `<select>`: options depend on Tipo — `Verificación` → `useActivities(projectId)` (label = `actividad.nombre`); `Legalización` → `useExpenses(projectId).gastos` (label = `` `${gasto.concepto} · ${gasto.linea.rubro.nombre}` ``); both include a leading `"Soporte general del proyecto"` option (value `""`, maps to neither `actividad_id` nor `gasto_id` — the backend already allows both to be absent) | D1/D2 — real options, not the mock's `actOpts` (activities-only) |
| Archivo / Enlace | radio, `"Archivo"` / `"Enlace"` | D1 — replaces the mock's decorative "Formato" select |
| Conditional file input | `<input type="file">`, shown when "Archivo" selected | Same allowed types/size copy as `task-dialog.tsx`'s dropzone (`PDF, DOCX, XLSX, PPTX, JPG, PNG · máx 10 MB`, per `src/lib/api/files.ts`'s `ALLOWED_FILE_EXTENSIONS`/`MAX_FILE_BYTES`) |
| Conditional URL input | `<input type="url">`, shown when "Enlace" selected, placeholder `"https://drive.google.com/…"` (mock's exact placeholder) | Client-side `https://` prefix check before submit, mirroring `expense-dialog.tsx`'s enlace validation — the real backstop stays server-side (`isValidExternalUrl`) |

CTA: `"Guardar soporte"` (mock's exact copy). `noValidate` on the `<form>`, same rationale documented in `expense-dialog.tsx` (native HTML5 constraint validation silently blocks custom `onSubmit` validation otherwise).

On submit: single call to `useUploadAttachment(projectId).mutateAsync({...})` — no chaining (unlike `expense-dialog.tsx`'s two-call flow), because a soporte is the only resource this dialog creates.

### `project-workspace.tsx`

```ts
const TAB_VALUES = ["resumen", "cronograma", "gantt", "indicadores", "financiero", "legalizacion", "soportes"] as const;
```
Plus one `TabsTrigger`/`TabsContent` pair, mirroring every existing tab's shape exactly.

## File Changes

| File | Change |
|---|---|
| `src/components/proyectos/tabs/soportes-tab.tsx` | New — list, type chip, vinculado a / autor / fecha / formato, download, delete |
| `src/components/proyectos/tabs/soportes-tab.test.tsx` | New |
| `src/components/proyectos/soporte-dialog.tsx` | New — "Agregar soporte" modal |
| `src/components/proyectos/soporte-dialog.test.tsx` | New |
| `src/components/proyectos/project-workspace.tsx` | Add `"soportes"` tab (7th tab) |
| `src/components/proyectos/project-workspace.test.tsx` | Mock + assertions for the new tab |

## Testing Strategy

Strict TDD, RED before code for each of:

1. `soportes-tab.test.tsx` — loading/empty/populated states; type chip renders the right label/color per `tipo`; "vinculado a" resolves an activity name, a gasto's `concepto · rubro`, and falls back to "Soporte general del proyecto" when both ids are `null`; author name resolves from `useUsers()` and falls back to `"—"` while that query is pending; download link is absent/disabled when `download_url` is `null`; delete removes the row from the list (mock `useDeleteAttachment`, assert `mutate`/`mutateAsync` called with the right id).
2. `soporte-dialog.test.tsx` — required-field validation (Tipo, Documento); "Vincular a" options swap when Tipo changes between Verificación/Legalización; Archivo/Enlace radio toggles the visible input and both are mutually exclusive in the submitted payload; on submit, asserts `useUploadAttachment`'s mutation is called with the exact XOR shape (`file` present XOR `url` present, never both, never neither) and with `actividad_id`/`gasto_id` set only when "Vincular a" isn't the general option.
3. `project-workspace.test.tsx` — extend for the `"soportes"` tab (mount-only-when-selected, mirrors every existing per-tab assertion).

## Risks

Same as proposal.md's Risks table — no new risks introduced at design time.

## Assumptions Taken (not resolved by the proposal)

- The Soportes tab renders as a card list, not a wide table (`overflow-x-auto` ledger) — the v6 mock itself uses a flex-wrap row shape here, unlike Legalización's dense financial ledger; a table would force horizontal scroll for data that doesn't need column alignment.
- "Vinculado a"'s leading option for a soporte with neither `actividad_id` nor `gasto_id` is labeled "Soporte general del proyecto" — the mock's `SOPS` sample data never has this case, but the backend explicitly allows it (`attachments/route.ts`: `actividadId`/`gastoId` are each optional, only "both set" is rejected), so the UI must have a value for it.
- No client-side gating of the "Agregar soporte"/delete controls on `puede_editar_proyecto` — `legalizacion-tab.tsx` (F1.2, most recent sibling) doesn't gate its "Registrar gasto" CTA client-side either, relying on the server's `canManageProject` 403 on write. This change follows the same established precedent for consistency; a 403 from `useUploadAttachment`/`useDeleteAttachment` surfaces via their existing `toast.error` handling.

## Open Questions

None blocking.
