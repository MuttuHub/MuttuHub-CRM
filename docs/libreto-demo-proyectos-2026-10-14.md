# Libreto de la demo del módulo Proyectos (2026-10-14, 15:30)

Guion con tiempos, clics exactos y una línea de "Qué decir" por escena. Duración total: 15 a 20 minutos. Los textos
en negrita son los que muestra la interfaz (verificados contra `src/` el 2026-10-14). Para el detalle de cada pantalla,
ver `docs/paso-a-paso-crear-proyecto.md` y `docs/guia-prueba-proyectos.md`; para el estado de los datos,
`odd/tasks/demo-proyectos-2026-10-14.md`.

## 1. Antes de empezar (checklist, desde T-15 min)

- [ ] El servidor de desarrollo es un trabajo en segundo plano de la sesión de Claude Code: **no cierres esa
  terminal**. Si está caído, desde el repositorio y en una terminal de Windows: `npm run dev -- -H 0.0.0.0`.
- [ ] Abre `http://localhost:3000` e **inicia sesión una vez antes** de la reunión (el primer login y la primera carga
  de cada ruta son lentos por la compilación en frío).
- [ ] **No corras la suite de pruebas** ni ningún comando que toque la base: las pruebas de invariantes crean y borran
  proyectos `sdd-invariant-*` en la base local.
- [ ] Modo oscuro opcional: botón con el ícono de luna en el encabezado.
- [ ] En `/proyectos` deben verse exactamente 2 proyectos demo (PRY-2026-001 y PRY-2026-002). Si aparece algo
  `sdd-invariant-*`, hay una suite corriendo de fondo: deténla y recarga.

| Usuario | Contraseña | Uso |
|---|---|---|
| `admin@demo.muttuhub.local` | `MuttuDemo2026!` | Todo el recorrido |
| `gerencia@demo.muttuhub.local` | `MuttuDemo2026!` | Alternativa; también crea proyectos y valida gastos |

URL: `http://localhost:3000`. Solo Administrador y Gerencia pueden crear proyectos y aprobar la línea base.

## 2. Datos disponibles

| Elemento | Detalle |
|---|---|
| **PRY-2026-001** «Demo CedeTextil · En ejecución» | EN_EJECUCION; 4 actividades, 7 entregables, 2 indicadores, 8 rubros, 5 avances, 3 mediciones, 5 gastos (2 validados, 3 registrados, 1 con sobreejecución) |
| **PRY-2026-002** «Demo CedeTextil · Ruta de fortalecimiento» | BORRADOR; misma estructura, sin avances ni gastos |
| Clientes y oportunidades | 18 clientes y 23 oportunidades en todas las etapas |

Oportunidades ganadas libres (sin proyecto), todas elegibles en el paso 1:

| Oportunidad | Cliente | Valor |
|---|---|---|
| Escuela de formación técnica en confección | Instituto Andino de Innovación Productiva | $210.000.000 |
| Fortalecimiento de unidades productivas textiles del Caribe | Fundación Tejiendo Caribe | $185.000.000 |
| Programa de asociatividad y comercialización agroproductiva | Cooperativa Agroproductiva Alto Cauca | $120.000.000 |
| Demo · Programa de formación técnica (ganada, lista para convertir) | Universidad Central del Valle | $95.000.000 |
| Diagnóstico de cadena de valor de economía circular | Agencia de Cooperación Delta Verde | $48.000.000 |

Plan de uso: la escena 2 consume **Escuela de formación técnica en confección** (nace PRY-2026-003); la escena 3 usa
**Fundación Tejiendo Caribe** solo hasta el paso 1 (no se crea nada).

## 3. Escenas

### Escena 1. Contexto y Portafolio (2 min)

1. Entra como `admin@`. En el menú abre **Proyectos** (`/proyectos`), pestaña **Portafolio**.
2. Muestra las tarjetas KPI del portafolio y la lista con los dos proyectos (avance técnico, avance financiero,
   estado, semáforos).

**Qué decir:** "El módulo reúne en un solo lugar la planeación, la ejecución técnica y financiera, y la gestión de
cambios de cada proyecto. Desde aquí se ve el portafolio completo y se crea uno nuevo."

### Escena 2. Crear un proyecto desde una oportunidad ganada (6 min)

1. En **Portafolio**, botón **Nuevo proyecto**. Abre la página `/proyectos/nuevo` con cinco pasos: **General**,
   **Metas**, **Cronograma**, **Presupuesto**, **Revisión**. Los pasos 2 al 5 están deshabilitados hasta crear el
   proyecto.
2. Paso **General**, **Origen**: deja **Desde una oportunidad ganada**. Elige la tarjeta **Escuela de formación
   técnica en confección**. Se precargan **Cliente**, **Nombre** y **Valor total**.
3. Revisa **Responsable**, fechas y **Líneas estratégicas** (una **Principal**). Marca **al menos un municipio** en
   **Municipios**.
4. Pulsa **Crear proyecto y continuar**. El proyecto nace en **Borrador** con código PRY-2026-003 y la página avanza
   a **Metas**.
5. Paso **Metas**: muestra cómo se agregan objetivo, actividad (por semana de inicio y fin), entregable e indicador.
   Si el tiempo aprieta, solo menciona **Descargar plantilla** / **Importar plantilla** (carga masiva desde Excel).
6. Paso **Cronograma**: el cronograma por semanas y el Gantt (solo lectura; las actividades se editan en Metas).
7. Paso **Presupuesto**: rubros con monto **Asignado**, la suma **Σ asignado** contra el **Valor total** y la
   **Programación mensual**.
8. Paso **Revisión**: resumen de lo capturado. Pulsa **Aprobar línea base** y confirma con **Aprobar**.
   - Si el proyecto quedó incompleto, la confirmación lista las **precondiciones pendientes**. Eso es una virtud:
     el sistema no deja aprobar un proyecto incompleto. Puedes dejarlo ahí y pulsar **Guardar borrador**.
   - Si se aprueba: el paso cambia a **Línea base aprobada** y aparece **Abrir proyecto**. La aprobación no se
     deshace.

**Qué decir:** "El proyecto hereda cliente, nombre y valor de la oportunidad ganada, y la oportunidad pasa a
ejecución en la misma transacción. Nada se aprueba si la estructura y el presupuesto no cuadran."

### Escena 3. El otro camino, desde el cliente (2 min)

1. Menú **Clientes** > ficha de **Fundación Tejiendo Caribe** > pestaña **Oportunidades**.
2. En la oportunidad ganada, **Ver ciclo** > **Convertir en proyecto**.
3. Se abre `/proyectos/nuevo` con esa oportunidad ya preseleccionada. Muestra el paso 1 y **no crees nada**
   (puedes detenerte aquí).

**Qué decir:** "El mismo flujo se puede iniciar desde la relación comercial: la oportunidad ganada llega
preseleccionada."

### Escena 4. Proyecto independiente (1 min, solo mostrar)

1. En `/proyectos/nuevo`, **Origen**: **Proyecto independiente**.
2. Muestra que ahora se elige el **Cliente** en un solo campo que busca y selecciona ("Busca o selecciona el cliente") y se escribe el **Nombre** (obligatorio).
   No guardes.

**Qué decir:** "Para proyectos que no nacen de una oportunidad del CRM, se elige el cliente y se nombra
manualmente."

### Escena 5. Aprobar la línea base de PRY-2026-002 desde su ficha (2 min)

1. **Proyectos** > **Ver detalle** de PRY-2026-002 (abre en una pestaña nueva del navegador).
2. Botón **Aprobar línea base** en el encabezado > **Aprobar**. El proyecto pasa a **En ejecución** y aparecen los
   chips **Semáforo técnico** y **Semáforo financiero**.
3. El **Semáforo técnico** sale **Rojo**: 0 % real contra 20,4 % de plan y la actividad 1.1 atrasada.
4. Señala la insignia **No confirmado**.

**Qué decir:** "El rojo es el comportamiento correcto: es la alerta temprana, el proyecto recién arrancó y ya
debería llevar avance. **No confirmado** significa que los umbrales del semáforo todavía no se han confirmado en
Administración."

### Escena 6. Seguimiento con PRY-2026-001 (4 min)

Abre **Ver detalle** de PRY-2026-001 y recorre:

1. **Ficha de seguimiento**: curva S (técnica y financiera) y desviación **+11,7 pp** (convención real − plan:
   positivo significa adelantado).
2. **Financiero**: presupuesto por rubro, gauge y ficha financiera.
3. **Legalización**: libro de gastos con 5 registros; muestra el gasto con sobreejecución, que la validación por
   Gerencia **bloquea**.
4. **Cambios**: **Modificaciones**, **Versiones** (`v0` contra **Vigente**) e **Historial**.

**Qué decir:** "Después de aprobar la línea base, estructura y presupuesto quedan congelados. Los cambios entran por
modificaciones aprobadas y cada una deja una versión comparable."

### Escena 7. Cierre con el Tablero gerencial (1 min)

1. Vuelve a **Proyectos** y abre la pestaña **Tablero** (`/proyectos?vista=tablero`).
2. Muestra los indicadores del portafolio y pulsa **Exportar Excel**.

**Qué decir:** "Gerencia ve el portafolio completo con semáforos y puede exportarlo a Excel."

| Escena | Tiempo | Acumulado |
|---|---|---|
| 1 Contexto y Portafolio | 2 min | 2 |
| 2 Crear desde oportunidad ganada | 6 min | 8 |
| 3 Desde el cliente | 2 min | 10 |
| 4 Proyecto independiente | 1 min | 11 |
| 5 Aprobar PRY-2026-002 | 2 min | 13 |
| 6 Seguimiento PRY-2026-001 | 4 min | 17 |
| 7 Tablero y cierre | 1 min | 18 |

Si falta tiempo, recorta primero las escenas 4 y 3, y después el paso Metas de la escena 2.

## 4. Qué NO mostrar

| Elemento | Motivo |
|---|---|
| **Clientes > Oportunidades** (sección del submenú) | Es un marcador "en construcción"; las oportunidades viven dentro de la ficha de cada cliente |
| Tarjeta **Pasar a nuevo proyecto →** del Tablero de tareas | Exige una tarea comercial completada de una oportunidad ganada; no hay esa data |
| **Fecha de primer contacto** del cliente | Se muestra cruda (formato ISO) |

## 5. Plan B

| Síntoma | Acción |
|---|---|
| El sitio no responde | Verifica la terminal de la sesión de Claude Code; si cayó, en una terminal de Windows desde el repositorio: `npm run dev -- -H 0.0.0.0` y recarga |
| Una página tarda en abrir la primera vez | Es la compilación en frío del servidor de desarrollo (hasta ~15 s). Espera; no cierres la pestaña. Por eso conviene abrir las rutas antes |
| **Selecciona al menos un municipio.** | Marca uno o más en **Municipios** y vuelve a pulsar **Crear proyecto y continuar** |
| La aprobación de la línea base queda bloqueada por precondiciones | Es una función del sistema: léelas en voz alta ("valor total mayor que cero, presupuesto igual al valor total, programación cuadrada...") y pulsa **Guardar borrador**; continúa con PRY-2026-002 o PRY-2026-001 |
| Un clic equivocado consumió datos (proyecto creado o aprobado) | Sigue con lo que queda; restaura **después** de la reunión (sección 7) |

## 6. Preguntas probables y respuesta sugerida

| Pregunta | Respuesta sugerida |
|---|---|
| ¿Cuándo pasa a producción? | "Funcionalmente está listo. Antes de producción se valida en un ambiente de pruebas, porque las 18 migraciones tocan la base con datos reales. La fecha se define tras montar ese ambiente." |
| ¿Exporta a PDF? | "Hoy exporta a Excel. El PDF está pendiente: depende de elegir el motor de PDF (decisión D-08)." |
| ¿Y la semaforización territorial? | "Está visible en el Tablero. El requerimiento funcional pedía quitarla; se confirma con el responsable del producto cuál es la versión correcta." |
| ¿Se puede cerrar o suspender un proyecto? | "Está pendiente (P14): los estados existen, pero aún no hay la acción ni la pantalla." |

## 7. Restauración (solo después de la reunión)

Borra los datos locales; solo Docker local. Siempre con `.env.local` (los scripts ya lo cargan); en este orden:

```bash
npm run db:migrate:reset:local -- --force
npm run db:seed:local
npm run db:demo:seed-projects:local -- --apply
npm run db:demo:seed-flujo:local -- --apply
```

El seed de flujo va siempre **después** del seed de proyectos (este toma las oportunidades ganadas de mayor valor
para sus dos proyectos). El `migrate reset` exige el consentimiento explícito del usuario.
