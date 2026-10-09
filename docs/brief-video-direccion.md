# Brief de video — Muttu Hub para dirección (todo el CRM)

Documento para producir un video corto con Claude Motion. Fecha del brief: 2026-10-09. Rama de referencia: `feat/projects-v2` (trabajo local, aún sin publicar).
Fuentes: inventario de código, guías (`docs/guia-demo.md`, `docs/guia-prueba-proyectos.md`), PRD v2 (`docs/Muttu_Hub_PRD_v2.md`), manual de identidad v2 y el video "Novedades v2".
Todo lo que aparece abajo como "se muestra" fue verificado en el código o en las guías; lo que no, está en la sección 7.

## 1. Objetivo, audiencia y formato

- **Objetivo:** que la gerencia entienda en un minuto qué es Muttu Hub, qué resuelve y qué ya funciona.
- **Audiencia:** presidencia y gerencia. Lenguaje de negocio, sin términos técnicos.
- **Duración sugerida:** 75 a 85 segundos (el video "Novedades v2" dura 46 s). 16:9, 1280x720, 30 fps, sin audio: cada escena lleva un titular en pantalla.
- **Idioma y voz:** español colombiano, tuteo, verbos en los botones y en los titulares (regla del manual). Titulares de 8 palabras o menos.
- **Tema visual:** claro por defecto y oscuro con un clic (como en el manual). Una sola escena en oscuro.

## 2. Historia en tres líneas

1. **Antes:** Muttu vendía y ejecutaba proyectos en un Excel compartido: sin trazabilidad, compromisos sin dueño y ninguna vista consolidada.
2. **Ahora:** un solo lugar conecta clientes, oportunidades, tareas, documentos y proyectos.
3. **Resultado:** de la oportunidad ganada a un proyecto controlado, con semáforos, gastos y versiones, todo auditado.

## 3. Identidad (resumen del manual v2)

- **Fondo claro:** `#F6F1F3`; tarjetas y barra lateral blancas; texto `#281D20`. **Oscuro:** fondo `#120C0E`, tarjetas `#1B1316`, texto `#F8F2F4`.
- **Rosa de marca:** `#CD1560` (relleno de botón primario, texto blanco). Acento en claro `#B41153`, en oscuro `#EB3F85`. El rojo del semáforo no se confunde con el magenta.
- **Semáforos:** verde `#127C4A`/`#4CC38A`, amarillo `#B45309`/`#F0A04B`, rojo `#B3261E`/`#F07163`, info `#1E5FA8`/`#6AA6F0`. Los chips llevan punto y etiqueta, nunca solo color.
- **Tipografías:** Bricolage Grotesque (títulos, 700-800), Instrument Sans (cuerpo), JetBrains Mono (códigos y cifras).
- **Forma:** radios 26 (marco), 20-22 (tarjetas), 12 (botones y campos); controles de 44 px; sin sombras.
- **Logo:** el logo de Muttu con "Hub". El manual pide que la frase "Innovación social" acompañe al logo grande (en la intro y el cierre).
- **Movimiento (del video v2):** las barras crecen, las cifras cuentan hasta su valor, la curva se dibuja, las tarjetas pasan de columna, la ventana de la app entra con un fundido y escala suave. Fondo de las escenas de intro y cierre con manchas radiales rosa. Respetar "reducir movimiento".

## 4. Escenas

| # | Tiempo | Escena | Titular en pantalla | Qué se muestra (ruta) | Movimiento |
|---|---|---|---|---|---|
| 0 | 0-4 s | Intro | Muttu Hub. Vender y ejecutar en un solo lugar. | Logo y frase "Innovación social" | Fondo rosa radial, logo entra con fundido |
| 1 | 4-9 s | El problema | Del Excel compartido a un solo lugar | Un Excel genérico que se desvanece hacia la app | Transición entre ambos |
| 2 | 9-15 s | Inicio | Todo tu equipo, de un vistazo | `/` pestañas Pipeline comercial, Gestión de tareas, Actividad de clientes, Mi resumen | KPIs cuentan, embudo se llena |
| 3 | 15-22 s | Clientes | Cada cliente, su historia completa | `/clientes` Tarjetas y ficha con 7 pestañas (General, Contactos, Oportunidades, Compromisos, Bitácora, Documentos, Tareas) | Cambio de vista, apertura de ficha |
| 4 | 22-30 s | De oportunidad a proyecto | Gana una oportunidad. Conviértela en proyecto. | Oportunidad Ganada, botón "Convertir en proyecto", llega `PRY-2026-001` | Tarjeta pasa a Ganada, aparece el código |
| 5 | 30-37 s | El proyecto | Estructura, presupuesto y línea base | `/proyectos/<id>` pestañas Estructura (Gantt) y Presupuesto, importar plantilla Excel, "Aprobar línea base" | Barras del Gantt crecen, chip pasa a "En ejecución" |
| 6 | 37-44 s | Ejecución y gastos | Avance real y gastos bajo control | Pestañas Avance y Gastos, gasto validado y alerta de sobreejecución | Barras de avance, campana con alerta |
| 7 | 44-51 s | Semáforos | Verde, amarillo o rojo: sin adivinar | `/proyectos?vista=tablero` con semáforos técnico y financiero y exportar a Excel | Cifras cuentan, chips aparecen |
| 8 | 51-56 s | Tareas | Cada tarea, su responsable | `/tablero` Kanban | Tarjetas arrastradas entre columnas |
| 9 | 56-61 s | Documentos y roles | Cada quien ve lo que le corresponde | `/documentos` y un cambio de rol (Colaborador no ve Legal) | Una categoría desaparece |
| 10 | 61-65 s | Claro y oscuro | Claro por defecto, oscuro con un clic | Botón del tema en la cabecera | Cambio de tema |
| 11 | 65-72 s | Lo que viene | Próximamente | Texto sobre fondo de marca: exportar a PDF, cerrar o suspender proyectos, carga asistida de brief, resumen diario por correo | Aparecen una a una |
| 12 | 72-78 s | Cierre | Muttu Hub. Todo el equipo, en el mismo lugar. | Logo con "Innovación social" | Fundido a la marca |

## 5. Cifras reales de la demo (datos ficticios: verificar en pantalla antes de grabar)

- **Clientes:** 12 clientes (los 7 estados), 24 contactos, 24 entradas de bitácora. Ejemplos: Fundación Horizonte Nuevo, Agencia de Cooperación Nórdica, Alcaldía de Puerto Esperanza.
- **Oportunidades:** 10, de unos 912 millones de pesos en total (Ganada, Perdida y abiertas).
- **Tareas:** 20 en 7 estados; dos con un PDF adjunto real.
- **Documentos:** 8, uno por categoría; el "Informe trimestral de gestión" tiene 2 versiones.
- **Usuarios demo:** 4 roles (Administrador, Gerencia, Coordinador, Colaborador).
- **Proyecto `PRY-2026-001` "Demo CedeTextil · En ejecución":** 4 actividades, 7 entregables, 2 indicadores, presupuesto de $177.360.000, 5 avances, 3 mediciones, 5 gastos (2 validados, 3 registrados, uno con alerta de sobreejecución en el rubro R11). Semáforos en verde.
- **Proyecto `PRY-2026-002` "Demo CedeTextil · Borrador":** misma estructura, sin aprobar, para mostrar "Aprobar línea base" en vivo.
- **Oportunidad libre:** "Demo · Programa de formación técnica (ganada, lista para convertir)" para la escena 4.

## 6. Lo que NO debe aparecer como terminado

- **Publicación:** todo está en local; el módulo de Proyectos aún no está desplegado. No decir "en producción".
- **PDF:** los proyectos exportan solo a Excel; el CRM y el dashboard imprimen a PDF desde el navegador, no generan un archivo.
- **Cerrar, suspender o cancelar** un proyecto: no existe en la interfaz.
- **Umbrales de los semáforos:** están sin confirmar por el dueño de producto (chip "No confirmado"); no presentarlos como definitivos.
- **Compromisos:** son tareas con origen CRM, no un registro aparte. **Carga asistida de brief:** no existe.
- **Búsqueda con ⌘K:** solo filtra los nombres del menú; no busca clientes ni tareas. No llamarla "búsqueda global".
- **Territorio:** no hay desglose por territorio; el municipio es solo un filtro.
- **Tablero de tareas:** ya no hay "Mi tablero"; todos ven todas las tarjetas y cada quien edita las suyas.
- **Correo diario de resumen:** hay código, pero no se verificó que se programe ni se entregue.
- **Móvil:** el diseño responsive no se ha comprobado en un teléfono real.

## 7. Verificar antes de filmar

1. **La interfaz está cambiando** al estilo del manual v2 (en curso). Grabar después de que terminen la barra lateral blanca y el tema claro por defecto; si no, las capturas mostrarán el estilo anterior.
2. **El clic de "Convertir en proyecto"** solo tiene pruebas unitarias; probarlo una vez a mano en el navegador. Es la escena central.
3. **Los semáforos y el Tablero** no se han verificado a ojo con los datos del seed; las fechas del seed son las del día en que se sembró, y el color depende de esa fecha.
4. **El valor del proyecto** en pantalla (el de la oportunidad o el de la plantilla, $177,36 M): confirmarlo antes de citarlo.
5. **Notificaciones:** los conteos dependen de la fecha del seed.
6. **Roles:** el cambio de rol de la escena 9 se hace cerrando sesión y entrando con otro usuario; no hay selector de perfil en la app real.

## 8. Material que necesita Claude Motion

- Logo en 4 variantes (color, blanco, magenta, isotipo) y la frase "Innovación social".
- Capturas limpias (claro, 1440x900) de las rutas de la tabla de escenas, tomadas con los datos de la demo.
- Tipografías: Bricolage Grotesque, Instrument Sans y JetBrains Mono.
- Referencia de movimiento y ritmo: el video "Novedades v2" (46 s) y el manual de identidad v2.

Este brief está en texto plano. Si Claude Motion pide otro formato (guion por escenas, JSON de línea de tiempo), se adapta desde la tabla de la sección 4.
