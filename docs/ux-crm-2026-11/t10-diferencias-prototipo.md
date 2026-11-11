# T10 — Diferencias entre la ficha y el prototipo clicable

Fecha: 2026-11-08. Rama `fix/proyectos-ficha-prototipo` (base `d748bbc`). Se comparó la app (PRY-2026-001, base
local recién sembrada) con `docs/ux-crm-2026-11/prototipo-ficha/` a 1440 px y 390 px. Las capturas están en
`.claude/qa/t10/`, que git ignora. Las diferencias que son solo de datos de ejemplo no se cuentan.

Tamaños: **S** menos de 30 min, **M** de 30 a 90 min, **L** más de 90 min. Marcas: **API** necesita datos que hoy no
llegan; **PO** necesita una decisión; **Seed** se arregla en la siembra demo.

## Cabecera común (afecta a todas las pestañas)

| # | Diferencia | Tamaño |
|---|---|---|
| C1 | Enlace de texto «← Proyectos» en vez del botón «Volver a proyectos» | S |
| C2 | Quitar el chip de estado junto al código; el prototipo no lo tiene | S |
| C3 | Acciones de escritorio: «Registrar gasto», «Registrar avance» (principal), «⋯». «Cambiar estado» va dentro de «⋯» (ya en T13) | S |
| C4 | Acciones por pestaña: en Actividades y Finanzas solo «Registrar gasto», en la cabecera y en la barra fija del celular | S |
| C5 | Barra fija del celular: el orden es «Registrar gasto \| Registrar avance»; la app lo invierte | S |
| C6 | Contador «Documentos · N» en la pestaña | S–M |
| C7 | Aviso de Novedades: va arriba de todo, con chip «Novedades», «Ver qué cambió» en línea, y también en Finanzas | M |
| C8 | Formato de fecha «05 oct 2026» / «al 05 nov» en vez de «05 de oct de 2026» (Resumen, Finanzas, panel) | S |
| C9 | Chips sin punto delante (estado, «Vencida…», pills del Registro, «Línea base», «Vigente», «Verde») | S |
| C10 | Chip o filtro activo oscuro (ink) en vez de rosa (Documentos, Historial) | S |
| C11 | Tarjetas blancas con borde en vez de `surface-inner` (Resumen, Finanzas, Historial, Versiones) | S |
| C12 | Enlaces subrayados («Ver actividades», «Ver finanzas», «Ver todos los gastos», «Ver 2 entregables», «N archivos») | S |

## Resumen

| # | Diferencia | Tamaño |
|---|---|---|
| R1 | Barras de cifras: riel gris con la marca de «programado» encima | S–M |
| R2 | Negritas: «de **77,3 %** programado» sí; la nota de Gasto no | S |
| R3 | «Qué falta»: una tarjeta por fila con el botón a la derecha | M |
| R4 | «Qué falta»: orden vencida → gasto → sin soporte → indicadores | S–M |
| R5 | «Qué falta», avance sin soporte: título «Avance del {fecha} · {actividad}» | M, API |
| R6 | «Qué falta», indicadores: nombre en negrita | S |
| R7 | Sin permiso para actuar: «Ver gasto» / «Ver avance» / «Ver actividad» con foco en el elemento | M |
| R8 | «Le toca a {responsable}» no aparece: la actividad sembrada no tiene responsable integrante | Seed |
| R9 | Datos del proyecto: etiqueta a la izquierda y valor a la derecha; líneas en texto plano; municipios sin departamento | S |
| R10 | Equipo: «Equipo · N» con «Agregar integrante» en hoja lateral; avatar con iniciales; no se puede quitar al responsable | M |

## Actividades

| # | Diferencia | Tamaño |
|---|---|---|
| A1 | Filtro «Mostrar:» en la fila de Lista/Cronograma/Tablero, a la derecha (escritorio) | S–M |
| A2 | Indicadores: tarjeta siempre abierta con (?), «X de Y · Z %», última medición, barra y «Registrar medición» | M |
| A3 | «Opciones avanzadas» (línea base, curva S) no existe en el prototipo | PO |
| A4 | «Responsable: {nombre}» en la tarjeta (mismo origen que R8) | Seed |
| A5 | Unidades «4 actas», «1 plan» (minúscula y plural) | S, Seed |
| A6 | «Objetivo 1.» en vez de «Objetivo OE1.» | S, PO |
| A7 | Celular: «N archivos» y «Registrar cantidad» en la misma fila | S |
| A8 | «Historial de avances» no aparece en la 1.3 aunque marca 25 % registrado | S–M, revisar API/seed |

## Finanzas

| # | Diferencia | Tamaño |
|---|---|---|
| F1 | Control Resumen / Gastos / Presupuesto compacto, alineado a la izquierda | S |
| F2 | Cifras clave: etiquetas en mayúsculas pequeñas, importe en letra display, tarjetas blancas | S |
| F3 | Chip «Umbrales sin confirmar» no existe en el prototipo | PO |
| F4 | Aviso de retraso: «(35,7 % de 77,3 %)» al final | M, API |
| F5 | Aviso de retraso: franja beige, sin icono, texto normal | S |
| F6 | «Gastos por validar»: «Revisar» con contorno; icono de documento en Soporte; importes en sans tabular | S |
| F7 | «Por rubro»: porcentajes en sans tabular y negrita; nombre del rubro en semibold | S |
| F8 | Rol sin permiso: botón «Ver» que abre el panel en modo consulta | M |
| F9 | Panel: lateral de 920 px con la ficha detrás, no diálogo a pantalla completa | M |
| F10 | Panel: vista previa del soporte y «Abrir en otra pestaña» | L, API |
| F11 | Panel: validar un gasto que supera lo asignado (el prototipo lo permite con aviso) | M–L, PO + API |
| F12 | Panel: pie fijo con «Rechazar / Validar gasto»; en celular «‹ 1 de 3 ›» en el cuerpo | S–M |
| F13 | Panel: caja del rubro con línea separadora e importe a la derecha; dos columnas en celular; activo en rosa | S |
| F14 | Panel: texto «le corresponde a Gerencia (y no a quien registró el gasto)» | S |

## Documentos (T11)

| # | Diferencia | Tamaño |
|---|---|---|
| D1 | Contador «Documentos · N» (= C6) | S–M |
| D2 | Etiqueta visible «Filtrar por origen» | S |
| D3 | Chip activo oscuro (= C10); chips de 40 px (44 px en celular) | S |
| D4 | Icono de archivo delante del nombre | S |
| D5 | Sufijo «(PDF)»: viene de los nombres en `scripts/seed-projects-demo.ts`, no de la interfaz | Seed |
| D6 | «De dónde viene» como enlace, con segunda línea (actividad y entregable, gasto y monto, indicador y nombre) | L, API |
| D7 | Columna «Estado» («Gasto rechazado», «Supera lo asignado») | M–L, API |
| D8 | «Subió» en dos líneas (escritorio) | S |
| D9 | «Del proyecto» con segunda línea según el tipo (archivo o enlace) | S |
| D10 | Título del grupo «Documentos del proyecto · N» en vez de «Soportes del proyecto» | S |
| D11 | Explicación de grupos vacíos: caja gris, primera frase en negrita, enlace a Indicadores, redacción del prototipo | S |
| D12 | Búsqueda sin resultados: «Ningún documento coincide con «q».» y «Limpiar búsqueda» | S |
| D13 | Proyecto sin documentos: segunda frase y botón «Subir documento» | S |
| D14 | Tipografía de título, subtítulo y grupo; «Abrir» de 44 px; icono de eliminar siempre rojo | S |
| D15 | Celular: una tarjeta con borde por documento; degradado de chips en los dos lados | S |
| D16 | Búsqueda también por nombre de archivo y código corto («E1») | S |

## Historial

| # | Diferencia | Tamaño |
|---|---|---|
| H1 | Barra de segmentos compacta; 16 px antes del contenido (en Versiones queda pegada) | S |
| H2 | Espacio doble en «Solicitudes  de modificación» y «Versiones  del plan» | S |
| H3 | Filtros «MOSTRAR:» y «Persona:»; en celular, chips debajo de Mostrar y Persona a todo el ancho | S |
| H4 | Entrada: hora en monoespaciada de 12,5 px, avatar `rose-50` (hoy casi invisible), frase de 14 px, detalle en `ink-700` de 13,5 px | S |
| H5 | Entrada en celular: avatar, nombre y hora arriba; frase y pill debajo | M |
| H6 | Enlace «Ver gasto» sin número de factura | S |
| H7 | Enlaces «Ver documento», «Ver versiones», «Ver solicitudes» | M, API |
| H8 | Anulación: «Ya no cuenta para el avance.» con (?) (sin verificar en captura) | S |
| H9 | Versiones: «Ver el plan» (panel de solo lectura) y «Comparar con la original» | L, API |
| H10 | Versiones: tarjeta blanca, título de 16 px y texto de 14 px; «Cómo cambia el plan» con fondo y círculos de 26 px | S |
| H11 | Vacío de solicitudes y aviso «Cuando Gerencia apruebe…»: tamaños del prototipo | S |

## Resumen de la lista

- La mayoría son ajustes S de interfaz. Los transversales (C1–C12) conviene hacerlos una sola vez.
- Necesitan API: R5, F4, F10, F11, D6, D7, H7, H9.
- Necesitan una decisión de la PO: A3, A6, F3, F11.
- Se arreglan en la siembra demo: R8/A4, A5, D5; A8 hay que revisarlo antes de decidir.
