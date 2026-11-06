"""Build the «Muttu Hub — Proyectos» design system files from values extracted from the app code."""
import json, os, re, datetime

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ds", "project")

# ---------- contrast ----------
def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def parse(c, under=None):
    c = c.strip()
    if c.startswith("#"):
        return hex2rgb(c)
    m = re.match(r"rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)", c)
    r, g, b, a = map(float, m.groups())
    u = parse(under)
    return tuple(round(a * x + (1 - a) * y) for x, y in zip((r, g, b), u))

def lum(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(ch, rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

# ---------- colors (light, dark, usage) — exact values from src/app/globals.css ----------
C = [
    ("page", "#f6f1f3", "#120c0e", "Fondo de la app (`bg-page`)."),
    ("background", "#f6f1f3", "#120c0e", "Fondo base de shadcn; igual que `page`. Fondo de la pestaña activa en Tabs pill."),
    ("panel", "#ffffff", "#1a1316", "Superficies: `surface`, tarjetas de métrica (MetricTile, KpiCard)."),
    ("card", "#ffffff", "#1b1316", "Fondo de Card."),
    ("popover", "#ffffff", "#1b1316", "Fondo de Dialog, Popover y hoja inferior."),
    ("foreground", "#281d20", "#f8f2f4", "Texto base de shadcn."),
    ("card-foreground", "#281d20", "#f7f3f4", "Texto sobre `card`."),
    ("popover-foreground", "#281d20", "#f7f3f4", "Texto sobre `popover`."),
    ("primary", "#cd1560", "#cd1560", "Acción principal (Button default), anillo de foco en claro, subrayado de pestaña activa, riel de fila seleccionada."),
    ("primary-foreground", "#ffffff", "#ffffff", "Texto sobre `primary`."),
    ("secondary", "#f7f3f4", "#241a1e", "Button secondary."),
    ("secondary-foreground", "#3f2f33", "#f7f3f4", "Texto sobre `secondary`."),
    ("muted", "#f7f3f4", "#241a1e", "Hover de botones outline/ghost, lista de Tabs pill, fila seleccionada, pie de Dialog, Skeleton, `surface-inner`."),
    ("muted-foreground", "#725d62", "#a08a91", "Texto secundario de shadcn (DialogCode, descripciones)."),
    ("accent", "rgba(205, 21, 96, 0.08)", "rgba(235, 63, 133, 0.14)", "Fondo de ítems activos en menús."),
    ("accent-foreground", "#940d44", "#f9dfe9", "Texto sobre `accent`."),
    ("destructive", "#b3261e", "#f07163", "Button destructive (contorno, nunca relleno) y Badge destructive."),
    ("border", "#ece5e7", "#2e2227", "Bordes de tarjetas, tablas y Dialog."),
    ("border-strong", "#9b8c91", "#34272c", "Borde de controles: Input, Select, Button outline."),
    ("input", "#ddd2d5", "#34272c", "Borde de input de shadcn."),
    ("input-bg", "#ffffff", "#120c0e", "Fondo de Input, Select y Button outline."),
    ("ring", "#cd1560", "#eb3f85", "Anillo de foco: `border-ring` + `ring-3 ring-ring/50`."),
    ("overlay", "rgba(40, 29, 32, 0.45)", "rgba(12, 6, 9, 0.66)", "Velo detrás de Dialog y hoja inferior."),
    ("accent-brand", "#b41153", "#eb3f85", "Marca en enlaces y acentos de texto."),
    ("accent-soft", "#940d44", "#f5bad2", "Acento suave de texto."),
    ("accent-bar", "#b41153", "#cd1560", "Barras de acento."),
    ("ink-100", "#f7f3f4", "#2e2225", "Pista de ProgressBar y barras del resumen financiero; tono `neutro`."),
    ("ink-200", "#ece5e7", "#3f3337", "Divisores suaves."),
    ("ink-300", "#ddd2d5", "#4a3d41", "Barra «Programado» del resumen financiero; borde punteado de EmptyState."),
    ("ink-500", "#725d62", "#a08a91", "Etiquetas de sección, encabezados de tabla, códigos, placeholder y barra sin semáforo."),
    ("ink-600", "#725d62", "#947f84", "Texto de apoyo (fechas, IVA, periodo, descripciones de EmptyState)."),
    ("ink-700", "#5a474c", "#c4b2b8", "Texto de cuerpo secundario; tono `neutro`."),
    ("ink-800", "#3f2f33", "#f7f3f4", "Texto base del `body`."),
    ("ink-900", "#281d20", "#f7f3f4", "Valores y títulos: cifras de tablas y tarjetas."),
    ("ink-950", "#191113", "#ffffff", "Cifras grandes (BigValue)."),
    ("rose-50", "#fcf1f5", "rgba(235, 63, 133, 0.14)", "Fondo del tono `activo`."),
    ("rose-100", "#f9dfe9", "#351c24", "Tinte de marca."),
    ("rose-200", "#f5bad2", "#5a2f42", "Fondo de selección de texto."),
    ("rose-400", "#eb3f85", "#eb3f85", "Texto del tono `activo` en oscuro."),
    ("rose-500", "#cd1560", "#cd1560", "Rosa de marca (igual que `primary`)."),
    ("rose-700", "#940d44", "#940d44", "Texto del tono `activo` en claro."),
    ("accent-tint", "{rose-50}", "{rose-50}", "Tinte de acento; alias de `rose-50`."),
    ("exito", "#127c4a", "#4cc38a", "Semáforo verde, tono `exito`, relleno de ProgressBar en banda verde."),
    ("exito-bg", "#e7f5ed", "rgba(76, 195, 138, 0.15)", "Fondo del tono `exito`."),
    ("alerta", "#b45309", "#f0a04b", "Semáforo amarillo, tono `alerta`."),
    ("alerta-bg", "#fef4e6", "rgba(240, 160, 75, 0.15)", "Fondo del tono `alerta`."),
    ("destructivo", "#b3261e", "#f07163", "Semáforo rojo, tonos `riesgo` y `destructivo`, InlineError."),
    ("destructivo-bg", "#fdecea", "rgba(240, 113, 99, 0.15)", "Fondo de los tonos `riesgo` y `destructivo`."),
    ("info", "#1e5fa8", "#6aa6f0", "Tono `info`."),
    ("info-bg", "#eaf2fc", "rgba(106, 166, 240, 0.15)", "Fondo del tono `info`."),
    ("chart-1", "#cd1560", "#e4569a", "Serie 1 de gráficos."),
    ("chart-2", "#e4569a", "#cd1560", "Serie 2 de gráficos."),
    ("chart-3", "#f5bad2", "#f5bad2", "Serie 3 de gráficos."),
    ("chart-4", "#ddd2d5", "#8c757b", "Serie 4 de gráficos."),
    ("chart-5", "#8c757b", "#ddd2d5", "Serie 5 de gráficos."),
    ("sidebar", "#ffffff", "#0d0809", "Fondo de la barra lateral."),
    ("sidebar-foreground", "#281d20", "#f8f2f4", "Texto de la barra lateral."),
    ("sidebar-primary", "#cd1560", "#cd1560", "Ítem activo de la barra lateral."),
    ("sidebar-primary-foreground", "#ffffff", "#ffffff", "Texto sobre `sidebar-primary`."),
    ("sidebar-accent", "rgba(205, 21, 96, 0.08)", "#1b1316", "Hover de la barra lateral."),
    ("sidebar-accent-foreground", "#281d20", "#f8f2f4", "Texto sobre `sidebar-accent`."),
    ("sidebar-border", "#ece5e7", "#2e2227", "Borde de la barra lateral."),
    ("sidebar-ring", "#cd1560", "#cd1560", "Foco en la barra lateral."),
    ("shell-border", "#ece5e7", "#2e2227", "Bordes del marco de la app."),
    ("shell-surface", "#f7f3f4", "#1b1316", "Superficie del marco."),
    ("shell-chip", "#f1eaed", "#2e2225", "Chips del marco."),
    ("shell-kbd", "#ddd2d5", "#382a2e", "Teclas de atajo."),
    ("shell-hover", "rgba(205, 21, 96, 0.04)", "#150e11", "Hover del marco."),
    ("shell-active", "rgba(205, 21, 96, 0.08)", "#1b1316", "Ítem activo del marco."),
    ("shell-text", "#281d20", "#f8f2f4", "Texto del marco."),
    ("shell-muted", "#5a474c", "#c4b2b8", "Texto secundario del marco."),
    ("shell-faint", "#725d62", "#a08a91", "Texto tenue del marco."),
    ("toast-bg", "#ffffff", "#ffffff", "Fondo de los avisos (siempre claro)."),
    ("toast-fg", "#281d20", "#281d20", "Texto de los avisos."),
    ("toast-border", "#ece5e7", "#ece5e7", "Borde de los avisos."),
]
VAL = {n: (l, d) for n, l, d, _ in C}

def resolved(name, theme):
    v = VAL[name][0 if theme == "light" else 1]
    while v.startswith("{"):
        v = VAL[v[1:-1]][0 if theme == "light" else 1]
    return v

def rat(fg, bg, theme):
    bgc = parse(resolved(bg, theme), resolved("panel", theme)) if resolved(bg, theme).startswith("rgba") else parse(resolved(bg, theme))
    fgc = parse(resolved(fg, theme), resolved(bg, theme)) if resolved(fg, theme).startswith("rgba") else parse(resolved(fg, theme))
    return ratio(fgc, bgc)

PAIRS = {
    "ink-500": ["page", "panel"], "ink-600": ["page", "panel"], "ink-700": ["page", "panel"],
    "ink-800": ["page", "panel"], "ink-900": ["page", "panel"], "ink-950": ["panel"],
    "muted-foreground": ["panel"], "primary-foreground": ["primary"],
    "exito": ["exito-bg", "panel"], "alerta": ["alerta-bg", "panel"], "destructivo": ["destructivo-bg", "panel"],
    "info": ["info-bg"], "accent-foreground": ["accent"], "destructive": ["panel"],
}
report = []
tokens_color = []
for n, l, d, u in C:
    if n in PAIRS:
        parts = []
        for bg in PAIRS[n]:
            rl, rd = rat(n, bg, "light"), rat(n, bg, "dark")
            parts.append(f"sobre `{bg}` {rl:.1f}:1 claro / {rd:.1f}:1 oscuro")
            for th, r in (("claro", rl), ("oscuro", rd)):
                if r < 4.5:
                    report.append(f"{n} sobre {bg} ({th}): {r:.2f}:1")
        flag = " Por debajo de 4,5:1 en algún tema: úsalo solo en texto ≥ 19 px en negrita o como marca, o revísalo." if any(
            r < 4.5 for bg in PAIRS[n] for r in (rat(n, bg, "light"), rat(n, bg, "dark"))) else ""
        u = f"{u} Contraste {'; '.join(parts)}.{flag}"
    tokens_color.append({"name": n, "value": {"light": l, "dark": d}, "usage": u})

FAM = {
    "display": "\"Bricolage Grotesque\", system-ui, sans-serif",
    "sans": "\"Instrument Sans\", system-ui, sans-serif",
    "mono": "\"JetBrains Mono\", ui-monospace, monospace",
}
def st(name, size, lh, w, usage, sample, ls=None, family=None):
    s = {"name": name, "fontSize": size, "lineHeight": lh, "fontWeight": w, "usage": usage, "sample": sample}
    if ls: s["letterSpacing"] = ls
    if family: s["family"] = family
    return s

tokens = {
    "name": "Muttu Hub — Proyectos",
    "version": 1,
    "meta": {"source": "code", "repo": "MuttuHub-CRM", "ref": "main@8868f1a",
             "paths": {"tokens": ["src/app/globals.css"], "fonts": ["src/app/layout.tsx"], "assets": ["public/brand/"],
                       "docs": ["src/components/ui/", "src/components/proyectos/ui.tsx", "src/components/crm/shared.tsx"]},
             "synced": "2026-11-05"},
    "color": {"themes": [{"id": "light", "name": "Claro"}, {"id": "dark", "name": "Oscuro"}], "tokens": tokens_color},
    "type": {
        "fonts": [],
        "families": FAM,
        "groups": [
            {"name": "Display", "family": "display", "styles": [
                st("big-value", "22px", 1.5, 800, "Cifra grande de una tarjeta (BigValue), en `ink-950`.", "$ 48.250.000", "-0.03em"),
                st("dialog-title", "26px", 1.25, 600, "Título de Dialog. En el código usa `font-heading`, que globals.css no define: se ve en Instrument Sans.", "Registrar gasto", family="sans"),
            ]},
            {"name": "Texto", "family": "sans", "styles": [
                st("tab-line", "15.5px", 1.5, 600, "Pestañas principales de la ficha (Tabs variant line).", "Actividades"),
                st("button", "14px", 1.43, 500, "Etiqueta de Button (`text-sm`).", "Registrar avance"),
                st("body", "13px", 1.5, 400, "Texto corriente de paneles y descripciones de EmptyState.", "Aún no hay solicitudes de modificación."),
                st("body-sm", "12.5px", 1.5, 400, "Texto denso de listas y selects en escritorio.", "Actividad finalizada: ya no recibe avances."),
                st("caption", "12px", 1.5, 400, "Etiquetas de campo y de métrica (`text-ink-500`/`ink-600`).", "Archivo del soporte"),
                st("caption-sm", "11.5px", 1.5, 400, "Detalle bajo una cifra: periodo, IVA.", "2026-10 · Sin IVA"),
                st("badge", "11px", 1.5, 700, "ToneBadge.", "Umbrales sin confirmar"),
                st("section-label", "11px", 1.5, 700, "SectionHeader: mayúsculas, `ink-500`.", "REQUIERE ATENCIÓN", "0.08em"),
                st("table-head", "12px", 1.33, 700, "Encabezado de tabla: mayúsculas, `ink-500`.", "PROGRAMADO", "0.1em"),
            ]},
            {"name": "Mono", "family": "mono", "styles": [
                st("code", "11px", 1.5, 400, "Códigos de actividad y entregable, `ink-500`, cifras tabulares.", "1.4-E2"),
                st("amount", "13px", 1.5, 600, "Montos en tablas de gastos, `ink-900`.", "$ 1.615.000"),
            ]},
        ],
    },
    "spacing": {"tokens": [
        {"name": "space-1", "value": "4px", "usage": "Paso base de Tailwind (`0.25rem`)."},
        {"name": "space-1-5", "value": "6px", "usage": "Separación entre ícono y texto en botones y chips (`gap-1.5`)."},
        {"name": "space-2", "value": "8px", "usage": "Relleno de celda de tabla (`p-2`)."},
        {"name": "space-2-5", "value": "10px", "usage": "Relleno horizontal de Button e Input (`px-2.5`)."},
        {"name": "space-3", "value": "12px", "usage": "Relleno de MetricTile y KpiCard (`p-3`); Card `size=sm`."},
        {"name": "space-4", "value": "16px", "usage": "Separación entre bloques de un Dialog (`gap-4`); relleno de la hoja inferior."},
        {"name": "space-5", "value": "20px", "usage": "Relleno de Card (`--card-spacing`)."},
        {"name": "space-6", "value": "24px", "usage": "Separación entre secciones de un panel (`gap-6`)."},
        {"name": "dialog-pad-x", "value": "28px", "usage": "Relleno horizontal de Dialog (`px-7`)."},
        {"name": "dialog-pad-y", "value": "26px", "usage": "Relleno vertical de Dialog (`py-[26px]`)."},
        {"name": "touch-target", "value": "44px", "usage": "Alto de controles y objetivo táctil mínimo (`h-11`, `min-h-11`)."},
        {"name": "control-sm", "value": "40px", "usage": "Button sm, Select (`h-10`) y encabezado de tabla."},
        {"name": "control-xs", "value": "36px", "usage": "Button xs (`h-9`)."},
    ]},
    "radius": {"tokens": [
        {"name": "radius-sm", "value": "7.2px", "usage": "`rounded-sm` (0,6 × 12 px)."},
        {"name": "radius-md", "value": "9.6px", "usage": "Pestaña de Tabs, Skeleton (`rounded-md`)."},
        {"name": "radius-lg", "value": "12px", "usage": "Lista de Tabs pill (`rounded-lg` = `--radius`)."},
        {"name": "radius-control", "value": "12px", "usage": "Button, Input y Select (`rounded-12`)."},
        {"name": "radius-inner", "value": "14px", "usage": "Tarjetas internas: MetricTile, KpiCard, EmptyState, `surface-inner`."},
        {"name": "radius-card", "value": "20px", "usage": "Card y `surface`."},
        {"name": "radius-dialog", "value": "22px", "usage": "Dialog y borde superior de la hoja inferior."},
        {"name": "radius-pill", "value": "9999px", "usage": "ToneBadge, StatusChip, pista y relleno de ProgressBar."},
    ]},
    "shadow": {"note": "Las superficies no llevan sombra; se separan con borde.", "tokens": [
        {"name": "shadow-row-selected", "value": {"light": "inset 3px 0 0 #cd1560", "dark": "inset 3px 0 0 #cd1560"}, "usage": "Riel de la fila seleccionada en Table."},
        {"name": "shadow-tab-active", "value": {"light": "0 1px 2px 0 rgba(0, 0, 0, 0.05)", "dark": "0 1px 2px 0 rgba(0, 0, 0, 0.05)"}, "usage": "Pestaña activa en Tabs pill (`shadow-sm`)."},
    ]},
}

# ---------- icons (exact lucide-react 1.30.0 nodes) ----------
def icon(nodes, size=16, sw=1.8):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{nodes}</svg>')
PAPERCLIP = '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>'
HELP = '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'

CSS = r"""@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap");
/* Static renditions of the app's components, hand-written from src/components/ui/** and src/components/proyectos/ui.tsx. */
body { margin: 0; font-family: var(--font-sans); background: var(--page); color: var(--ink-800); -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
.mh-pad { padding: 16px; }
.mh-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mh-col { display: flex; flex-direction: column; gap: 12px; }
.mh-focus:focus-visible, .mh-btn:focus-visible, .mh-input:focus-visible, .mh-select:focus-visible {
  outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent); }

/* Button — src/components/ui/button.tsx:6 */
.mh-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 44px; padding: 0 10px;
  border-radius: var(--radius-control); border: 1px solid transparent; font: 500 14px/1 var(--font-sans); white-space: nowrap; cursor: pointer;
  background: var(--primary); color: var(--primary-foreground); }
.mh-btn:hover { background: color-mix(in srgb, var(--primary) 80%, transparent); }
.mh-btn:active { transform: translateY(1px); }
.mh-btn[disabled] { opacity: .5; pointer-events: none; }
.mh-btn--outline { background: var(--input-bg); color: var(--ink-900); border-color: var(--border-strong); }
.mh-btn--outline:hover, .mh-btn--ghost:hover { background: var(--muted); }
.mh-btn--secondary { background: var(--secondary); color: var(--secondary-foreground); }
.mh-btn--secondary:hover { background: color-mix(in oklch, var(--secondary), var(--foreground) 5%); }
.mh-btn--ghost { background: transparent; color: var(--ink-900); }
.mh-btn--destructive { background: transparent; color: var(--destructive); border-color: var(--destructive); }
.mh-btn--destructive:hover { background: color-mix(in srgb, var(--destructive) 10%, transparent); }
.mh-btn--link { background: transparent; color: var(--primary); padding: 0; height: auto; text-underline-offset: 4px; }
.mh-btn--link:hover { text-decoration: underline; background: transparent; }
.mh-btn--sm { height: 40px; font-size: 12.8px; }
.mh-btn--xs { height: 36px; padding: 0 8px; font-size: 12px; }
.mh-btn--icon { width: 44px; padding: 0; }
.mh-btn svg { width: 16px; height: 16px; flex: none; }
.mh-btn--sm svg { width: 14px; height: 14px; }

/* ToneBadge — src/components/crm/shared.tsx:21 ; StatusChip — src/components/ui/status-chip.tsx:24 */
.mh-tone { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: var(--radius-pill); font: 700 11px/1 var(--font-sans); white-space: nowrap; }
.mh-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--radius-pill); font: 600 12px/1.33 var(--font-sans); white-space: nowrap; }
.mh-chip::before { content: ""; width: 6px; height: 6px; border-radius: 9999px; background: currentColor; }
.t-neutro { background: var(--ink-100); color: var(--ink-700); }
.t-activo { background: var(--rose-50); color: var(--rose-700); }
[data-theme="dark"] .t-activo { color: var(--rose-400); }
.t-info { background: var(--info-bg); color: var(--info); }
.t-riesgo, .t-destructivo { background: var(--destructivo-bg); color: var(--destructivo); }
.t-exito { background: var(--exito-bg); color: var(--exito); }
.t-alerta { background: var(--alerta-bg); color: var(--alerta); }

/* ProgressBar — src/components/ui/progress-bar.tsx:26 */
.mh-progress { height: 8px; border-radius: var(--radius-pill); background: var(--ink-100); overflow: hidden; }
.mh-progress > span { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--ink-500); }
.mh-progress .f-verde { background: var(--exito); } .mh-progress .f-amarillo { background: var(--alerta); }
.mh-progress .f-rojo { background: var(--destructivo); } .mh-progress .f-programado { background: var(--ink-300); }

/* Table — src/components/ui/table.tsx */
.mh-table-wrap { overflow-x: auto; }
.mh-table { width: 100%; border-collapse: collapse; font-size: 14px; color: var(--ink-800); }
.mh-table th { height: 40px; padding: 0 8px; text-align: left; font: 700 12px/1.33 var(--font-sans); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-500); white-space: nowrap; }
.mh-table td { padding: 8px; white-space: nowrap; }
.mh-table tr { height: 44px; border-bottom: 1px solid var(--border); }
.mh-table tbody tr:hover { background: color-mix(in srgb, var(--muted) 50%, transparent); }
.mh-table tr.is-selected { background: var(--muted); box-shadow: var(--shadow-row-selected); }
.mh-table .num { text-align: right; }
.mh-mono { font-family: var(--font-mono); }

/* Tabs — src/components/ui/tabs.tsx */
.mh-tabs-pill { display: inline-flex; align-items: center; height: 32px; padding: 3px; border-radius: var(--radius-lg); background: var(--muted); }
.mh-tabs-pill button { height: 100%; padding: 0 6px; border: 0; border-radius: var(--radius-md); background: transparent; font: 500 14px/1 var(--font-sans); color: var(--ink-700); cursor: pointer; }
.mh-tabs-pill button[aria-selected="true"] { background: var(--background); color: var(--ink-900); box-shadow: var(--shadow-tab-active); }
.mh-tabs-line { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
.mh-tabs-line button { position: relative; padding: 6px 6px 10px; border: 0; background: transparent; font: 600 15.5px/1 var(--font-sans); color: var(--ink-600); cursor: pointer; }
.mh-tabs-line button[aria-selected="true"] { color: var(--ink-900); }
.mh-tabs-line button[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; border-radius: 3px; background: var(--primary); }

/* Surfaces — src/app/globals.css (surface utilities), src/components/ui/card.tsx:5, proyectos/ui.tsx:68 */
.mh-card { border-radius: var(--radius-card); border: 1px solid var(--border); background: var(--card); color: var(--card-foreground); padding: 20px; font-size: 14px; }
.mh-tile { border-radius: var(--radius-inner); border: 1px solid var(--border); background: var(--panel); padding: 12px; }
.mh-tile__label { font-size: 12px; color: var(--ink-500); }
.mh-tile__value { font: 800 22px/1.5 var(--font-display); letter-spacing: -.03em; color: var(--ink-950); }
.mh-tile__row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink-500); }
.mh-tile__row b { font-weight: 600; color: var(--ink-900); }

/* SectionHeader, EmptyState, InlineError — src/components/proyectos/ui.tsx, src/components/ui/empty-state.tsx */
.mh-section { display: flex; align-items: center; gap: 6px; margin: 0; font: 700 11px/1.5 var(--font-sans); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-500); }
.mh-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 140px; padding: 16px; text-align: center;
  border-radius: var(--radius-inner); border: 1px dashed var(--ink-300); background: color-mix(in srgb, var(--ink-100) 40%, transparent); }
.mh-empty--block { min-height: 0; }
.mh-empty__title { font-size: 14px; font-weight: 600; color: var(--ink-800); }
.mh-empty__desc { max-width: 36ch; font-size: 13px; line-height: 1.625; color: var(--ink-600); }
.mh-error { margin: 0; font-size: 13px; color: var(--destructivo); }

/* Form controls — src/components/ui/input.tsx:6, proyectos/ui.tsx:15 (SELECT_CLASS) */
.mh-label { display: block; margin-bottom: 6px; font-size: 12px; color: var(--ink-600); }
.mh-input, .mh-select { box-sizing: border-box; width: 100%; height: 44px; padding: 4px 10px; border-radius: var(--radius-control); border: 1px solid var(--border-strong);
  background: var(--input-bg); color: var(--ink-900); font: 400 14px/1.4 var(--font-sans); }
.mh-select { height: 40px; font-size: 12.5px; }
.mh-input::placeholder { color: var(--ink-500); }
.mh-file { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mh-file__name { font-size: 12.5px; color: var(--ink-600); }
.mh-help { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: 0; padding: 0; border-radius: 9999px; background: transparent; color: var(--ink-500); cursor: pointer; }
.mh-help:hover { color: var(--ink-800); }
.mh-popover { width: 288px; padding: 12px; border-radius: var(--radius-inner); border: 1px solid var(--border); background: var(--popover); font-size: 13px; line-height: 1.625; color: var(--ink-700); }

/* Dialog — src/components/ui/dialog.tsx ; CaptureSurface — src/components/proyectos/capture-surface.tsx:31 */
.mh-overlay { padding: 24px 16px; background: var(--overlay); }
.mh-dialog { max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; padding: 26px 28px; border-radius: var(--radius-dialog); border: 1px solid var(--border); background: var(--popover); color: var(--popover-foreground); }
.mh-dialog__title { margin: 0; font: 600 26px/1.25 var(--font-sans); color: var(--ink-900); }
.mh-dialog__code { font: 400 12px/1 var(--font-mono); letter-spacing: .025em; color: var(--muted-foreground); }
.mh-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; margin: 0 -28px -26px; padding: 16px 28px; border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius-dialog) var(--radius-dialog); background: color-mix(in srgb, var(--muted) 50%, transparent); }
.mh-sheet { max-width: 390px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 16px; border-radius: var(--radius-dialog) var(--radius-dialog) 0 0; border: 1px solid var(--border); background: var(--popover); }
.mh-sheet__grab { align-self: center; width: 40px; height: 4px; border-radius: 9999px; background: var(--ink-300); }
.mh-sheet__title { margin: 0; font: 600 18px/1.3 var(--font-sans); color: var(--ink-900); }

/* Skeleton — src/components/ui/skeleton.tsx:3 */
.mh-skeleton { border-radius: var(--radius-md); background: var(--muted); animation: mh-pulse 2s cubic-bezier(.4,0,.6,1) infinite; }
@keyframes mh-pulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .mh-skeleton { animation: none; } }
"""

def preview(group, height, body, subtitle=""):
    sub = f' subtitle="{subtitle}"' if subtitle else ""
    return (f'<!-- @dsCard group="{group}" height={height}{sub} -->\n<!doctype html>\n<html>\n<head><meta charset="utf-8"></head>\n'
            f'<body>\n{body}\n</body>\n</html>\n')

COMP = {}
COMP["Button"] = (preview("Acciones", 150, f"""<div class="mh-pad mh-col">
  <div class="mh-row">
    <button class="mh-btn">Registrar avance</button>
    <button class="mh-btn mh-btn--outline">{icon(PAPERCLIP)}Adjuntar archivo</button>
    <button class="mh-btn mh-btn--secondary">Opciones avanzadas</button>
    <button class="mh-btn mh-btn--ghost">Cancelar</button>
    <button class="mh-btn mh-btn--destructive">Rechazar</button>
    <button class="mh-btn mh-btn--link">Ver finanzas</button>
  </div>
  <div class="mh-row">
    <button class="mh-btn">Default · 44 px</button>
    <button class="mh-btn mh-btn--outline mh-btn--sm">sm · 40 px</button>
    <button class="mh-btn mh-btn--outline mh-btn--xs">xs · 36 px</button>
    <button class="mh-btn" disabled>Deshabilitado</button>
  </div>
</div>"""), """# Button

Botón de la app: una acción por botón, con un verbo que dice exactamente qué pasa («Registrar avance», «Adjuntar archivo», «Confirmar rechazo»).

Hecho a mano desde `src/components/ui/button.tsx:6` (cva). Clase estática: `mh-btn` + variante + tamaño.

- **Variantes**: `default` (relleno `primary`, solo la acción principal de la vista), `outline` (borde `border-strong` sobre `input-bg`), `secondary`, `ghost`, `destructive` (contorno `destructive`, nunca relleno), `link`.
- **Tamaños**: default y `lg` 44 px (`touch-target`), `sm` 40 px, `xs` 36 px; `icon` 44 × 44. Los botones chicos amplían el área táctil con `after:-inset-*`.
- **Forma**: `radius-control` (12 px), texto `button` (14 px, 500), ícono lucide de 16 px con trazo 1,8.
- **Foco**: borde `ring` y halo de 3 px de `ring` al 50 %.
- El consumidor pone la etiqueta y, si hace falta, un ícono a la izquierda. Una vista lleva un solo botón `default`.
""")
COMP["ToneBadge"] = (preview("Estado", 110, """<div class="mh-pad mh-col">
  <div class="mh-row">
    <span class="mh-tone t-neutro">Anulado</span>
    <span class="mh-tone t-activo">En ejecución</span>
    <span class="mh-tone t-info">Pendiente por revisión</span>
    <span class="mh-tone t-exito">Validado</span>
    <span class="mh-tone t-alerta">Pendiente de soporte</span>
    <span class="mh-tone t-destructivo">Supera el asignado</span>
  </div>
  <div class="mh-row"><span class="mh-tone t-neutro">Umbrales sin confirmar</span><span class="mh-tone t-alerta">Finalizada con retraso</span></div>
</div>"""), """# ToneBadge

Etiqueta de estado en una palabra o frase corta, sin punto, para nombrar el estado de un registro.

Hecho a mano desde `src/components/crm/shared.tsx:21`. Clase: `mh-tone` + `t-<tono>`.

- 24 px de alto, `radius-pill`, estilo `badge` (11 px, 700).
- Tonos (`UiTone`): `neutro` (`ink-100`/`ink-700`), `activo` (`rose-50`/`rose-700`, `rose-400` en oscuro), `info`, `riesgo` y `destructivo` (`destructivo-bg`/`destructivo`), `exito`, `alerta`.
- El texto siempre nombra el estado: el color nunca va solo.
""")
COMP["StatusChip"] = (preview("Estado", 90, """<div class="mh-pad mh-row">
  <span class="mh-chip t-exito">Al día</span>
  <span class="mh-chip t-alerta">Atención</span>
  <span class="mh-chip t-riesgo">En riesgo</span>
  <span class="mh-chip t-neutro">Sin medir</span>
</div>"""), """# StatusChip

Chip de estado con punto de color delante; se usa para estados que se leen de un vistazo (Al día, Atención, En riesgo).

Hecho a mano desde `src/components/ui/status-chip.tsx:24`. Clase: `mh-chip` + `t-<tono>`, mismos tonos que ToneBadge.

- `radius-pill`, 12 px, 600; punto de 6 px en `currentColor`.
- El consumidor da el tono y el texto; el punto refuerza, el texto informa.
""")
COMP["SemaforoChip"] = (preview("Estado", 90, """<div class="mh-pad mh-row">
  <span class="mh-chip t-exito">Semáforo: Verde</span>
  <span class="mh-chip t-alerta">Semáforo: Amarillo</span>
  <span class="mh-chip t-riesgo">Semáforo: Rojo</span>
  <span class="mh-chip t-exito">Verde</span>
</div>"""), """# SemaforoChip

Semáforo técnico o financiero de un proyecto o rubro: un StatusChip cuyo tono sale del color que calcula el servidor.

Hecho a mano desde `src/components/proyectos/semaforo-chip.tsx:18` (tono por `toneFromSemaforo`, `src/lib/estado-tone.ts`).

- verde → `exito`, amarillo → `alerta`, rojo → `destructivo`.
- El texto es siempre la palabra del color, con prefijo opcional («Semáforo: Rojo»).
- Hoy no muestra el número que lo produce; las propuestas de F4 lo agregan al lado, no dentro del chip.
""")
COMP["ProgressBar"] = (preview("Estado", 150, """<div class="mh-pad mh-col" style="max-width:420px">
  <div class="mh-progress" role="progressbar" aria-valuenow="90" aria-label="Avance verde"><span class="f-verde" style="width:90%"></span></div>
  <div class="mh-progress" role="progressbar" aria-valuenow="55" aria-label="Avance amarillo"><span class="f-amarillo" style="width:55%"></span></div>
  <div class="mh-progress" role="progressbar" aria-valuenow="30" aria-label="Avance rojo"><span class="f-rojo" style="width:30%"></span></div>
  <div class="mh-progress" role="progressbar" aria-valuenow="40" aria-label="Sin banda"><span style="width:40%"></span></div>
  <div class="mh-progress" role="progressbar" aria-valuenow="70" aria-label="Programado"><span class="f-programado" style="width:70%"></span></div>
</div>"""), """# ProgressBar

Barra de avance de 8 px; el color del relleno es la banda del semáforo que calcula el servidor.

Hecho a mano desde `src/components/ui/progress-bar.tsx:26`. Clase: `mh-progress` con un `span` de ancho en %.

- Pista `ink-100`, `radius-pill`. Relleno: `exito` (verde), `alerta` (amarillo), `destructivo` (rojo), `ink-500` sin banda.
- En Finanzas › Resumen, la barra «Programado» va en `ink-300` (`f-programado`) y «Ejecutado» en el color de su semáforo.
- Siempre con el porcentaje en texto al lado: la barra sola no basta.
""")
COMP["Table"] = (preview("Datos", 230, """<div class="mh-pad mh-table-wrap">
<table class="mh-table">
  <thead><tr><th>Rubro</th><th class="num">Programado</th><th class="num">Ejecutado</th><th class="num">% de lo programado</th><th>Estado</th></tr></thead>
  <tbody>
    <tr><td>Talento humano</td><td class="num mh-mono">$ 24.000.000</td><td class="num mh-mono">$ 9.672.000</td><td class="num">40,3 %</td><td><span class="mh-chip t-riesgo">Rojo</span></td></tr>
    <tr class="is-selected"><td>Materiales</td><td class="num mh-mono">$ 8.500.000</td><td class="num mh-mono">$ 6.120.000</td><td class="num">72,0 %</td><td><span class="mh-chip t-alerta">Amarillo</span></td></tr>
    <tr><td>Viáticos</td><td class="num mh-mono">$ 3.000.000</td><td class="num mh-mono">$ 2.850.000</td><td class="num">95,0 %</td><td><span class="mh-chip t-exito">Verde</span></td></tr>
  </tbody>
</table></div>"""), """# Table

Tabla de datos densa con cifras alineadas a la derecha.

Hecho a mano desde `src/components/ui/table.tsx`. Clase: `mh-table`; celdas numéricas con `num`; montos con `mh-mono`. Cifras de ejemplo.

- Fila de 44 px con borde inferior `border`; hover `muted` al 50 %; fila seleccionada `muted` + `shadow-row-selected`.
- Encabezado `table-head` (12 px, 700, mayúsculas, `ink-500`), 40 px; celda `p-2`, sin salto de línea, cifras tabulares.
- La prop `numeric` alinea a la derecha encabezado y celda.
- En móvil, las listas largas pasan a tarjetas; la tabla va en un contenedor con desplazamiento horizontal propio.
""")
COMP["MetricTile"] = (preview("Datos", 150, """<div class="mh-pad" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
  <div class="mh-tile"><div class="mh-tile__label">Ejecutado</div><div class="mh-tile__value">$ 18.642.000</div><div class="mh-tile__row"><span>de lo programado</span><b>51,4 %</b></div></div>
  <div class="mh-tile"><div class="mh-tile__label">Avance técnico</div><div class="mh-tile__value">62 %</div><div class="mh-tile__row"><span>Actividades atrasadas</span><b>2</b></div></div>
  <div class="mh-tile"><div class="mh-tile__label">Gastos por validar</div><div class="mh-tile__value">4</div><div class="mh-tile__row"><span>Sin soporte</span><b>1</b></div></div>
</div>"""), """# MetricTile

Tarjeta de cifra: una etiqueta, una cifra grande y filas de detalle; es la pieza de los KPIs de la ficha y el portafolio.

Hecho a mano desde `src/components/proyectos/ui.tsx:68` (MetricTile), `:93` (MetricRow) y `:123` (KpiCard). Cifras de ejemplo.

- `radius-inner` (14 px), borde `border`, fondo `panel`, relleno `space-3`.
- Etiqueta `caption` en `ink-500`; cifra `big-value` en `ink-950`; filas con valor 600 en `ink-900`.
- Una cifra por tarjeta; el detalle explica la cifra, no repite otra.
""")
COMP["Tabs"] = (preview("Navegación", 130, """<div class="mh-pad mh-col">
  <div class="mh-tabs-line" role="tablist"><button role="tab" aria-selected="false">Resumen</button><button role="tab" aria-selected="true">Actividades</button><button role="tab" aria-selected="false">Finanzas</button><button role="tab" aria-selected="false">Documentos</button><button role="tab" aria-selected="false">Historial</button></div>
  <div class="mh-tabs-pill" role="tablist"><button role="tab" aria-selected="true">Resumen</button><button role="tab" aria-selected="false">Gastos · 4</button><button role="tab" aria-selected="false">Presupuesto</button></div>
</div>"""), """# Tabs

Pestañas: `line` para las cinco pestañas de la ficha y `pill` para los segmentos dentro de una pestaña.

Hecho a mano desde `src/components/ui/tabs.tsx` (Base UI). Clases `mh-tabs-line` y `mh-tabs-pill`.

- `line` (por defecto): `tab-line` (15,5 px, 600), activa con subrayado de 3 px en `primary`.
- `pill`: lista de 32 px en `muted`, `radius-lg`; pestaña `radius-md`, 14 px, 500; activa en `background` con `shadow-tab-active`.
- Un segmento puede llevar su contador («Gastos · 4») cuando hay datos.
""")
COMP["SectionHeader"] = (preview("Diseño", 70, """<div class="mh-pad"><h3 class="mh-section">Requiere atención</h3></div>"""), """# SectionHeader

Rótulo de sección dentro de un panel, en mayúsculas pequeñas.

Hecho a mano desde `src/components/proyectos/ui.tsx:27` (h3 por defecto, ícono lucide opcional).

- Estilo `section-label`: 11 px, 700, mayúsculas, espaciado 0,08 em, `ink-500`.
- No lo repitas cuando la pestaña o el segmento ya nombra la sección.
""")
COMP["EmptyState"] = (preview("Diseño", 230, """<div class="mh-pad mh-col">
  <div class="mh-empty"><div class="mh-empty__title">Aún no hay solicitudes de modificación.</div><div class="mh-empty__desc">Cuando alguien del equipo pida un cambio de presupuesto, cronograma o entregables, aparecerá aquí para que Gerencia lo apruebe.</div></div>
  <div class="mh-empty mh-empty--block"><div class="mh-empty__desc">Aún no hay gastos registrados.</div></div>
</div>"""), """# EmptyState

Estado vacío: dice qué aparecerá aquí y, si aplica, cómo se crea lo primero.

Hecho a mano desde `src/components/ui/empty-state.tsx:18` y `EmptyBlock` (`src/components/proyectos/ui.tsx:55`). La descripción larga del ejemplo es una propuesta de texto, no la del código.

- Con borde: punteado `ink-300`, fondo `ink-100` al 40 %, `radius-inner`, alto mínimo 140 px. `EmptyBlock`: sin alto mínimo, 16 px de relleno vertical.
- Título 14 px 600 `ink-800`; descripción `body` en `ink-600`, ancho máximo 36 caracteres.
""")
COMP["InlineError"] = (preview("Formularios", 70, """<div class="mh-pad"><p class="mh-error" role="alert">Adjunta al menos un soporte (archivo o enlace).</p></div>"""), """# InlineError

Error junto al campo o la acción que falló, con qué pasó y cómo corregirlo.

Hecho a mano desde `src/components/proyectos/ui.tsx:59`: `<p role="alert">` de 13 px en `destructivo`.
""")
COMP["Input"] = (preview("Formularios", 130, """<div class="mh-pad mh-col" style="max-width:360px">
  <div><label class="mh-label" for="n">Número de documento</label><input class="mh-input" id="n" placeholder="FV-1001"></div>
  <div><label class="mh-label" for="r">Rubro</label><select class="mh-select" id="r"><option>Talento humano</option><option>Materiales</option></select></div>
</div>"""), """# Input y Select

Campo de texto y select nativo de los formularios de captura.

Hecho a mano desde `src/components/ui/input.tsx:6` y `SELECT_CLASS` (`src/components/proyectos/ui.tsx:15`).

- Input: 44 px, `radius-control`, borde `border-strong`, fondo `input-bg`; 16 px en móvil, 14 px desde md.
- Select: 40 px (`SELECT_CLASS`) o 44 px (`SELECT_CLASS_LG`), 12,5 px en escritorio.
- Etiqueta `caption` en `ink-600` encima del campo, asociada con `for`.
""")
COMP["SelectorArchivo"] = (preview("Formularios", 90, f"""<div class="mh-pad mh-col">
  <div class="mh-file"><button class="mh-btn mh-btn--outline mh-btn--sm">{icon(PAPERCLIP)}Elegir archivo</button><span class="mh-file__name">Ningún archivo elegido</span></div>
  <div class="mh-file"><button class="mh-btn mh-btn--outline mh-btn--sm">{icon(PAPERCLIP)}Elegir archivo</button><span class="mh-file__name">factura-FV-1001.pdf</span></div>
</div>"""), """# SelectorArchivo

Selector de archivo en español: reemplaza el «Choose File · No file chosen» del navegador.

Hecho a mano desde `src/components/proyectos/selector-archivo.tsx`, que está en el PR de grupos 1-2 (rama `fix/proyectos-ux-grupos-1-2`), aún sin mergear.

- Input nativo oculto pero enfocable; un Button `outline` `sm` con ícono Paperclip dice «Elegir archivo»; al lado, el nombre o «Ningún archivo elegido».
- El consumidor da `id` (para su Label), `onChange(file | null)`, `accept`, `disabled` y `inputRef`.
""")
COMP["HelpHint"] = (preview("Formularios", 160, f"""<div class="mh-pad mh-col">
  <div class="mh-row"><span class="mh-tone t-neutro">Umbrales sin confirmar</span><button class="mh-help" aria-label="Umbrales sin confirmar">{icon(HELP)}</button></div>
  <div class="mh-popover">Gerencia aún no ha confirmado los umbrales que deciden el color del semáforo; pueden cambiar.</div>
</div>"""), """# HelpHint

Botón ⓘ que abre una explicación corta junto a un término o estado.

Hecho a mano desde `src/components/ui/help-hint.tsx:11`.

- Disparador de 20 px (área táctil ampliada con `after:-inset-2`), ícono CircleHelp 16 px trazo 1,8, `ink-500` → `ink-800` al pasar.
- Popover de 288 px, 12 px de relleno, texto `body` en `ink-700`.
- Úsalo para explicar, no para esconder información necesaria para decidir.
""")
COMP["Dialog"] = (preview("Superficies", 330, f"""<div class="mh-overlay">
  <div class="mh-dialog" role="dialog" aria-labelledby="t">
    <div><div class="mh-dialog__code">PRY-2026-001</div><h2 class="mh-dialog__title" id="t">Subir documento</h2></div>
    <div><label class="mh-label" for="a">Archivo</label><div class="mh-file"><button class="mh-btn mh-btn--outline mh-btn--sm">{icon(PAPERCLIP)}Elegir archivo</button><span class="mh-file__name">Ningún archivo elegido</span></div></div>
    <div class="mh-dialog__footer"><button class="mh-btn mh-btn--ghost">Cancelar</button><button class="mh-btn">Subir documento</button></div>
  </div>
</div>"""), """# Dialog

Ventana modal para una tarea corta que no merece pantalla propia (subir un documento, exportar, cambiar estado).

Hecho a mano desde `src/components/ui/dialog.tsx`.

- Velo `overlay` con desenfoque; caja `radius-dialog` (22 px), borde `border`, fondo `popover`, relleno 26 × 28 px, ancho máximo 600 px, separación `space-4`.
- Título `dialog-title` (26 px); código opcional encima en `mono`, `muted-foreground`.
- Pie en `muted` al 50 % con borde superior; acciones a la derecha, la principal al final.
""")
COMP["CaptureSurface"] = (preview("Superficies", 330, """<div class="mh-overlay" style="padding-bottom:0">
  <div class="mh-sheet" role="dialog" aria-labelledby="s">
    <div class="mh-sheet__grab"></div>
    <h2 class="mh-sheet__title" id="s">Registrar avance</h2>
    <div><label class="mh-label" for="c">Cantidad</label><input class="mh-input" id="c" value="12"></div>
    <div><label class="mh-label" for="o">Observación</label><input class="mh-input" id="o" placeholder="Qué se hizo"></div>
    <button class="mh-btn">Registrar avance</button>
  </div>
</div>"""), """# CaptureSurface

Contenedor de los formularios de captura (avance, medición, gasto): en línea en escritorio, hoja inferior en móvil.

Hecho a mano desde `src/components/proyectos/capture-surface.tsx:31`. El preview muestra la hoja inferior (menos de 768 px de ancho).

- Hoja: `radius-dialog` arriba, alto máximo 92 % de la pantalla, cuerpo con 16 px a los lados.
- En escritorio no agrega nada: el formulario aparece en su sitio, dentro de la fila.
- Controles de 44 px (`touch-target`) para usarse con el pulgar.
""")
COMP["Card"] = (preview("Superficies", 170, """<div class="mh-pad"><div class="mh-card mh-col">
  <h3 class="mh-section">Estado</h3>
  <div class="mh-row"><span class="mh-chip t-alerta">Atención</span><span style="font-size:13px;color:var(--ink-700)">2 actividades atrasadas · gasto al 51,4 % de lo programado</span></div>
</div></div>"""), """# Card

Superficie principal para agrupar un bloque de la ficha.

Hecho a mano desde `src/components/ui/card.tsx:5` y la utilidad `surface` de `globals.css`. Texto de ejemplo.

- `radius-card` (20 px), borde `border`, fondo `card`, relleno `space-5` (`space-3` con `size="sm"`). Sin sombra.
- Dentro, tarjetas internas (MetricTile) con `radius-inner`.
""")
COMP["Skeleton"] = (preview("Superficies", 110, """<div class="mh-pad mh-col" style="max-width:360px">
  <div class="mh-skeleton" style="height:16px;width:40%"></div><div class="mh-skeleton" style="height:44px"></div><div class="mh-skeleton" style="height:44px"></div>
</div>"""), """# Skeleton

Bloque de carga con pulso, con la forma de lo que va a aparecer.

Hecho a mano desde `src/components/ui/skeleton.tsx:3`: `radius-md`, fondo `muted`, pulso (sin animación con movimiento reducido).
""")

README = """Muttu Hub es el CRM de Muttu · Innovación social. Este sistema cubre el módulo **Proyectos**: ficha del proyecto (Resumen, Actividades, Finanzas, Documentos, Historial), portafolio, asistente de nuevo proyecto e importaciones. Todo valor sale del código de la app; úsalo para que un diseño se pueda implementar sin traducir.

## Voz y textos

- Escribe en **español neutro con «tú»**: «Adjunta al menos un soporte (archivo o enlace).», «Aún no hay gastos registrados.».
- Sin jerga ni siglas en pantalla: nada de «E/P», «E/A», «pp», «Σ A», «v0» o códigos de regla. Di «40,3 % de lo programado», no «E/P 40,3 %».
- Botones con verbo que dice qué pasa: «Registrar avance», «Registrar cantidad», «Adjuntar archivo», «Elegir archivo», «Confirmar rechazo».
- Errores: qué pasó y cómo seguir. Estados vacíos: qué aparecerá aquí y cómo se crea lo primero.
- Números con formato colombiano: `$ 1.615.000`, `40,3 %`, fechas `2026-10-11`, periodos `2026-10`.
- Sin emoji.

## Color

- Fondo de la app `page`; superficies `panel` y `card`; bordes `border`. Las superficies no llevan sombra: se separan con borde.
- Texto: `ink-900` para cifras y títulos, `ink-800` cuerpo, `ink-700` secundario, `ink-600` apoyo, `ink-500` rótulos y códigos.
- Marca: `primary` (`rose-500`, #cd1560) solo para la acción principal de la vista, el foco (`ring`) y la pestaña activa. Nunca para estados.
- Estados: `exito` (semáforo verde), `alerta` (amarillo), `destructivo` (rojo), `info`; cada uno con su `-bg` para chips. El estado siempre va con palabra (y en lo posible con número): **nunca solo color**.
- Tonos de ToneBadge y StatusChip: `neutro`, `activo`, `info`, `riesgo`, `exito`, `alerta`, `destructivo`.

## Tipografía

- Instrument Sans (`sans`) para todo el texto; Bricolage Grotesque (`display`) solo para cifras grandes (`big-value`); JetBrains Mono (`mono`) para códigos (`code`) y montos (`amount`). Se cargan de Google Fonts.
- Escala real: `body` 13 px, `body-sm` 12,5 px, `caption` 12 px, `caption-sm` 11,5 px, `badge` y `section-label` 11 px, `button` 14 px, `tab-line` 15,5 px, `dialog-title` 26 px.
- Cifras siempre tabulares (`font-variant-numeric: tabular-nums`) y alineadas a la derecha en tablas.

## Espacio, forma y tacto

- Controles de 44 px de alto (`touch-target`); `sm` 40 px y `xs` 36 px solo en escritorio y con área táctil ampliada.
- Radios: `radius-control` 12 px (botones, campos), `radius-inner` 14 px (tarjetas internas), `radius-card` 20 px, `radius-dialog` 22 px, `radius-pill` para chips y barras.
- Relleno: Card `space-5`, tarjetas de cifra `space-3`, Dialog 26 × 28 px.
- Foco visible siempre: borde `ring` y halo de 3 px de `ring` al 50 %.
- Contraste mínimo 4,5:1 para texto; las notas de cada color de texto dicen su contraste real. Los pares más justos son `alerta` sobre `alerta-bg` (4,6:1) y `exito` sobre `exito-bg` (4,7:1) en tema claro: no los uses en texto más fino o más chico que el de los chips.

## Móvil

- Los formularios de captura (avance, medición, gasto) abren como hoja inferior (CaptureSurface) por debajo de 768 px.
- Las tablas largas pasan a tarjetas; si una tabla queda, va en un contenedor con desplazamiento horizontal propio.

## Iconografía

- Íconos de **lucide** (`lucide-react` 1.30.0), 16 px (`size-4`), trazo 1,8–1,9; 14 px dentro de botones `sm`. Siempre con texto al lado o con `aria-label`.

## Marca

- Logo a color (`assets/Logos/logo-color.svg`) sobre fondos claros; logo blanco (`logo-blanco.svg`) sobre fondos oscuros o de marca.

## Componentes

Los previews son **réplicas estáticas hechas a mano** desde `src/components/ui/**`, `src/components/proyectos/ui.tsx` y `src/components/crm/shared.tsx`, con las mismas medidas y colores (clases `mh-*` en `components/bundle.css`). No se ejecuta el código React de la app.

## No sincronizado

- Variables fuera de alcance: ninguna omitida de `globals.css`; los fondos `*-bg` y `rose-50` del tema oscuro, que el código escribe con `color-mix(... transparent)`, van como su equivalente exacto en `rgba()`.
- Las fuentes no se copiaron como archivos: la app las carga con `next/font/google` y aquí se cargan de Google Fonts.
- No se construyó el paquete de componentes: los previews son estáticos (ver Componentes). Sin incluir: gráficos (tacómetro, curva S, radar), Gantt, Tablero, menú de la barra lateral y avisos (Sonner).
- `dialog-title` usa `font-heading`, que `globals.css` no define: se ve en Instrument Sans.
"""

LOGOS_README = """# Logos

Logos oficiales copiados de `public/brand/`.

- `logo-color.svg`: isotipo en `rose-500` (#CD1560) con detalles en blanco. Sobre `page`, `panel` o cualquier fondo claro.
- `logo-blanco.svg`: versión en blanco con detalles en `ink-950` (#191113). Sobre fondos oscuros o sobre `primary`.
- `logo-iso.svg` del repo es idéntico a `logo-color.svg`; no se duplicó.
"""

COVER = """<!-- @dsCard height=288 -->
<!doctype html>
<html>
<head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: var(--page); }
  .c { position: relative; width: 960px; height: 288px; overflow: hidden; background: var(--page); }
  svg { position: absolute; inset: 0; }
  .rose { fill: var(--rose-500); } .deep { fill: var(--ink-950); } .tint { fill: var(--rose-200); }
  .track { fill: var(--ink-300); } .verde { fill: var(--exito); } .amarillo { fill: var(--alerta); } .rojo { fill: var(--destructivo); }
  .card { rx: var(--radius-card); } .pill { rx: 4px; }
  .t { position: absolute; left: 40px; bottom: 34px; max-width: 440px; }
  .n { margin: 0; font: 800 64px/.95 var(--font-display); letter-spacing: -.03em; color: var(--ink-950); }
  .g { margin: 12px 0 0; font: 400 14px/1.45 var(--font-sans); color: var(--ink-600); }
</style></head>
<body>
<div class="c">
  <!--
    blocks: rose-500 slab 220x200 (radius-card), ink-950 slab 220x268 bleeding right/bottom, rose-200 tint 220x110 bleeding bottom.
    arrangement: staggered stack right of x=520; the deep slab carries the pattern, the rose slab bleeds off the top.
    pattern: the ProgressBar row (pills of 8px, radius-pill) — the module reads everything as bars coloured by its semáforo; tracks in ink-300, fills exito/alerta/destructivo/rose-500.
    steps: gap 20px (space-5), pill 8px tall at a 24px pitch (space-6), radii radius-card 20px and half-height pills.
  -->
  <svg viewBox="0 0 960 288" width="960" height="288" aria-hidden="true">
    <rect class="rose card" x="520" y="-20" width="220" height="200"/>
    <rect class="tint card" x="520" y="200" width="220" height="110"/>
    <rect class="deep card" x="760" y="40" width="220" height="268"/>
    <g>
      <rect class="track pill" x="784" y="76" width="168" height="8"/><rect class="verde pill" x="784" y="76" width="151" height="8"/>
      <rect class="track pill" x="784" y="100" width="168" height="8"/><rect class="amarillo pill" x="784" y="100" width="92" height="8"/>
      <rect class="track pill" x="784" y="124" width="168" height="8"/><rect class="rojo pill" x="784" y="124" width="50" height="8"/>
      <rect class="track pill" x="784" y="148" width="168" height="8"/><rect class="verde pill" x="784" y="148" width="118" height="8"/>
      <rect class="track pill" x="784" y="172" width="168" height="8"/><rect class="rose pill" x="784" y="172" width="70" height="8"/>
    </g>
  </svg>
  <div class="t">
    <p class="n">Muttu Hub —<br>Proyectos</p>
    <p class="g">El sistema visual del módulo Proyectos, tomado del código de la app.</p>
  </div>
</div>
</body>
</html>
"""

def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

write("tokens.json", json.dumps(tokens, ensure_ascii=False, indent=2))
write("README.md", README)
write("components/bundle.css", CSS)
write("components/Cover/preview.html", COVER)
write("assets/Logos/README.md", LOGOS_README)
for name, (prev, readme) in COMP.items():
    write(f"components/{name}/preview.html", prev)
    write(f"components/{name}/README.md", readme)

now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
index = {
    "v": 3, "layout": "files", "createdOnFiles": {"v": 1, "at": now},
    "title": "Muttu Hub — Proyectos", "namespace": "MuttuHub", "libraries": [],
    "sections": {}, "groups": ["Logos"],
    "assetGroups": {"Logos": {"name": "Logos", "tile": "m", "order": ["logo-color.svg", "logo-blanco.svg"], "files": {
        "logo-color.svg": {"name": "logo-color.svg", "blob": "285d9054cc02f69235d04c5b1b585f07", "size": 3077, "type": "image/svg+xml"},
        "logo-blanco.svg": {"name": "logo-blanco.svg", "blob": "107eadea23abbbec3bdcec8964e7b621", "size": 3077, "type": "image/svg+xml"}}}},
    "blobs": {}, "docs": {"sections": []},
    "lastChange": {"by": "Adrián", "at": now, "via": "Claude Code", "note": "Primera versión desde el código (main@8868f1a): tokens, tipografía, 17 componentes estáticos y logos."},
}
write("design-system.json", json.dumps(index, ensure_ascii=False, indent=2))

print("files:", sum(len(fs) for _, _, fs in os.walk(OUT)))
print("contrast below 4.5:1:")
for r in report:
    print("  ", r)
