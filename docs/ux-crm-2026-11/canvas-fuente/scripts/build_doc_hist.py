"""Builds the Documentos and Historial boards of the canvas and registers them in canvas.json."""
import json
from pathlib import Path

P = Path("/tmp/claude-1000/-mnt-c-Users-Adrian-Documents-MuttuHub-CRM/ed405048-23c1-4b81-956c-4ca0e47c2e0d/scratchpad/canvas/project")

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&amp;family=Instrument+Sans:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap">'
BASE_CSS = """body{margin:0}
a{color:#b41153;text-underline-offset:3px}a:hover{color:#940d44}
th{height:36px;padding:0 12px;text-align:left;font:700 11px/1.3 "Instrument Sans",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#725d62;white-space:nowrap}
td{padding:10px 12px;font-size:13.5px;border-top:1px solid #ece5e7;vertical-align:top}"""


def page(title, w, h, body, tokens=True):
    link = '<link rel="stylesheet" href="muttu-tokens.css">\n' if tokens else ""
    helmet = f"{FONTS}\n<style>\n{BASE_CSS}\n</style>" if tokens else "<style>\nbody{margin:0}\n</style>"
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
{link}</head>
<body>
<x-dc>
<helmet>
{helmet}
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


BTN = "height: 44px; padding: 0 14px; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--input-bg); color: var(--ink-900); font: 500 14px/1 var(--font-sans);"
BTN_SM = "height: 36px; padding: 0 12px; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--input-bg); color: var(--ink-900); font: 500 13px/1 var(--font-sans); white-space: nowrap;"
BTN_PRIMARY = "height: 44px; padding: 0 16px; border-radius: var(--radius-control); border: 0; background: var(--primary); color: var(--primary-foreground); font: 600 14px/1 var(--font-sans);"
LABEL = "font: 700 11px/1.5 var(--font-sans); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
INFO_BTN = '<button aria-label="{label}" style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; background: transparent; color: var(--ink-700); vertical-align: middle;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></button>'


def info(label):
    return INFO_BTN.format(label=label)


def pill(text, kind="muted"):
    colors = {
        "muted": "background: var(--muted); color: var(--ink-700);",
        "exito": "background: var(--exito-bg); color: var(--exito);",
        "alerta": "background: var(--alerta-bg); color: var(--alerta);",
        "destructivo": "background: var(--destructivo-bg); color: var(--destructivo);",
        "info": "background: var(--info-bg); color: var(--info);",
    }[kind]
    return f'<span style="display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 9999px; {colors} font: 700 11px/1 var(--font-sans); white-space: nowrap;">{text}</span>'


def chip(text, on=False):
    style = ("border: 1px solid var(--ink-900); background: var(--ink-900); color: #ffffff;" if on
             else "border: 1px solid var(--border-strong); background: var(--input-bg); color: var(--ink-800);")
    return f'<button aria-pressed="{"true" if on else "false"}" style="height: 36px; padding: 0 12px; border-radius: 9999px; {style} font: 500 13px/1 var(--font-sans); white-space: nowrap;">{text}</button>'


def anota(n):
    return f'<span class="anota">{n}</span>'


def header(active):
    tabs = []
    for t in ["Resumen", "Actividades", "Finanzas", "Documentos · 10" if active == "Documentos" else "Documentos", "Historial"]:
        on = t.startswith(active)
        style = "color: var(--ink-900); box-shadow: inset 0 -3px 0 #cd1560;" if on else "color: var(--ink-600);"
        tabs.append(f'<button role="tab" aria-selected="{"true" if on else "false"}" style="padding: 8px 8px 12px; border: 0; background: transparent; font: 600 15.5px/1 var(--font-sans); {style}">{t}</button>')
    return f"""  <div style="display: flex; align-items: center; justify-content: space-between;">
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <span style="font: 400 12px/1 var(--font-mono); color: var(--ink-500);">PRY-2026-001</span>
      <span style="font: 600 20px/1.2 var(--font-sans); color: var(--ink-900);">Demo CedeTextil · En ejecución</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button style="{BTN}">Registrar gasto</button>
      <button style="{BTN_PRIMARY}">Registrar avance</button>
    </div>
  </div>
  <div role="tablist" aria-label="Secciones del proyecto" style="display: flex; gap: 4px; border-bottom: 1px solid var(--border);">
    {"".join(tabs)}
  </div>
"""


def frame(w, h, inner):
    return f"""<div style="width: {w}px; height: {h}px; box-sizing: border-box; padding: 16px; background: var(--page); color: var(--ink-800); font-family: var(--font-sans);">
<main style="box-sizing: border-box; border-radius: var(--radius-card); border: 1px solid var(--border); background: var(--panel); padding: 24px 28px; display: flex; flex-direction: column; gap: 18px;">
{inner}
</main>
</div>"""


def captures(w, h, imgs):
    tags = "\n".join(
        f'  <img src="{src}" alt="{alt}" style="display: block; width: {iw}px; height: {ih}px;">' for src, alt, iw, ih in imgs)
    return f'<div style="width: {w}px; height: {h}px; background: #f6f1f3; display: flex; flex-direction: column; gap: 40px;">\n{tags}\n</div>'


DOC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>'
LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path></svg>'


def doc_row(nombre, origen_link, origen_extra, quien="Laura Jiménez", fecha="02 nov 2026", extra_pill=""):
    return f"""        <tr>
          <td><div style="display: flex; align-items: center; gap: 10px;"><span style="color: var(--ink-600);" title="Archivo PDF">{DOC_ICON}</span><b style="font-weight: 600; color: var(--ink-900);">{nombre}</b></div></td>
          <td><a href="#">{origen_link}</a><span style="display: block; font-size: 12.5px; color: var(--ink-600);">{origen_extra}</span></td>
          <td>{extra_pill}</td>
          <td style="white-space: nowrap;">{quien}<span style="display: block; font-size: 12.5px; color: var(--ink-600);">{fecha}</span></td>
          <td style="text-align: right;"><button style="{BTN_SM}"><span style="display: inline-flex; align-items: center; gap: 6px;">{LINK_ICON} Abrir</span></button></td>
        </tr>"""


def doc_table(caption, count, rows, extra=""):
    return f"""  <section style="display: flex; flex-direction: column; gap: 8px;">
    <h2 style="margin: 0; {LABEL}">{caption} · {count} {extra}</h2>
    <div style="border-radius: 12px; border: 1px solid var(--border); overflow: hidden;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: var(--muted);"><tr><th style="width: 30%;">Documento</th><th>De dónde viene</th><th style="width: 150px;">Estado</th><th style="width: 160px;">Subió</th><th style="width: 100px;"></th></tr></thead>
        <tbody>
{rows}
        </tbody>
      </table>
    </div>
  </section>"""


def documentos_propuesta():
    ent = "\n".join([
        doc_row("Acta de acompañamiento 2", "1.3 · Acompañamiento técnico", "Entregable E1 · Acta de acompañamiento"),
        doc_row("Acta de acompañamiento 1", "1.3 · Acompañamiento técnico", "Entregable E1 · Acta de acompañamiento"),
        doc_row("Informe de la formación", "1.2 · Formación en confección", "Entregable E1 · Informe de la formación"),
        doc_row("Memoria de la jornada", "1.1 · Caracterización", "Entregable E2 · Memoria de la jornada"),
        doc_row("Informe de caracterización", "1.1 · Caracterización", "Entregable E1 · Informe de caracterización"),
    ])
    gas = "\n".join([
        doc_row("Factura FV-4007", "Gasto FV-4007 · $ 450.000", "Material de oficina para las jornadas", extra_pill=pill("Supera lo asignado", "destructivo")),
        doc_row("Factura FV-3002", "Gasto FV-3002 · $ 450.000", "Transporte de participantes a la jornada"),
        doc_row("Factura FV-2040", "Gasto FV-2040", "Anticipo de dotación de máquinas y herramientas"),
        doc_row("Factura FV-1001", "Gasto FV-1001", "Jornada de formación en prácticas de confección"),
        doc_row("Cuenta de cobro CC-0001", "Gasto CC-0001", "Honorarios del equipo técnico, primera quincena"),
    ])
    inner = header("Documentos") + f"""
  <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <h1 style="margin: 0; font: 600 18px/1.3 var(--font-sans); color: var(--ink-900);">Documentos del proyecto {info("Qué documentos aparecen aquí")} {anota(1)}</h1>
      <span style="font-size: 13.5px; color: var(--ink-700);">Los soportes de entregables, gastos, indicadores y del proyecto, en una sola lista.</span>
    </div>
    <button style="{BTN_PRIMARY}">Subir documento</button>
  </div>

  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
    {chip("Todos · 10", True)}{chip("Entregables · 5")}{chip("Gastos · 5")}{chip("Indicadores · 0")}{chip("Del proyecto · 0")} {anota(2)}
    <div style="margin-left: auto; display: flex; align-items: center; gap: 8px; height: 40px; width: 300px; box-sizing: border-box; padding: 0 12px; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--input-bg); color: var(--ink-500); font-size: 14px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>Buscar por nombre o código
    </div>
  </div>

{doc_table("Soportes de entregables", 5, ent, anota(3))}

{doc_table("Soportes de gastos", 5, gas)}

  <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--radius-inner); border: 1px dashed var(--ink-300); font-size: 13px; color: var(--ink-600);">
    <b style="color: var(--ink-800);">Indicadores y Del proyecto no tienen documentos.</b> Los soportes de las mediciones se adjuntan desde Actividades › Indicadores; los del proyecto (convenio, actas de inicio), con «Subir documento». {anota(4)}
  </div>
"""
    return page("Propuesta · Documentos", 1440, 1110, frame(1440, 1110, inner))


def evento(hora, quien, frase, detalle="", tipo=("Avance", "info"), enlace="", tachado=False):
    det = f'<span style="font-size: 13px; line-height: 1.55; color: var(--ink-700);">{detalle}</span>' if detalle else ""
    link = f'<a href="#" style="font-size: 13px; white-space: nowrap;">{enlace}</a>' if enlace else ""
    return f"""      <li style="display: grid; grid-template-columns: 84px 28px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid var(--border);">
        <span style="font: 400 12.5px/1.6 var(--font-mono); color: var(--ink-600);">{hora}</span>
        <span aria-hidden="true" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9999px; background: var(--muted); font: 700 11px/1 var(--font-sans); color: var(--ink-700);">{"".join(p[0] for p in quien.split()[:2])}</span>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 14px; line-height: 1.5; color: var(--ink-900);"><b style="font-weight: 600;">{quien}</b> {frase} {pill(tipo[0], tipo[1])}</span>
          {det}
        </div>
        {link}
      </li>"""


def dia(titulo, eventos):
    return f"""    <section style="display: flex; flex-direction: column;">
      <h3 style="margin: 0 0 4px; font: 600 13px/1.5 var(--font-sans); color: var(--ink-600);">{titulo}</h3>
      <ul style="margin: 0; padding: 0; list-style: none;">
{eventos}
      </ul>
    </section>"""


def subtabs(active):
    out = []
    for t in ["Registro de cambios", "Solicitudes de modificación · 0", "Versiones del plan · 1"]:
        on = t.startswith(active)
        style = "background: var(--background); box-shadow: var(--shadow-tab-active); color: var(--ink-900);" if on else "background: transparent; color: var(--ink-700);"
        out.append(f'<button role="tab" aria-selected="{"true" if on else "false"}" style="padding: 0 14px; border: 0; border-radius: var(--radius-md); {style} font: 500 14px/1 var(--font-sans);">{t}</button>')
    return f'<div role="tablist" aria-label="Historial" style="display: inline-flex; align-self: flex-start; height: 38px; padding: 3px; border-radius: var(--radius-lg); background: var(--muted);">{"".join(out)}</div>'


def historial_propuesta():
    d5 = "\n".join([
        evento("9:50 p. m.", "Laura Jiménez", "registró <b>50 %</b> en la actividad <a href=\"#\">1.3</a>, con fecha 05 nov.",
               "«Se realizaron las visitas técnicas a las unidades.»", enlace="Ver actividad"),
        evento("9:31 p. m.", "Laura Jiménez", "registró <b>90 %</b> en la actividad <a href=\"#\">1.1</a>, con fecha 11 oct.",
               "«Caracterización ejecutada en las unidades; pendiente cargar el informe y la memoria.»", enlace="Ver actividad"),
        evento("9:31 p. m.", "Laura Jiménez", "anuló el reporte de <b>30 %</b> del 02 nov.",
               "Motivo: «Reporte de prueba anterior; se reemplaza por el avance real al cierre de la actividad.» Ya no cuenta para el avance.",
               tipo=("Anulación", "alerta"), enlace="Ver actividad"),
        evento("7:53 p. m.", "Laura Jiménez", "anuló el reporte de <b>30 %</b> del 04 nov.",
               "Motivo: «Reporte de prueba de la verificación AJ-01.» Ya no cuenta para el avance.",
               tipo=("Anulación", "alerta"), enlace="Ver actividad"),
        evento("7:52 p. m.", "Laura Jiménez", "registró <b>30 %</b>, con fecha 05 nov.",
               "«Prueba de verificación AJ-01: se registra como integrante no responsable.»", enlace="Ver actividad"),
    ])
    d3 = evento("12:30 p. m.", "Mateo Salazar", "registró <b>30 %</b>, con fecha 03 nov.", "«Avance del proyecto.»", enlace="Ver actividad")
    d2 = "\n".join([
        evento("10:10 a. m.", "Laura Jiménez", "registró el gasto <b>FV-4007</b> por <b>$ 450.000</b> en el rubro Varios (R11).",
               "Papelería y Suministros del Sinú · Material de oficina para las jornadas · Octubre 2026 · Sin IVA · 1 soporte.",
               tipo=("Gasto", "muted"), enlace="Ver gasto"),
        f"""      <li style="padding: 12px 0 0; border-top: 1px solid var(--border);"><button style="{BTN_SM}">Ver 9 cambios más de este día</button></li>""",
    ])
    inner = header("Historial") + f"""
  {subtabs("Registro de cambios")}

  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
    <span style="font-size: 13px; color: var(--ink-600);">Mostrar:</span>
    {chip("Todo", True)}{chip("Avances")}{chip("Gastos")}{chip("Anulaciones")}{chip("Cambios del plan")} {anota(2)}
    <button style="{BTN_SM} margin-left: auto;">Persona: todas ▾</button>
  </div>

  <div style="display: flex; flex-direction: column; gap: 20px;">
{dia("Jueves 05 nov 2026 " + anota(1), d5)}
{dia("Martes 03 nov 2026", d3)}
{dia("Lunes 02 nov 2026 " + anota(3), d2)}
  </div>
"""
    return page("Propuesta · Historial › Registro de cambios", 1440, 1000, frame(1440, 1000, inner))


def versiones_propuesta():
    inner = header("Historial") + f"""
  {subtabs("Versiones del plan")}

  <div style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; align-items: start;">
    <section style="display: flex; flex-direction: column; gap: 10px;">
      <h2 style="margin: 0; font: 600 16px/1.3 var(--font-sans); color: var(--ink-900);">Versiones del plan {info("Qué es una versión del plan")} {anota(1)}</h2>
      <div style="display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: var(--radius-inner); border: 1px solid var(--border); background: var(--panel);">
        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <span style="display: flex; align-items: center; gap: 8px;"><b style="font-size: 15px; color: var(--ink-900);">Versión original</b>{pill("Línea base", "info")}{pill("Vigente", "exito")}</span>
          <span style="font-size: 13px; color: var(--ink-700);">Aprobada por Camila Restrepo el 02 nov 2026. Es el plan contra el que se mide el avance programado.</span>
        </div>
        <button style="{BTN_SM}">Ver el plan</button>
      </div>
      <div style="padding: 14px 16px; border-radius: var(--radius-inner); border: 1px dashed var(--ink-300); font-size: 13px; line-height: 1.6; color: var(--ink-600);">
        Cuando Gerencia apruebe una solicitud de modificación, aquí aparecerá la versión 1 y podrás compararla con la original. {anota(2)}
      </div>
    </section>

    <section style="display: flex; flex-direction: column; gap: 10px;">
      <h2 style="margin: 0; font: 600 16px/1.3 var(--font-sans); color: var(--ink-900);">Cómo cambia el plan {anota(3)}</h2>
      <ol style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px;">
        <li style="display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; line-height: 1.5; color: var(--ink-800);"><b style="font: 600 12px/1 var(--font-mono); color: var(--ink-500);">1</b> El equipo pide el cambio (presupuesto, cronograma o entregables) en «Solicitudes de modificación».</li>
        <li style="display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; line-height: 1.5; color: var(--ink-800);"><b style="font: 600 12px/1 var(--font-mono); color: var(--ink-500);">2</b> Gerencia la aprueba o la rechaza, con su motivo.</li>
        <li style="display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; line-height: 1.5; color: var(--ink-800);"><b style="font: 600 12px/1 var(--font-mono); color: var(--ink-500);">3</b> Si se aprueba, nace una versión nueva del plan; la original queda guardada.</li>
      </ol>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 6px; padding: 20px 16px; border-radius: var(--radius-inner); border: 1px dashed var(--ink-300); text-align: center;">
        <b style="font-size: 14px; color: var(--ink-800);">Aún no hay solicitudes de modificación</b>
        <span style="max-width: 40ch; font-size: 13px; line-height: 1.6; color: var(--ink-600);">Aquí aparecen los cambios de presupuesto, cronograma o entregables que pide el equipo.</span>
        <button style="{BTN_SM}">Solicitar modificación</button>
      </div>
    </section>
  </div>
"""
    return page("Propuesta · Historial › Versiones y solicitudes", 1440, 570, frame(1440, 570, inner))


files = {
    "Documentos-hoy.dc.html": page("Hoy · Documentos", 1440, 1356, captures(1440, 1356, [
        ("/_blob/3d7ad7979a837222f3d5fcf803909f46", "Captura real de la pestaña Documentos del proyecto PRY-2026-001 en escritorio", 1440, 1356)]), tokens=False),
    "Historial-hoy.dc.html": page("Hoy · Historial (tres subpestañas)", 1440, 2180, captures(1440, 2180, [
        ("/_blob/1b463768d63aa8c33dbe88389b39d602", "Captura real de Historial › Modificaciones: vacío", 1440, 700),
        ("/_blob/6e03168ab5abecaf79fb67506d5babd1", "Captura real de Historial › Versiones: una versión v0 y un comparador vacío", 1440, 700),
        ("/_blob/fe04c662670ba78087f51df1cd449068", "Captura real de Historial › Auditoría en escritorio: solo marcadores de carga", 1440, 700)]), tokens=False),
    "Historial-movil-hoy.dc.html": page("Hoy · Historial › Auditoría (móvil)", 390, 2200, captures(390, 2200, [
        ("/_blob/43ec084e558bd3ca116ff445c6d9c3b6", "Captura real de Historial › Auditoría en móvil: volcado de campos", 390, 2200)]), tokens=False),
    "Documentos-propuesta.dc.html": documentos_propuesta(),
    "Historial-propuesta.dc.html": historial_propuesta(),
    "Versiones-propuesta.dc.html": versiones_propuesta(),
}
for name, html in files.items():
    (P / name).write_text(html, encoding="utf-8")

canvas = json.loads((P / "canvas.json").read_text(encoding="utf-8"))
pages = [p for p in canvas["pages"] if p["id"] not in ("documentos", "historial")]
idx = next(i for i, p in enumerate(pages) if p["id"] == "ayudas")
pages[idx:idx] = [{"id": "documentos", "name": "4 · Documentos"}, {"id": "historial", "name": "5 · Historial"}]
for p in pages:
    if p["id"] == "ayudas":
        p["name"] = "6 · Ayudas y novedades"
canvas["pages"] = pages

boards = {
    "Documentos-hoy.dc.html": dict(x=0, y=0, w=1440, h=1356, title="Hoy · Documentos (escritorio)", page="documentos"),
    "Documentos-propuesta.dc.html": dict(x=1520, y=0, w=1440, h=1110, title="Propuesta · Documentos", page="documentos"),
    "Historial-hoy.dc.html": dict(x=0, y=0, w=1440, h=2180, title="Hoy · Historial › Modificaciones, Versiones y Auditoría", page="historial"),
    "Historial-movil-hoy.dc.html": dict(x=1520, y=0, w=390, h=2200, title="Hoy · Auditoría (móvil)", page="historial"),
    "Historial-propuesta.dc.html": dict(x=1990, y=0, w=1440, h=1000, title="Propuesta · Registro de cambios", page="historial"),
    "Versiones-propuesta.dc.html": dict(x=3510, y=0, w=1440, h=570, title="Propuesta · Versiones y solicitudes", page="historial"),
}
canvas["boards"].update(boards)
order = [o for o in canvas["order"] if o not in boards]
cut = order.index("Ayudas-patron.dc.html")
canvas["order"] = order[:cut] + list(boards) + order[cut:]

notes = {
    "t-documentos": dict(x=0, y=-300, text="4 · Documentos — encontrar y revisar los soportes del proyecto", kind="title1", maxW=2960, page="documentos"),
    "c-documentos": dict(x=1520, y=1190, w=460, fill="orange", page="documentos", text=(
        "Qué cambia\n"
        "① Título y una línea que dicen qué hay; ⓘ para el detalle.\n"
        "② Filtros con su número: se ve de un vistazo qué grupo tiene documentos y cuál está vacío.\n"
        "③ Tabla compacta en lugar de tarjetas: los 10 documentos caben en una pantalla (hoy ocupan casi dos). «De dónde viene» enlaza a la actividad o al gasto, y la columna Estado avisa lo que importa (FV-4007 supera lo asignado).\n"
        "④ Los grupos vacíos dicen por qué y dónde se suben sus documentos.\n"
        "Se quita la etiqueta «Enlace» repetida en cada fila: no ayuda a decidir.")),
    "i-documentos": dict(x=2020, y=1190, w=480, fill="blue", page="documentos", text=(
        "Ayuda ⓘ de este tablero\n"
        "Documentos del proyecto: «Aquí ves todos los soportes del proyecto. Cada uno se sube desde donde nace: el avance de un entregable, un gasto o una medición. Usa «Subir documento» solo para los del proyecto, como el convenio o el acta de inicio.»")),
    "f-documentos": dict(x=2540, y=1190, w=420, fill="pink", page="documentos", text=(
        "Para decidir con la PO\n"
        "• «Subir documento» hoy no dice a qué queda asociado el archivo. Propuesta: que suba solo documentos del proyecto y que los demás se suban desde su origen.\n"
        "• ¿Hace falta ver qué entregables aún no tienen soporte desde aquí, o basta con «Qué falta» del Resumen?\n"
        "• Los nombres de las actividades de la columna «De dónde viene» son ilustrativos; al implementar salen del plan.")),
    "t-historial": dict(x=0, y=-300, text="5 · Historial — qué cambió, quién y por qué", kind="title1", maxW=4950, page="historial"),
    "c-historial": dict(x=1990, y=1080, w=480, fill="orange", page="historial", text=(
        "Qué cambia\n"
        "① «Auditoría» pasa a «Registro de cambios» y abre primero, porque es la subpestaña con datos. Cada entrada es una frase: quién hizo qué, sobre qué actividad o gasto, y un enlace para ir allí. Agrupado por día.\n"
        "② Filtros por tipo y por persona.\n"
        "③ Las anulaciones dicen qué se anuló y por qué, sin texto tachado ni campos en inglés («Anulado at»).\n"
        "Los gastos se resumen en una línea legible; el número del tercero ya no aparece enmascarado a medias.\n"
        "Versiones: «v0» pasa a «Versión original (línea base)»; el comparador se oculta mientras haya una sola versión, y se explica cómo cambia el plan.")),
    "i-historial": dict(x=2510, y=1080, w=480, fill="blue", page="historial", text=(
        "Ayudas ⓘ de este tablero\n"
        "Versiones del plan: «El plan aprobado de actividades, cronograma y presupuesto. Cada modificación aprobada crea una versión nueva; la original queda guardada para comparar.»\n"
        "Anulación: «Un reporte anulado deja de contar para el avance, pero queda en el registro con su motivo.»")),
    "f-historial": dict(x=3030, y=1080, w=400, fill="pink", page="historial", text=(
        "Hallazgos y decisiones\n"
        "• En escritorio, la Auditoría seguía mostrando solo marcadores de carga cuando se tomó la captura; en móvil sí cargó (8.584 px de alto). Hay que verificar si tarda demasiado.\n"
        "• La Auditoría actual no dice a qué actividad pertenece cada avance. La propuesta lo muestra; las actividades 1.3 y 1.1 de los dos primeros se dedujeron de las observaciones y hay que confirmarlas.\n"
        "• ¿El registro debe verlo todo rol o solo Coordinación y Gerencia?")),
}
canvas["notes"].update(notes)
(P / "canvas.json").write_text(json.dumps(canvas, ensure_ascii=False, indent=2), encoding="utf-8")
print("ok", len(files), "boards;", [p["name"] for p in canvas["pages"]])
