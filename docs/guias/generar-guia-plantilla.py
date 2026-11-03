"""Generate the PDF guide for filling in the MuttuHub project import template.

Usage (needs reportlab + svglib):
    python docs/guias/generar-guia-plantilla.py

Output: docs/guias/guia-plantilla-proyectos.pdf

The column names, help texts and validation rules mirror
src/lib/proyectos/plantilla/generate.ts and validate.ts (template version 2026.1).
When the template columns change, update this script and regenerate the PDF.
All example data is fictitious.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "guia-plantilla-proyectos.pdf"
LOGO = ROOT / "public" / "brand" / "logo-color.svg"
VERSION = "2026.1"

ROSA = colors.HexColor("#CD1560")
ROSA_OSCURO = colors.HexColor("#940D44")
ROSA_SUAVE = colors.HexColor("#FDF2F7")
TINTA = colors.HexColor("#191113")
GRIS = colors.HexColor("#725D62")
LINEA = colors.HexColor("#ECE5E7")
ALTERNO = colors.HexColor("#F7F3F4")
ADVERTENCIA = colors.HexColor("#FFF7E6")
ADVERTENCIA_BORDE = colors.HexColor("#E0A526")

# --------------------------------------------------------------------------- styles

def estilo(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=TINTA, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(nombre, **base)


TITULO = estilo("titulo", fontName="Helvetica-Bold", fontSize=24, leading=29, spaceAfter=6)
SUBTITULO = estilo("subtitulo", fontSize=12, leading=17, textColor=GRIS, spaceAfter=14)
H1 = estilo("h1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=ROSA, spaceBefore=6, spaceAfter=8)
H2 = estilo("h2", fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=10, spaceAfter=5)
CUERPO = estilo("cuerpo", spaceAfter=6)
CHICO = estilo("chico", fontSize=8.5, leading=11)
CHICO_BOLD = estilo("chicob", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white)
PASO_NUM = estilo("pasonum", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.white, alignment=1)
CAJA = estilo("caja", fontSize=9.5, leading=13.5)

ANCHO = letter[0] - 4 * cm


def p(texto, s=CUERPO):
    return Paragraph(texto, s)


def tabla(filas, anchos, cabecera=True, tam=CHICO):
    """Branded table: rose header row, zebra body."""
    datos = []
    for i, fila in enumerate(filas):
        estilo_celda = CHICO_BOLD if (cabecera and i == 0) else tam
        datos.append([c if not isinstance(c, str) else Paragraph(c, estilo_celda) for c in fila])
    t = Table(datos, colWidths=anchos, repeatRows=1 if cabecera else 0)
    comandos = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINEA),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    if cabecera:
        comandos += [("BACKGROUND", (0, 0), (-1, 0), ROSA), ("LINEBELOW", (0, 0), (-1, 0), 1, ROSA_OSCURO)]
    inicio = 1 if cabecera else 0
    for i in range(inicio, len(filas)):
        if (i - inicio) % 2 == 1:
            comandos.append(("BACKGROUND", (0, i), (-1, i), ALTERNO))
    t.setStyle(TableStyle(comandos))
    return t


def caja(texto, fondo=ROSA_SUAVE, borde=ROSA, titulo=None):
    contenido = []
    if titulo:
        contenido.append(Paragraph(f"<b>{titulo}</b>", CAJA))
    contenido.append(Paragraph(texto, CAJA))
    t = Table([[contenido]], colWidths=[ANCHO])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fondo),
        ("LINEBEFORE", (0, 0), (0, -1), 3, borde),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def paso(numero, titulo, texto):
    num = Table([[Paragraph(str(numero), PASO_NUM)]], colWidths=[0.9 * cm], rowHeights=[0.9 * cm])
    num.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ROSA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    cuerpo = [Paragraph(f"<b>{titulo}</b>", estilo("pt", fontSize=10.5, leading=14)), Paragraph(texto, CAJA)]
    t = Table([[num, cuerpo]], colWidths=[1.3 * cm, ANCHO - 1.3 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


# --------------------------------------------------------------------------- page frame

_logo = svg2rlg(str(LOGO))


def dibujar_logo(canvas, x, y, alto):
    escala = alto / _logo.height
    canvas.saveState()
    canvas.translate(x, y)
    canvas.scale(escala, escala)
    renderPDF.draw(_logo, canvas, 0, 0)
    canvas.restoreState()


def marco(canvas, doc):
    ancho, alto = letter
    canvas.saveState()
    canvas.setFillColor(ROSA)
    canvas.rect(0, alto - 0.35 * cm, ancho, 0.35 * cm, stroke=0, fill=1)
    dibujar_logo(canvas, 2 * cm, alto - 1.55 * cm, 0.75 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GRIS)
    canvas.drawRightString(ancho - 2 * cm, alto - 1.2 * cm, f"Guía de la plantilla de proyectos · versión {VERSION}")
    canvas.setStrokeColor(LINEA)
    canvas.line(2 * cm, 1.5 * cm, ancho - 2 * cm, 1.5 * cm)
    canvas.drawString(2 * cm, 1.05 * cm, "MuttuHub · Uso interno")
    canvas.drawRightString(ancho - 2 * cm, 1.05 * cm, f"Página {doc.page}")
    canvas.restoreState()


# --------------------------------------------------------------------------- content

def portada():
    h = []
    h.append(Spacer(1, 1.2 * cm))
    h.append(p("Cómo llenar la plantilla de importación de proyectos", TITULO))
    h.append(p(
        "Guía paso a paso para descargar la plantilla de Excel desde MuttuHub, diligenciar sus "
        "nueve hojas y subirla sin errores. Incluye un proyecto de ejemplo completo.",
        SUBTITULO,
    ))
    h.append(p("Qué hace la plantilla", H2))
    h.append(p(
        "La plantilla carga de una sola vez la estructura de un proyecto en <b>Borrador</b>: "
        "objetivos, actividades, entregables, indicadores, presupuesto por rubro, programación "
        "mensual, fechas, líneas estratégicas y municipios. Al confirmar, <b>reemplaza</b> lo que "
        "el borrador tenga en esas secciones. Si el archivo tiene errores, MuttuHub no guarda nada."
    ))
    h.append(p("Antes de empezar", H2))
    h.append(tabla([
        ["Requisito", "Por qué"],
        ["El proyecto está en estado <b>Borrador</b>.",
         "Solo se puede importar la plantilla de un proyecto en Borrador."],
        ["El proyecto tiene <b>fecha de inicio y fecha de fin</b>.",
         "Las fechas definen las semanas y los meses de la plantilla. Sin fechas, el botón de descarga queda deshabilitado."],
        ["El proyecto no tiene avances, mediciones ni registros de beneficiarios.",
         "Si ya los tiene, la estructura no se puede reemplazar."],
        ["Tienes Microsoft Excel (o un programa compatible con .xlsx).",
         "La plantilla usa listas desplegables, fechas y fórmulas de Excel."],
    ], [7 * cm, ANCHO - 7 * cm]))
    h.append(Spacer(1, 10))
    h.append(caja(
        "Cada encabezado de la plantilla tiene una <b>nota de ayuda</b>, marcada con un "
        "<font color='#CD1560'><b>triángulo rojo</b></font> en la esquina superior derecha de la celda. "
        "<b>Pasa el mouse sobre el encabezado</b> para leerla: dice qué escribir y trae un ejemplo.<br/><br/>"
        "Para verlas todas a la vez en Excel: pestaña <b>Revisar</b> &gt; <b>Notas</b> &gt; "
        "<b>Mostrar todas las notas</b>. En la hoja <i>2. Proyecto</i>, cada fila de la columna "
        "<i>Campo</i> también tiene su nota.",
        titulo="Las notas del triángulo rojo",
    ))
    return h


def pasos_muttuhub():
    h = [PageBreak(), p("Paso a paso en MuttuHub", H1)]
    h.append(paso(1, "Abre el proyecto",
        "Entra a <b>Proyectos</b>, abre el proyecto en Borrador y ve a la sección <b>Estructura</b>."))
    h.append(paso(2, "Descarga la plantilla",
        "Pulsa <b>Descargar plantilla</b>. El archivo ya viene con el código y el cliente del proyecto, "
        "las fechas, los 15 rubros del catálogo y una columna por cada mes del proyecto. "
        "Descárgala siempre desde el proyecto que vas a llenar: la plantilla de un proyecto no sirve para otro."))
    h.append(paso(3, "Lee la hoja 1. Instrucciones",
        "Tiene las reglas generales y una tabla de ejemplos. No cambies la celda de versión "
        f"(<b>{VERSION}</b>)."))
    h.append(paso(4, "Llena las hojas en orden",
        "Ve de la hoja 2 a la 8. El orden importa porque cada hoja usa los códigos de la anterior: "
        "las actividades eligen un objetivo y los entregables eligen una actividad. "
        "Usa las listas desplegables siempre que aparezcan. La hoja 9 es solo de consulta."))
    h.append(paso(5, "Guarda el archivo como .xlsx",
        "No lo conviertas a .xls, .csv ni a Google Sheets. El archivo debe pesar menos de 4 MB."))
    h.append(paso(6, "Importa y valida",
        "En la misma sección pulsa <b>Importar plantilla</b>, elige el archivo y pulsa "
        "<b>Validar plantilla</b>. MuttuHub revisa todo sin guardar nada todavía."))
    h.append(paso(7, "Corrige o confirma",
        "<b>Si hay errores</b>, aparecen agrupados por hoja, con la fila y la columna exactas. "
        "Puedes bajarlos con <b>Descargar reporte (.csv)</b>. Corrige el Excel y vuelve al paso 6.<br/>"
        "<b>Si solo hay advertencias</b>, no bloquean: revísalas y pulsa <b>Confirmar importación</b>."))
    h.append(Spacer(1, 6))
    h.append(p("Reglas generales", H2))
    h.append(tabla([
        ["#", "Regla"],
        ["1", "No cambies los nombres de las hojas ni los encabezados de la fila 1."],
        ["2", "Los códigos deben ser únicos dentro de cada hoja (hojas 3 a 6)."],
        ["3", "Usa punto y coma (;) para separar varias líneas estratégicas o municipios."],
        ["4", "Las semanas van de 1 al total de semanas del proyecto."],
        ["5", "Los montos aceptan formato colombiano: 59.500.000 o 1.440.000,50 (máximo dos decimales)."],
        ["6", "Revisa la hoja 9. Catálogos para ver los valores permitidos."],
        ["7", "Cada objetivo necesita al menos una actividad, y cada actividad al menos un entregable."],
    ], [1 * cm, ANCHO - 1 * cm]))
    return h


def hoja(titulo, intro, columnas, ejemplo, anchos_ejemplo, notas=None):
    bloque = [p(titulo, H1), p(intro)]
    bloque.append(p("Qué va en cada columna", H2))
    bloque.append(tabla([["Columna", "Qué escribir", "Ejemplo"]] + columnas,
                        [3.6 * cm, ANCHO - 7.6 * cm, 4 * cm]))
    bloque.append(p("Así queda llena (ejemplo)", H2))
    bloque.append(tabla(ejemplo, anchos_ejemplo))
    if notas:
        bloque.append(Spacer(1, 8))
        bloque.append(caja(notas))
    return bloque


def hojas():
    h = [PageBreak()]
    h += hoja(
        "Hoja 2. Proyecto",
        "Datos generales del proyecto. Tiene dos columnas: <b>Campo</b>, una etiqueta fija que no se "
        "cambia, y <b>Valor</b>, donde escribes. Solo se llena la columna B.",
        [
            ["Código", "<b>No cambiar.</b> Debe coincidir con el código del proyecto (PRY-AAAA-NNN).", "PRY-2026-001"],
            ["Cliente", "Informativo: el cliente no cambia al importar.", "Cliente Ejemplo S.A.S."],
            ["Líneas estratégicas", "Código - nombre, separados por «; ». Deben existir en la hoja 9. Mínimo una.", "LE-01 - Educación; LE-02 - Salud"],
            ["Municipios", "Nombre (Departamento), separados por «; ». Deben existir en la hoja 9. Mínimo uno.", "Manizales (Caldas)"],
            ["Fecha de inicio", "Una fecha real de Excel, no un texto. Define la semana 1.", "05/10/2026"],
            ["Fecha de fin", "Una fecha real de Excel, posterior a la de inicio. Define la duración en semanas.", "29/01/2027"],
            ["Valor total", "Valor en pesos, mayor que cero. Debe ser igual a la suma del presupuesto (hoja 7).", "120.000.000"],
            ["Meta de beneficiarios", "Número entero mayor que cero.", "300"],
        ],
        [
            ["Campo", "Valor"],
            ["Código", "PRY-2026-001"],
            ["Cliente", "Cliente Ejemplo S.A.S."],
            ["Líneas estratégicas", "LE-01 - Educación; LE-02 - Salud"],
            ["Municipios", "Manizales (Caldas); Chinchiná (Caldas)"],
            ["Fecha de inicio", "05/10/2026"],
            ["Fecha de fin", "29/01/2027"],
            ["Valor total", "120.000.000"],
            ["Meta de beneficiarios", "300"],
        ],
        [5 * cm, ANCHO - 5 * cm],
        "<b>Ojo con las fechas:</b> los meses de la hoja 8 se arman con las fechas del proyecto al "
        "momento de descargar. Si cambias las fechas, guárdalas primero en el proyecto y descarga la "
        "plantilla de nuevo, para que la programación tenga los meses correctos.",
    )
    h.append(PageBreak())
    h += hoja(
        "Hoja 3. Objetivos",
        "Los objetivos del proyecto. Cada uno tiene un código que después usan las hojas 4 y 6.",
        [
            ["Código", "Código único del objetivo, de 3 a 50 caracteres.", "O1"],
            ["Descripción", "Qué logra el objetivo, en una frase.", "Fortalecer las capacidades productivas…"],
        ],
        [
            ["Código", "Descripción"],
            ["O1", "Fortalecer las capacidades productivas de las unidades de negocio"],
            ["O2", "Mejorar el acceso a mercados de los productores"],
        ],
        [2.5 * cm, ANCHO - 2.5 * cm],
        "Cada objetivo de esta hoja debe tener <b>al menos una actividad</b> en la hoja 4, "
        "o la plantilla no pasa la validación.",
    )
    h.append(Spacer(1, 6))
    h += hoja(
        "Hoja 4. Actividades",
        "Lo que se hace para cumplir cada objetivo, y en qué semanas.",
        [
            ["Código", "Código único de la actividad.", "1.1"],
            ["Código objetivo", "Elige en el desplegable un objetivo de la hoja 3.", "O1"],
            ["Nombre", "Nombre de la actividad.", "Caracterización de las unidades productivas"],
            ["Semana inicio", "Semana en que inicia, de 1 a la duración del proyecto.", "1"],
            ["Semana fin", "Semana en que termina. Mayor o igual a la de inicio.", "4"],
            ["Responsable (correo)", "Correo de un usuario registrado en MuttuHub. Si no existe, la actividad queda sin responsable (advertencia).", "ana@muttu.co"],
        ],
        [
            ["Código", "Código objetivo", "Nombre", "Semana inicio", "Semana fin", "Responsable (correo)"],
            ["1.1", "O1", "Caracterización de las unidades productivas", "1", "4", "ana@muttu.co"],
            ["1.2", "O1", "Talleres de formación técnica", "5", "12", "ana@muttu.co"],
            ["2.1", "O2", "Ruedas de negocio", "10", "16", "luis@muttu.co"],
        ],
        [1.3 * cm, 2.1 * cm, 5.2 * cm, 1.8 * cm, 1.7 * cm, ANCHO - 12.1 * cm],
    )
    h.append(PageBreak())
    h += hoja(
        "Hoja 5. Entregables",
        "Lo que produce cada actividad. Cada actividad de la hoja 4 necesita <b>al menos un entregable</b>.",
        [
            ["Código", "Código único del entregable.", "1.1-E1"],
            ["Código actividad", "Elige en el desplegable una actividad de la hoja 4.", "1.1"],
            ["Descripción", "Qué se entrega.", "Informe de caracterización"],
            ["Cantidad", "Cantidad esperada, mayor que cero.", "4"],
            ["Unidad", "Unidad de medida. La lista sugiere opciones, pero puedes escribir otra.", "Acta"],
        ],
        [
            ["Código", "Código actividad", "Descripción", "Cantidad", "Unidad"],
            ["1.1-E1", "1.1", "Informe de caracterización", "1", "Informe"],
            ["1.2-E1", "1.2", "Talleres de formación realizados", "8", "Taller"],
            ["2.1-E1", "2.1", "Actas de rueda de negocio", "2", "Acta"],
        ],
        [2 * cm, 2.6 * cm, ANCHO - 9.2 * cm, 2 * cm, 2.6 * cm],
    )
    h += hoja(
        "Hoja 6. Indicadores",
        "Cómo se mide el avance de cada objetivo.",
        [
            ["Código", "Código único del indicador.", "IND-1"],
            ["Código objetivo", "Elige en el desplegable un objetivo de la hoja 3.", "O1"],
            ["Nombre", "Nombre del indicador.", "Productores con plan de mejora"],
            ["Meta", "Valor esperado, mayor que cero.", "30"],
            ["Línea base", "Valor inicial del indicador (opcional).", "0"],
        ],
        [
            ["Código", "Código objetivo", "Nombre", "Meta", "Línea base"],
            ["IND-1", "O1", "Productores con plan de mejora", "30", "0"],
            ["IND-2", "O2", "Acuerdos comerciales firmados", "5", "0"],
        ],
        [2 * cm, 2.6 * cm, ANCHO - 8.4 * cm, 1.6 * cm, 2.2 * cm],
    )
    h.append(PageBreak())
    h += hoja(
        "Hoja 7. Presupuesto",
        "Los 15 rubros del catálogo ya vienen cargados. Solo escribes el <b>Valor asignado</b>; "
        "deja en 0 los rubros que no uses.",
        [
            ["Código rubro", "Rubro del catálogo (desplegable). Ya viene lleno.", "R01"],
            ["Rubro", "Nombre del rubro. Solo informativo, no lo cambies.", "Personal"],
            ["Valor asignado", "Monto en pesos, puede ser 0. Máximo dos decimales.", "60.000.000"],
        ],
        [
            ["Código rubro", "Rubro", "Valor asignado"],
            ["R01", "Personal", "60.000.000"],
            ["R02 a R07", "(sin uso en este ejemplo)", "0"],
            ["R08", "Formación", "40.000.000"],
            ["R09 a R11", "(sin uso en este ejemplo)", "0"],
            ["R12", "Transporte", "20.000.000"],
            ["R13 a R15", "(sin uso en este ejemplo)", "0"],
            ["", "<b>Suma</b>", "<b>120.000.000</b>"],
        ],
        [3 * cm, ANCHO - 7 * cm, 4 * cm],
        "La suma del presupuesto debería ser igual al <b>Valor total</b> de la hoja 2. "
        "Si no coinciden, MuttuHub muestra una advertencia y toma la suma del presupuesto como valor total.",
    )
    h.append(PageBreak())
    h += hoja(
        "Hoja 8. Programación",
        "Reparte el valor de cada rubro entre los meses del proyecto. Hay una columna "
        "<b>Mes k (AAAA-MM)</b> por cada mes, según las fechas del proyecto.",
        [
            ["Código rubro", "Rubro del catálogo. Ya viene lleno.", "R01"],
            ["Rubro", "Nombre del rubro. Solo informativo.", "Personal"],
            ["Mes 1 (2026-10)…", "Monto del rubro en ese mes. La fila debe sumar el Valor asignado de la hoja 7.", "15.000.000"],
            ["Total", "<b>Fórmula, no la modifiques.</b> Suma los meses de la fila.", "60.000.000"],
            ["Control", "<b>Fórmula, no la modifiques.</b> Total menos Valor asignado. Debe quedar en 0.", "0"],
        ],
        [
            ["Rubro", "Mes 1 (2026-10)", "Mes 2 (2026-11)", "Mes 3 (2026-12)", "Mes 4 (2027-01)", "Total", "Control"],
            ["R01 Personal", "15.000.000", "15.000.000", "15.000.000", "15.000.000", "60.000.000", "0"],
            ["R08 Formación", "0", "15.000.000", "15.000.000", "10.000.000", "40.000.000", "0"],
            ["R12 Transporte", "0", "5.000.000", "5.000.000", "10.000.000", "20.000.000", "0"],
        ],
        [2.6 * cm] + [(ANCHO - 2.6 * cm - 1.5 * cm) / 5] * 5 + [1.5 * cm],
        "Antes de subir el archivo, revisa que <b>toda la columna Control esté en 0</b>. Si un rubro "
        "muestra otro valor, su programación no cuadra con el presupuesto y la plantilla no pasa la validación.",
    )
    h.append(Spacer(1, 10))
    h.append(p("Hoja 9. Catálogos (solo consulta)", H1))
    h.append(p(
        "Lista los valores permitidos que alimentan los desplegables: <b>Rubros</b> (hojas 7 y 8), "
        "<b>Líneas estratégicas</b> y <b>Municipios</b> activos (hoja 2) y <b>Unidades</b> sugeridas "
        "(hoja 5). No escribas en esta hoja: si una línea o municipio que necesitas no aparece, "
        "pide a un administrador que lo active en MuttuHub y descarga la plantilla de nuevo."
    ))
    return h


def errores():
    h = [PageBreak(), p("Errores frecuentes y cómo corregirlos", H1)]
    h.append(p("Estos son mensajes reales del validador. Cada error indica la hoja, la fila y la columna."))
    h.append(tabla([
        ["Mensaje", "Qué pasó", "Cómo corregirlo"],
        ["El código de la plantilla no coincide con el del proyecto.",
         "Se subió la plantilla de otro proyecto, o se cambió el código de la hoja 2.",
         "Descarga la plantilla desde el proyecto correcto y no edites el código."],
        ["La versión de la plantilla debe ser " + VERSION + ".",
         "Se cambió la celda de versión de la hoja 1, o es una plantilla vieja.",
         "Descarga una plantilla nueva desde MuttuHub."],
        ["El código está repetido en esta hoja.",
         "Dos filas de la misma hoja tienen el mismo código.",
         "Deja un código distinto en cada fila."],
        ["El objetivo «O1» no existe en la hoja 3. Objetivos.",
         "Una actividad o un indicador apunta a un objetivo que no está en la hoja 3.",
         "Elige el código en el desplegable, o crea el objetivo en la hoja 3."],
        ["El objetivo «O2» no tiene actividades.",
         "Hay un objetivo sin ninguna actividad.",
         "Agrega al menos una actividad para ese objetivo, o borra el objetivo."],
        ["La actividad «1.2» no tiene entregables.",
         "Hay una actividad sin ningún entregable.",
         "Agrega al menos un entregable para esa actividad en la hoja 5."],
        ["La semana inicial / final debe ser un número entero.",
         "Hay un texto o un decimal en las columnas de semanas.",
         "Escribe solo números enteros, de 1 a la duración del proyecto."],
        ["La programación de R08 suma X pero el presupuesto asigna Y.",
         "La fila de la hoja 8 no suma lo asignado en la hoja 7 (Control distinto de 0).",
         "Ajusta los meses hasta que Control quede en 0."],
        ["La línea estratégica / el municipio «…» no existe o está suspendido.",
         "El texto no coincide exactamente con el catálogo.",
         "Cópialo tal cual desde la hoja 9 y sepáralo con «; »."],
        ["La fecha de fin debe ser posterior a la fecha de inicio.",
         "Las fechas de la hoja 2 están invertidas o son textos.",
         "Escribe fechas reales de Excel (dd/mm/aaaa) y revisa el orden."],
        ["El valor asignado no es un monto válido.",
         "El monto tiene letras, símbolos o más de dos decimales.",
         "Usa 59.500.000 o 1.440.000,50, sin el signo $."],
    ], [5.3 * cm, 5.4 * cm, ANCHO - 10.7 * cm]))
    h.append(Spacer(1, 8))
    h.append(caja(
        "<b>El responsable «correo» no está registrado</b>: la actividad se guarda sin responsable.<br/>"
        "<b>El presupuesto suma X y el valor total es Y</b>: se importa la suma del presupuesto como valor total.<br/>"
        "Revísalas, pero puedes confirmar la importación igual.",
        fondo=ADVERTENCIA, borde=ADVERTENCIA_BORDE, titulo="Advertencias (no bloquean la importación)",
    ))
    h.append(Spacer(1, 4))
    h.append(KeepTogether([
        p("Lista de chequeo antes de subir", H2),
        tabla([
            ["#", "Revisa que…"],
            ["1", "No cambiaste nombres de hojas, encabezados, la versión ni el código del proyecto."],
            ["2", "Cada objetivo tiene al menos una actividad y cada actividad al menos un entregable."],
            ["3", "Las semanas están entre 1 y la duración del proyecto, con inicio menor o igual a fin."],
            ["4", "Las líneas estratégicas y los municipios están copiados de la hoja 9, separados por «; »."],
            ["5", "La suma del presupuesto (hoja 7) es igual al Valor total (hoja 2)."],
            ["6", "Toda la columna Control de la hoja 8 está en 0."],
            ["7", "Guardaste el archivo como .xlsx y pesa menos de 4 MB."],
        ], [0.8 * cm, ANCHO - 0.8 * cm]),
    ]))
    return h


def main():
    doc = SimpleDocTemplate(
        str(OUT), pagesize=letter,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.2 * cm, bottomMargin=2 * cm,
        title="Guía de la plantilla de importación de proyectos",
        author="MuttuHub", subject=f"Plantilla de proyectos, versión {VERSION}",
    )
    historia = portada() + pasos_muttuhub() + hojas() + errores()
    doc.build(historia, onFirstPage=marco, onLaterPages=marco)
    print(OUT)


if __name__ == "__main__":
    main()
