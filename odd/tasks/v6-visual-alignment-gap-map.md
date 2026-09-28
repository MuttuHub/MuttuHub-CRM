# Muttu Hub v6 — Visual Gap Map (read-only)

Date: 2026-09-28 · Branch `local/todo-integrado` · Scope: VISUAL only (tokens, shell, components, hierarchy, states). Features/data models excluded (see §7).

Sources: `design_handoff_muttu_hub_v6/README.md` (primary; handoff states "high-fidelity, final"), `uploads/Muttu-Hub-UIUX-Spec.md` (earlier light-theme spec, still governs component contracts), `gap-audit-v6.md` (feature status). The `.dc.html` prototype renders through an external `_ds_bundle.js` + `support.js` runtime; its only inline CSS is a one-line reset (bg `#120C0E`, links `#EB3F85`, scrollbar `#34272C`), so README tokens were used as the value source. Prototype screenshots in `uploads/` were NOT reviewed.

Evidence legend: **[V]** verified by reading code (by me or a research worker, file:line cited); **[A]** assumption / needs confirmation. Spot-rechecked by me: `sidebar.tsx:141`, `ui/button.tsx:24-28`, `kanban/task-card.tsx:130`, `ui/dialog.tsx:34`, `ui/sheet.tsx:31`, `globals.css` (full).

---

## 0. Headline

- **Half the foundation already exists.** `globals.css` was built "from the approved mockup". It already has warm ink/rose scales, a `.dark` palette that is close to v6, and the v6 fonts via `next/font` (`layout.tsx:11-27`). Dark mode can already be reached: a Sun/Moon toggle in `header.tsx:134-145`, `use-theme.ts:22-26`, and an anti-FOUC script in `layout.tsx:55-59` **[V]**. The README says "keep the light theme, apply v6 to dark mode", so the token work is **value and contract changes in `.dark`**, with no new theming infrastructure.
- **Biggest gaps are contract-level, not hex-level:**
  1. The active nav item is a solid magenta fill (`sidebar.tsx:141`). v6 and UIUX-Spec both want a surface background plus a 3px rail.
  2. `ui/button`, `ui/input` and `ui/select` are the untouched shadcn scaffold at 28–36px. v6 wants 44px.
  3. Dark `--primary` flips to rose-400 with dark text. v6 keeps `#CD1560` with white text.
  4. Status chips are re-implemented per feature. Some are solid-fill, some are tinted, and there is no shared dot-chip.
- **Screens closest to v6 already:** the Tablero gerencial cara, Soportes, Gantt and Legalización (columns). **Furthest:** Cronograma (a card list where v6 has a table), the Aliados ficha (a modal where v6 has a split pane), the Nuevo proyecto wizard, and the kanban filters and actions.

---

## 1. Design tokens (v6 → current → action)

All v6 values apply to `.dark` (`globals.css:175-239`); `:root` light stays.

| v6 token | v6 value | Current (globals.css) | Action |
|---|---|---|---|
| bg | `#120C0E` | `--page #161113` (215), `--background #191113` (176) | change (both lighter) |
| sidebar | `#0D0809` | `--sidebar #191113` (199) — theme-invariant by design (comment l.33) | change in `.dark` only; light keeps dark shell [V] |
| surface | `#1B1316` | `--panel #1a1316` (216) / `--card #241a1c` (178) | panel keep; card → `#1B1316` |
| surface-2 | `#241A1E` | `--secondary/--muted/--accent #2e2225` (184-188), `shell-chip #2e2225` | change |
| border | `#2E2227` | `--border #382a2e` (191) | change |
| border-strong | `#34272C` | — (one border weight only) | **add** `--border-strong` |
| input-bg | `#120C0E` (=bg) | `--input #382a2e` (192) — used as border AND bg | **contract change**: split input bg from input border |
| text | `#F8F2F4` | `--foreground/--ink-800/900 #f7f3f4` | keep (Δ≈1) |
| text-2 | `#C4B2B8` | `--ink-700 #c9bcc0` (222) | minor change |
| text-3 | `#A08A91` | `--ink-500 #9c8a8f` (220), `--ink-600 #947f84` | minor change; keep AA check |
| primary | `#CD1560` + white | `--primary #e4569a` + `--primary-foreground #191113` (182-183) | **contract change (decision D1)** |
| accent | `#EB3F85` | `--color-rose-400 #e4569a` fixed (17) | change rose-400 or add `--accent-brand` |
| accent-soft | `#F5BAD2` | `--rose-200` light only; dark `#5a2f42` | add dark text-on-tint token |
| accent-tint | `rgba(235,63,133,.14)` | `--rose-50 #331a24` (226) | change to alpha tint |
| ok | `#4CC38A` | `--exito #4caf7d` (229) | change (small) |
| warn | `#F0A04B` | `--alerta #e08c2e` (231) | change (hue drift) |
| bad | `#F07163` | `--destructivo #e5736b` (233) | change (small) |
| info | `#6AA6F0` | `--info #6ba6d9` (235) | change (small) |
| chip bg | status @15% alpha | `--*-bg` opaque dark hexes (230-236) | change to `color-mix(… 15%)` |
| overlay | `rgba(12,6,9,.66)` | `bg-black/10` + blur (`dialog.tsx:34`, `sheet.tsx:31`) | **add** `--overlay`, use in both |
| Fonts | Bricolage / Instrument / JetBrains | `--font-display/sans/mono` (58-60) | keep |
| Page title | `clamp(30px,4vw,44px)`/800/-.03em/lh1 | none; pages hand-set 20–24px (`project-list.tsx:110`, `project-workspace.tsx:93`) | **add** utility/component |
| Section title | 20–28/700 | `CardSection` 17px (`dashboard/shared.tsx:58`) | change |
| KPI number | 28–32/800 display | mixed: `StatTile` ok; `KpiCard` 32/700 sans (`kpi-cards.tsx:54`); Legalización 18/700; tacómetro 700 | unify |
| Eyebrow | 12/700/upper/.1em/text-3 | ad hoc 10.5–11px | add utility |
| Mono data | JBM 12.5–13.5 | inconsistent (ok in accesos/soportes; missing in proyectos, financiero, legalización, repositorio) | apply `font-mono tabular-nums` |
| Radius shell | 26px | hard-coded `rounded-[26px]` (sidebar.tsx:238, app layout:25) | keep; tokenize `--radius-shell` |
| Radius card | 20–22px | dashboard/CRM cards 18–22 ok; `ui/card` `rounded-xl` ≈18px; proyectos tabs 14px | change `ui/card`, tabs |
| Radius control | 12px (small 10) | `--radius-12` exists; `ui/button` uses `rounded-lg` (=13px), login 13/14 | pin to `--radius-12` |
| Pills | 999px | badges `rounded-4xl`/`rounded-full` | keep |
| Spacing | shell 14, card pad 20–22, grid 12–14 | shell 14 ok [V]; `ui/card` 16px; proyectos/admin `px-4 py-3` | change card spacing |
| Control height | 44 / 36–40 compact | button 32/28/36, input/select 32 (`input.tsx:12`, `select.tsx:88`), nav item 36 (`sidebar.tsx:138`) | **change**; note buttons already extend hit area via `after:-inset-*` |
| Input font | ≥16px | `input.tsx` `text-base` | keep |
| Shadows | none except toast | `shadow-md/lg/xl` in select:130, dropdown-menu:44, sheet:56, notification-panel:260, kanban card | strip (decision D3 for kanban) |
| Toast | light card, fixed colors in dark, 5s, "Cerrar" | sonner themed, flips with theme, default duration, no close (`theme-toaster.tsx:17-24`) | change |

---

## 2. Shell (`src/components/shell/*`, `src/lib/nav.ts`, `src/app/(app)/layout.tsx`)

| Item | v6 | Current [V] | Size | Depends |
|---|---|---|---|---|
| Layout shell | flex-wrap, 14px pad/gap, sticky sidebar r26 | already matches (`sidebar.tsx:236-246`, app layout:20-25) | — | — |
| Nav groups | Operación / Dirección | identical (`nav.ts:27-75`) | — | — |
| Nav item | 44px, r12 | 36px, r11 (`sidebar.tsx:138`) | S | V0.4 |
| Active state | surface bg + left accent bar (rail) | solid `bg-rose-500 text-white` (`sidebar.tsx:141`) | M | V0.1 |
| Lockup | logo 92px + "Hub" Bricolage 17/700 text-2 | logo + "Hub" chip (`sidebar.tsx:75-84`) | S | — |
| Profile + Salir | pinned at sidebar bottom | lives in header `UserMenu` dropdown (`header.tsx:149`) | M (move/duplicate; keep header on mobile) [A: mobile behavior not specified by v6] | — |
| Page header | Bricolage display title + eyebrow | per-page ad hoc sizes | M (new `PageHeader`) | V0.2 |
| Toast | fixed light card, 5s, Cerrar | theme-flipping sonner | S | V0.1 |
| Modal chrome | 560–620px, r22, pad 26/28, mono req-code + 26px title, overlay .66 | `max-w-sm`, `rounded-xl`, `p-4`, `bg-black/10` (`dialog.tsx:34,56,105`) | M | V0.1 |
| Notifications panel | no shadow, surface tokens | `shadow-xl` (l.260), own EmptyState (l.378) | S | V0.5 |
| Breadcrumbs | not specified in v6 | n/a | — | — |

---

## 3. Shared primitives — ordered by leverage

| # | File | Change | Size |
|---|---|---|---|
| P1 | `ui/button.tsx` | heights 44/40/36, radius → `--radius-12`, primary picks up D1, destructive = outline→fill-on-hover (UIUX §3.1) [A: check current destructive variant] | M (visual regressions everywhere; update snapshot/class tests) |
| P2 | `ui/input.tsx`, `ui/select.tsx` | 44px, bg = `--input-bg`, border = `--border-strong`, r12 | S |
| P3 | `ui/dialog.tsx`, `ui/sheet.tsx` | overlay token, max-w 600 default, r22, pad 26/28, optional `code` slot in header, drop sheet shadow | M |
| P4 | `ui/card.tsx` | border instead of `ring-foreground/10` (l.15), r20–22, pad 20–22 | S |
| P5 | `ui/table.tsx` | 44–45px rows, eyebrow headers, `tabular-nums`, numeric cell alignment helper, selected-row rail | S |
| P6 | `ui/badge.tsx` | add tinted status variants (15% alpha) | S |
| P7 | `ui/tabs.tsx` | active = rail (3px pill) per UIUX §2.6 | S |
| P8 | `ui/select/dropdown-menu/popover` | strip shadows, surface-2 hover | S |

Missing primitives to extract (high leverage, removes per-feature color maps, which the UIUX "one state = one color" rule requires):

- **`StatusChip`** (dot + text, tinted). It is currently duplicated in `crm/shared.tsx:50`, `kanban/task-card.tsx:127,178`, `kanban-board.tsx:556`, `financiero-tab.tsx:52-64` (solid fill + white text, which is wrong), `legalizacion-tab.tsx:61-72` (solid, wrong), `soportes-tab.tsx:46-49` (tinted, correct), `metas-tab.tsx:84-94`, `users-table.tsx:294-309` and `project-list.tsx:274` (plain secondary Badge). It also needs a central `estado → tone` map module.
- **`EmptyState`**. There are two private same-named components with different signatures (`notification-panel.tsx:378`, `client-sheet.tsx:1617`), plus about 7 inline empty messages.
- **`KpiTile`**. Promote `dashboard/shared.tsx` `StatTile` (already display/800, r20) to `ui/`. Replace `KpiCard` (`kpi-cards.tsx:54`) and the ad-hoc tiles in Legalización/Proyectos with it.
- **`PageHeader`**: eyebrow, display title, subtitle and an actions slot.
- **`ProgressBar` with semáforo tone** (used in metas, indicadores, proyectos list and financiero).

---

## 4. Per-screen deltas

Sizes are advisory. "Dep" names the V0 task that should land first.

### Acceso / Login — `src/components/auth/acceso-page.tsx`
- Split layout and real Supabase auth are already in place (l.356-482, l.261) [V].
- The brand panel has no large "Muttu Hub" wordmark (38–64/800) and the logo is 118px where v6 has 130px (l.420-438). **M**
- The panel background and gradients are hard-coded hex values (l.372, 382-386). They should become tokens. **S**
- Input radius is 13 and button radius 14 (l.327, 667, 689). Both should be 12. **S**
- Dep: V0.1.

### Inicio — `dashboard-page.tsx`, `dashboard/shared.tsx`, caras
- The app's `/` is a 5-cara tabbed dashboard (F1.6), not v6's greeting + KPIs + alerts + agenda. The tabs are kept and restyled; the literal v6 layout is out of scope (§7).
- `CardSection` title is 17px (`shared.tsx:58`) where v6 has 20–22. **S**
- KPI numerals should be unified on the `StatTile` style. **S**
- Card radii (20/22) are already correct.
- The Tablero gerencial cara is closest to v6:
  - tacómetro weight is 700 where v6 has 800 (`tacometro.tsx:150`) **S**;
  - Territorio is a text input where v6 has a chip, and the "Periodo" chip is missing (`cara-management.tsx:174-194`) **S**, plus a product check on what Periodo filters.
- CurveS draws "Planificado" in exito and "Ejecutado" in destructivo (`curve-s-chart.tsx:47-53,89,93`). That is a semantic misuse and needs a neutral series pair: rose for executed, ink for plan. **S** (decision D5).
- Dep: V0.1, V0.3.

### Clientes / Aliados — `crm/client-list.tsx`, `client-sheet.tsx`, `crm/shared.tsx`
- Add an "N aliados" count next to the create button in the header row. The count currently only appears in the footer (l.446-472, 1289). **S**
- `InitialsAvatar` is 32px / r11 (`crm/shared.tsx:84`). v6 has 40 / r12. The sheet header uses a custom shape (l.358). **S**
- Swap "+ Nueva oportunidad" from solid to the dashed-add style (`client-sheet.tsx:1068`). **S**
- Chips should use the new `StatusChip`. **S**
- The ficha is a modal (`client-sheet.tsx:135`). v6 has a persistent right pane. **L**, a layout/IA change; decision D4.
- "Cliente" → "Aliado" copy sweep. **M** (breadth), a product-copy decision; D6.
- The v6 row chips "N oportunidades", "N proyectos" and the health score have no data (§7).
- Dep: V0.1–V0.3.

### Tablero kanban — `kanban/kanban-board.tsx`, `task-card.tsx`
- Columns already match v6's 6 states (l.95-102).
- The Prospección chip is amber (`task-card.tsx:130`). v6 has pink/accent-tint. **S**
- There is no 3px "hot" border for due-today/overdue cards; the date chip is the only signal (l.72-76, 158-167). **S**
- Shadows are `shadow-sm`, `hover:shadow-md` and a drag `shadow-xl` (l.73-75). v6 says none. **S**, decision D3.
- Drag rotation is 2° where UIUX has 1.5°. Trivial.
- The filter bar is a multi-dropdown (l.705-771). v6 uses Todas/Prospección/Ejecución/Mías chips built from existing fields. **M**, an interaction change; decision D7.
- The "Avanzar →" and "Pasar a nuevo proyecto →" buttons are behaviour additions (§7).
- 6 columns plus v6's dashed 7th conflict with the UIUX "max 5 visible" rule; decision D7.

### Proyectos list — `proyectos/project-list.tsx`
- The title is 20px (l.110). It should be the display `PageHeader`. **S**
- Codes and dates are not in mono (l.265, 277). **S**
- Estado is a plain secondary Badge with no per-state color (l.274). It should be `StatusChip`. **S**
- Per-row technical and financial semáforo progress bars are missing (l.191-224). **M** [A: `semaforo.ts` values probably reachable. If the list API doesn't return them, this becomes feature work.]
- The edit button is always visible; UIUX wants it on hover. **S**
- There are no KPI cards above the list. [A: check the data exists; otherwise it's a feature.]

### Nuevo proyecto — `proyectos/project-form.tsx`
- The form has one flat field grid (l.228-410) with 9 identification fields.
- A 5-step stepper (General…Revisión) over the **existing** fields is **L**.
- v6's Metas/Cronograma/Presupuesto steps imply capturing data at creation time that the payload doesn't cover (l.184-194). Decision D2.
- "8 line toggles" conflicts with the single `linea_estrategica` enum (l.68, 306-325). Decision D2; blocks the wizard.

### Proyecto workspace — `project-workspace.tsx` + `tabs/*`
- The header title is 24px (l.93). It should be `PageHeader`. The tab list is plain line tabs (l.121-130); the rail comes from V0.8. **S**
- **Resumen** has no alert card (the tab is a 24-line wrapper). **M** [A: alert content from existing semáforo data]
- **Metas**:
  - card padding is 16/12 where v6 has 20 (l.148) **S**;
  - band legend is missing **S**;
  - "medio de verificación" is not rendered. [A: field may not exist; check before sizing.]
- **Cronograma** is the biggest visual gap. v6 has a meta-grouped **table** with bold pink meta rows, plan%/real%/semáforo, a support chip and a KPI row. The app has a flat card list (l.31-65) with no semáforo and no support chip. **L**. It needs attachments data the tab doesn't query today [A: data exists via `useAttachments`].
- **Gantt**:
  - there is no global "hoy" line; only the per-bar plan marker (l.166-171) **S**;
  - auto date range vs v6's fixed 36 months — keep auto [A];
  - meta groups have no card frame **S**.
- **Indicadores**:
  - the bar colour is binary (l.144-149) while Metas uses the 3-band `color_indicador`. Inconsistent; fix to match **S**;
  - spacing **S**.
- **Financiero**:
  - the gauge is a full conic donut (l.127-150) where v6 has a semicircle **M**;
  - the band legend is missing **S** (reads settings);
  - `SemaforoChip` is solid fill with white text (l.52-64) where v6 wants tinted **S**;
  - amounts are not mono **S**;
  - per-person bars are out of scope (§7).
- **Legalización**:
  - the chip is solid (l.61-72) **S**;
  - KPI numbers are 18/700 (l.147-162) where v6 has 28–32/800 **S**;
  - min-width is 860 where v6 has 1000 (l.184) **S**;
  - amounts are not mono **S**;
  - columns and the observed-row tint already match.
- **Soportes** already matches v6: tinted type chips and mono format. The cards should move to the V0 spacing tokens only. **S**
- Dep: V0.1–V0.5.

### Documentos / Repositorio — `documents/repository-list.tsx` (1006 lines)
- Headers are already eyebrow-style.
- There is no red "Restringido" chip on rows. The flag lives on the category (`catalogs-section.tsx:155`). **S/M** [A: data reachable through `useDocCategories`.]
- Selected rows show only a checkbox, no rail (l.764). **S**
- Version metadata is not mono (l.838). **S**
- General token and spacing pass across the tree, filters and table. **M**

### Reportes — `reportes/reportes-page.tsx`
- The segmented tabs are close to v6 (l.70-82) **S**.
- The single "Generar reporte" link (l.192-204) could be restyled as a report **card** with the existing PDF action. **S**
- Excel and scheduled reports are features (§7).

### Administración — `administracion/page.tsx` + `components/admin/*`
- The five sections exist. All of them need the spacing and type pass; they use `px-4 py-3` and 11–13.5px text. **M** in aggregate, **S** each.
- The users status pill already follows dot + tint.
- Accesos and Auditoría already use mono timestamps.
- Umbrales: add color swatches per band. **S**
- v6 shows Solicitudes as a tab; the app has a separate route plus a nav item. This IA question is decision D8.
- The Roles matrix is a feature (§7).

### Notificaciones — `shell/notification-panel.tsx`
- Remove the shadow (l.260).
- Replace the local EmptyState with the shared one (l.378).
- Apply the tokens. **S**

Not in the app, so skipped: Oportunidades pipeline kanban, Ficha de oportunidad page, Interacciones global, Relaciones, Convocatorias/Salud/Mapa/Automatizaciones, Modo campo, Ficha de seguimiento, Beneficiarios, Equipo.

---

## 5. Proposed ordered task list

About 400 changed lines per task, as an advisory heuristic. The V0 tasks come first because every screen inherits them.

| ID | Task | Size | Depends | Verification |
|---|---|---|---|---|
| V0.1 | `.dark` token values + new tokens (`--border-strong`, `--input-bg`, `--overlay`, accent/accent-soft/tint, alpha chip bgs, shell radius); primary per D1; toast fixed-light, 5s, Cerrar | M | D1 | WCAG contrast script on new pairs; light theme screenshot diff = none; 1440/390 dark screenshots of Inicio, Clientes, Proyecto |
| V0.2 | Type utilities: `PageHeader`, eyebrow, section-title, KPI numeral, mono-data (`font-mono tabular-nums`) | S | — | new component unit tests (RTL renders title/eyebrow/actions) |
| V0.3 | `StatusChip` + central `estado→tone` map; `KpiTile` (promoted StatTile); `ProgressBar` with semáforo tone | M | V0.1 | unit tests per tone/estado mapping; snapshot of chip variants |
| V0.4 | Control sizing: `ui/button` (44/40/36, r12, destructive outline), `ui/input`, `ui/select` | M | V0.1 | update existing button/input tests asserting classes; 390px tap-target check |
| V0.5 | Surfaces: `ui/card` border/padding/radius, `ui/dialog` + `ui/sheet` chrome & overlay + optional code slot, strip popover/menu shadows | M | V0.1 | dialog tests (backdrop closes, focus trap unchanged); visual check of 3 dialogs |
| V0.6 | `ui/table` (row height, eyebrow th, tabular nums, selected-row rail) + `ui/tabs` rail + shared `EmptyState` | M | V0.1–V0.2 | table/tabs a11y tests (`th scope`, aria-selected) |
| V1.1 | Sidebar: 44px items, rail active state, lockup sizing | S | V0.1 | update `sidebar.test.tsx` active-state assertions; 1440 + 390 (collapsed/mobile) |
| V1.2 | Sidebar profile + Salir block (keep header UserMenu on mobile per D9); header uses `PageHeader` slot | M | V1.1, D9 | `user-menu`/`sidebar` tests: logout reachable from both |
| V1.3 | Notification panel + session banner token pass | S | V0.5–V0.6 | `notification-panel.test.tsx` |
| V2.1 | Acceso brand panel: tokens, wordmark hero, r12 controls | S–M | V0.1, V0.4 | `acceso-page.test.tsx`; 1440/390 |
| V2.2 | Inicio caras: section titles, KPI unification, chips, tacómetro weight, CurveS series colors (D5), gerencial chips | M | V0.2–V0.3 | dashboard component tests; print view unaffected check |
| V2.3 | Clientes list + ficha restyle (header count, avatar 40/12, chips, dashed add) — modal kept | M | V0.3–V0.5 | `client-list`/`client-sheet` tests |
| V2.4 | Kanban restyle: accent-tint Prospección chip, hot rail, shadows per D3, column tokens | S–M | V0.3, D3 | `kanban-board`/`task-card` tests; drag visual check, reduced-motion |
| V2.5 | Proyectos list: PageHeader, mono codes, StatusChip, semáforo bars (if data reachable), hover actions | M | V0.2–V0.3 | `project-list` tests |
| V2.6 | Workspace header/tabs + Metas + Indicadores (3-band consistency) + Gantt "hoy" line | M | V0.3, V0.6 | tab tests |
| V2.7 | Cronograma → meta-grouped table with semáforo + support chip + KPI row | L (split into 2 if >400 lines) | V0.3, V0.6 | `cronograma-tab.test.tsx` rewrite; 390 horizontal scroll |
| V2.8 | Financiero semicircle gauge + legend + tinted chip + mono amounts; Legalización KPIs/chips/min-width/mono; Resumen alert card | M–L | V0.3 | `financiero-tab`/`legalizacion-tab` tests |
| V2.9 | Documentos: Restringido chip, rail, mono metadata, token pass | M | V0.3, V0.6 | `repository-list` tests |
| V2.10 | Reportes cards + Administración sections token/spacing pass (+ Solicitudes per D8) | M | V0.2–V0.6 | admin section tests |
| V2.11 | Nuevo proyecto 5-step stepper over existing fields | L | D2, V0.4 | `project-form` tests (per-step validation, submit payload unchanged) |
| V2.12 | (optional, D4) Aliados ficha split-pane | L | V2.3, D4 | e2e/list-selection sync tests |
| V2.13 | (optional, D6) Cliente → Aliado copy sweep | M | D6 | string-based tests updated |

Verification for every task: run the configured Vitest suite for the files touched, then check light and dark at 1440px and 390px (390px must not scroll horizontally except inside tables). Strict TDD applies: write failing class/role assertions before restyling.

---

## 6. Open decisions for the user

| ID | Decision |
|---|---|
| D1 | Dark `--primary`: v6 `#CD1560` with white text vs the current rose-400 with dark text. The current choice was probably made for contrast; `#CD1560` with white passes AA (5.4:1). Also: should the light theme adopt anything from v6, or stay frozen? |
| D2 | Wizard: (a) are Metas/Cronograma/Presupuesto steps only groupings of the existing fields, or creation-time data entry (a feature)? (b) "8 line toggles" means multi-line projects (a data change) or a single-select styled as toggles? |
| D3 | Shadows: v6 "none except toast" vs UIUX sh-1/2/3, especially on kanban cards and drag. |
| D4 | Aliados ficha: keep the modal, or build v6's persistent split pane (L)? |
| D5 | CurveS series colours: neutral plan/executed pair instead of exito/destructivo. |
| D6 | UI copy: rename "Cliente" to "Aliado" throughout? |
| D7 | Kanban: chip filters in place of dropdowns (or both), and the column count (6 today plus dashed; the UIUX max is 5). |
| D8 | Solicitudes: an Administración tab, or keep the separate route and nav item? |
| D9 | Profile + Salir: sidebar-only (v6) or sidebar plus the header menu? Mobile behaviour is not specified in v6. |

---

## 7. Out of scope — looks visual but needs data or features

- The Inicio literal v6 layout (greeting, cross-entity alert list, today's agenda) and role-filtered KPIs.
- Aliados row "N oportunidades" / "N proyectos" chips and the health score. These fields are not on `ClientListRow`.
- The CRM tab strip, Oportunidades kanban, Ficha de oportunidad page, Interacciones, Relaciones, Convocatorias/Salud/Mapa/Automatizaciones (gap-audit F2/F4).
- Kanban "Avanzar →" and "Pasar a nuevo proyecto →" behaviour, and the dashed "Nuevo proyecto" column.
- Proyectos: multi-line toggles (D2b), creation-time metas/cronograma/presupuesto (D2a), the Ficha de seguimiento, Beneficiarios and Equipo tabs, and Modo campo.
- Financiero per-person bars. `Gasto.tercero` is free text.
- Reportes Excel action and scheduled reports. The Roles y permisos matrix.
- Possibly data-dependent, so verify before implementing:
  - Proyectos list semáforo bars and KPIs;
  - Metas "medio de verificación";
  - Cronograma support chip;
  - Repositorio Restringido chip.
