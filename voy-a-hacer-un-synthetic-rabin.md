# Plan de mejoras — MuttuHub CRM

## Context

El CRM está en producción con el flujo de invitación de usuarios ya cerrado. Este plan agrupa seis
frentes pedidos por el equipo: documentación por pantalla, mejoras en Clientes, globalizar el Tablero,
organización y búsqueda en Documentos, un bug de carga de perfil, y una pasada responsive.

Decisiones tomadas antes de planificar:

| Tema | Decisión |
|---|---|
| Visibilidad (3A) | **Lectura global para todos los roles** en tareas y clientes. Los permisos de **escritura no cambian**. |
| Exports | **Globales, pero registrados en auditoría** (quién, cuándo, cuántas filas, qué filtros). |
| Búsqueda en documentos (4B) | **Full-text de Postgres ahora** — el contenido nunca sale de la organización. Embeddings/pgvector queda documentado como fase futura. |
| Manual (1) | Reescribir `manual-usuario.html` **por pantalla y por opción**; PDF con print del navegador. |
| Orden | **Features grandes primero** (Documentos + Tablero global, que tocan esquema), luego bugs y responsive. |

> Restricción transversal: **no sumar dependencias** salvo justificación explícita. El proyecto no tiene
> librería de charts ni de forms por decisión de diseño, y se mantiene. Este plan agrega **exactamente
> una** dependencia (`unpdf`), justificada en §4.

---

## Hallazgos que cambian el alcance

Seis cosas que no estaban en el pedido. Cuatro son bugs reales.

1. **Paginación de Clientes rota.** `useClients` (`src/hooks/crm.ts:183-194`) nunca manda `page` al
   querystring ni a la query key; el servidor sí lo soporta (`clients/route.ts:191,211-213`). Hoy
   "Siguiente" solo cambia la etiqueta. **Bloquea 2B.**
2. **"A tiempo / tarde" es incorrecto, no impreciso.** `tasks/report/route.ts:135` compara contra
   `updated_at`, que es `@updatedAt` (`schema.prisma:197`). Renombrar o comentar una tarea ya completada
   la pasa retroactivamente de "a tiempo" a "tarde". **El reporte no es estable en el tiempo.** Mismo
   criterio duplicado en `dashboard/tasks/route.ts` y documentado como verdad en `README.md:398`.
3. **El drawer móvil nunca se cierra al navegar.** `sidebar.tsx:216-228`: los `<Link>` no tienen
   `onClick`, y los únicos cierres son Escape y el scrim. Tocás un ítem del menú en el teléfono, navegás,
   y el menú queda tapando la pantalla nueva.
4. **Scroll horizontal a nivel documento en Inicio y Reportes.** `ChipSelector`
   (`dashboard/shared.tsx:169-181`) mide ~351px de min-content dentro de un `flex` que no envuelve ni
   scrollea; el contenido en un iPhone SE es de 299px. Desborda `main`, que no tiene `overflow-x`.
5. **Tope silencioso de 100 tareas.** `kanban-board.tsx:161` fija `limit: 100` y los filtros de prioridad,
   etiqueta y fecha se aplican en cliente sobre esa página truncada (`hooks/kanban.ts:109-127`).
   Al globalizar el tablero se rompe el primer día.
6. **Backlog de UX previo ya existente**: `docs/pendientes/oportunidades-mejora-funcionalidad-ux.md`.
   Sus ítems #7, #8, #10, #11 y #12 se solapan con 3B y 6. **Se enmienda ese archivo, no se forkea.**
   Dato útil: **#8 ya está implementado** (`kanban-board.tsx:175-178` + `:400-402`) y **#7 está al 90%**
   (el `Select` de estado ya existe en `task-dialog.tsx:380`).

---

## 3. Tablero

### 3A — Lectura global sin abrir escritura

**El peligro.** Un solo helper, `isFullAccess` (`src/lib/api/crm.ts:15-23`), gobierna hoy **tres** cosas:
qué filas ves, qué podés mutar, y **qué categorías de documento restringidas podés leer**
(`src/lib/api/documents.ts:81,192`). El atajo obvio — meter `COLABORADOR` en `FULL_ACCESS_ROLES` — abre
de un saque la edición de registros ajenos *y* los documentos Legal y Administrativo-financiero.
**Nunca se toca la semántica de ese helper.**

**El refactor.** Nuevo módulo **puro** `src/lib/permissions.ts` (sin `db`, sin `next/server`, para poder
importarlo desde componentes cliente):

```ts
export const MANAGE_ANY_ROLES = ["ADMINISTRADOR", "GERENCIA", "COORDINADOR"] as const;
export function canManageAny(rol: RolUsuario): boolean;      // autoridad de ESCRITURA, no visibilidad
export const canReadRestrictedDocs = canManageAny;           // alias explícito: otra frontera, mismo valor
export function canEditTask(tarea, actor): boolean;          // espejo exacto de getTaskForWrite
export function canEditClient(cliente, actor): boolean;      // espejo exacto de getClientForWrite
```

`getTaskForWrite` / `getClientForWrite` (`crm.ts:46,77`) **conservan firma y call sites**; solo delegan su
condición. Una sola regla, dos consumidores (API y UI) — no hay dos implementaciones que puedan divergir.

**Sitios que cambian (READ-SCOPE → global).** Nueve, todos borrado de una condición:
`crm.ts:35` (`loadClientScoped`→`loadClientVisible`), `crm.ts:67` (`loadTaskScoped`→`loadTaskVisible`),
`tasks/route.ts:85` y `:70-71` (**par acoplado — se borran en el mismo commit**), `clients/route.ts:110`,
`clients/[id]/route.ts:79`, `tasks/report/route.ts:76-82`, `src/lib/dashboard.ts:23-25`
(`resolveScope` se **elimina**; las 4 caras y `nav/counts` pasan `"all"` literal, igual que `my-summary`
ya pasa `"own"`), y `attachments/[attachmentId]/download/route.ts:29` (hoy un GET protegido por gate de
escritura — incoherente una vez que se listan los adjuntos de cualquier tarea).

**Sitios que NO cambian — checklist de revisión.** Cualquier diff que toque una de estas es escalada de
privilegios hasta que se demuestre lo contrario: `crm.ts:46-56`, `crm.ts:77-97`, `tasks/route.ts:207-209`,
`clients/route.ts:254-256`, `clients/[id]/route.ts:143,148-158,221`, los 13 call sites de
`getTaskForWrite`/`getClientForWrite`, `documents.ts:114-128`, `documents/route.ts:224`,
`supabase/server.ts:154`, y **`notifications/route.ts:90` + `cron/daily/route.ts:102`** (las alertas y el
correo diario son *personales*; globalizarlas mandaría a cada colaborador un mail con las tareas vencidas
de toda la organización).

**`puede_editar` en la respuesta.** El servidor emite el booleano en cada tarea y cliente, en lugar de que
la UI reimplemente la regla — que además **no puede** hacer bien: `TaskItem` no expone el `responsable_id`
del cliente vinculado. `TASK_SELECT` agrega `cliente: { select: { responsable_id: true } }` — sin query
extra. Las sub-entidades heredan el flag del padre.

**UI.** Se elimina el toggle "Mi tablero / Equipo completo" (`kanban-board.tsx:102-103,114-117,144,146-148,
309-320`), con `localStorage.removeItem("muttu:kanban:scope")` en el montaje — un `"mis"` persistido es
exactamente el bug que estamos borrando. Queda el select de responsable ya existente como filtro. Se borra
la inferencia `misTareas` de `reportes-page.tsx:54`; `ReportView` la deriva del filtro aplicado, que es la
verdad. Y todo control de escritura se cuelga de `puede_editar`: `useSortable({ disabled: !puede_editar })`
(cubre puntero **y** teclado), botones destructivos **ocultos**, campos de edición **deshabilitados** con
tooltip. Nunca mostrar un control que va a devolver 403.

**Exports.** Quedan globales, y se extiende `logAudit` para registrar la descarga: quién, cuándo, cuántas
filas, qué filtros. `logAudit` hoy solo cubre escrituras.

**El tope de 100.** Se mueven prioridad / etiqueta / rango de entrega al servidor (tres cláusulas Prisma
triviales: `where.prioridad`, `where.etiquetas = { has }`, `where.fecha_entrega = { gte, lte }` — cuidado
con fusionar el rango con `filters.vencidas`, `tasks/route.ts:99-102`, que ya escribe ese campo). Se borran
`applyLocalFilters`, `localFiltersActive`, `LocalTaskFilters` de `hooks/kanban.ts:93-127`: **diff neto
negativo**, el export hereda los filtros gratis (hoy los ignora, bug existente) y el `total` deja de mentir.
Luego `useInfiniteQuery` + "Cargar más". Si hay que recortar, el mínimo aceptable es el filtrado en
servidor + un banner `Mostrando N de M tareas` (10 líneas).

### 3B — Reportes con aspecto de dashboard

**El hallazgo que abarata todo:** `ReportView` no es que le falten gráficos — **reimplementa primitivas que
ya existen y ya están testeadas**. Sus botones de rango (`report-view.tsx:64-81`) son un `ChipSelector`
(`dashboard/shared.tsx:159`); su `SummaryCards` (`:160-195`) es un `StatTile` peor (`shared.tsx:72`); su
`ReportSkeleton` (`:301`) duplica `DashboardSkeleton` (`shared.tsx:213`). Y la API **ya devuelve**
`resumen.a_tiempo` / `tarde` (`route.ts:165-166`) que la UI nunca pinta.

Por eso la primera tanda es **diff neto negativo** y ya resuelve la mitad de la queja.

| Bloque | Hoy | Decisión |
|---|---|---|
| 4 KPIs | tarjetas locales | `StatTile`. Siguen siendo números — un gráfico sobre un escalar es decoración. `a_tiempo`/`tarde` van al pie. Única excepción: **Tasa de cumplimiento** es un ratio 0–100, ahí un `BarRow` sí acelera la lectura. |
| Por estado | tabla 2 col, 7 filas con ceros | **`BarRow`** — es el mismo embudo de `cara-pipeline.tsx:86-97` y cada estado ya tiene tono semántico. Los ceros salen de las barras (una barra de 0% es ruido) pero no se pierden: línea de texto *"Sin tareas en: Bloqueada, En espera, Cancelada."* No donut: 7 categorías es demasiado para un arco. |
| Por cliente | tabla 2 col | **`BarRow`, top 8** + *"+N clientes más"*. Ya viene ordenado desc, o sea que es un ranking — el caso donde la barra horizontal es indiscutible. |
| Por persona | tabla 7 col | **Se queda tabla. Es lo correcto.** Siete medidas correlacionadas × N personas: graficarlo son siete gráficos. La tabla deja escanear una columna *y* leer una fila. **Encima** se agrega un `StackedBarRow` "Carga por persona" que responde la pregunta que la tabla no responde de un vistazo: *¿está balanceada la carga?* |

**Bloques nuevos, solo lo que los datos ya soportan:**
- **Vencimientos por antigüedad** — el de mayor valor. Se calcula en el mismo bucle de acumulación
  (`route.ts:120-155`), cero queries extra, cero cambio de esquema. Convierte *"Vencidas activas: 23"*
  (un número con el que no podés hacer nada) en *"17 de las 23 llevan más de un mes"*. El bucket
  "Sin fecha de entrega" además saca a la luz la población que hoy el cálculo descarta en silencio.
- **Carga por semana de entrega** — histograma exacto sobre `fecha_entrega`, alimenta el `Sparkline`
  existente. No es un proxy.
- **Tendencia de cierre** — la que todos quieren. **Requiere `completed_at`.** No se envía una línea
  rotulada "cierres por semana" que en realidad grafica "tareas editadas por semana".

**`completed_at`: se agrega la columna.** No por el gráfico — porque el proxy actual es el bug del hallazgo
#2. Migración aditiva y nullable, con backfill `SET completed_at = updated_at WHERE estado='COMPLETADA'`
que *congela* el proxy histórico en lugar de dejarlo derivar. El write se centraliza en **un solo helper**
por el que pasen tanto el endpoint de status como el `PATCH` genérico — grep de todos los escritores de
`estado` antes de tocar cualquiera. Arregla tres superficies a la vez (reporte, dashboard, README:398).

> **Aparte, en su propio PR**: el filtro de rango también corre sobre `updated_at` (`route.ts:59-62`), o sea
> que "Semana" hoy significa *"tareas tocadas en 7 días"*. Arreglarlo cambia **todos** los números de la
> pantalla, así que va solo, con su nota de release. Mientras tanto la UI declara el criterio desde un
> campo `meta` del payload, para que el día que se migre el descargo desaparezca de la pantalla y del PDF
> sin editar UI.

**Dos primitivas nuevas, no cinco.** `StackedBarRow` en `dashboard/shared.tsx` (CSS puro, segmentos con
`TONE_BAR`, todos los colores por token → funcionan en ambos temas) y `TrendFigure`
(`dashboard/trend-figure.tsx`). Esta segunda existe por accesibilidad: `Sparkline` es `aria-hidden`
(`sparkline.tsx:36`), así que **nunca puede ser el único portador de un dato**. En vez de dejarlo como
convención que alguien va a olvidar, se envuelve en un `<figure>` con `caption` **obligatorio** y una lista
`sr-only` de la serie. Si quien lo usa no puede escribir el caption, el gráfico no debería existir.

> Regla, escrita una sola vez: **todo visual de Reportes tiene que leerse con el CSS apagado.**
> `BarRow` ya cumple (imprime label, conteo y % como texto real). `StackedBarRow` cumple vía `sr-only`.
> `Sparkline` no cumple y nunca va a cumplir, así que solo se despacha dentro de `TrendFigure`.

**No se mueve la agregación a `groupBy`.** El dashboard de pipeline usa `groupBy` y ahí está bien porque
necesita **una** agrupación; acá hacen falta seis cortes sobre el mismo conjunto ya filtrado. Un `findMany`
con `select` liviano + una pasada es estrictamente más barato que seis viajes.

**El PDF (`print-report.tsx`) mantiene sus tablas.** Es un artefacto de papel: las barras gastan tinta y
dependen de fondos que el navegador descarta al imprimir salvo `print-color-adjust: exact` — un "gráfico"
que sale como seis rectángulos grises es peor que una tabla. El riesgo real de divergencia no es
"el PDF no tiene gráficos", es **"la pantalla muestra números que el PDF no"**, así que el cambio paralelo
es aditivo: filas nuevas con los mismos datos.

---

## 4. Documentos

### 4A — Carpetas libres estilo Drive

**Árbol por lista de adyacencia** (`parent_id` autorreferencial), tope de profundidad 8.

```prisma
model Carpeta {
  id String @id @default(uuid())
  nombre String
  parent_id String?          // null = raíz; no hay fila "root"
  creado_por_id String
  created_at DateTime @default(now())
  deleted_at DateTime?
  parent Carpeta? @relation("CarpetaArbol", fields: [parent_id], references: [id])
  hijas  Carpeta[] @relation("CarpetaArbol")
  documentos Documento[]
  @@index([parent_id])
  @@map("carpetas")
}
```

La escala real es de decenas de carpetas, o sea que el árbol entero es **una** query de ~4 KB que se arma
en memoria en el cliente. A ese tamaño, path materializado y closure table solo agregan un invariante
denormalizado que puede desincronizarse, y Prisma no modela ninguno de los dos. Mover un subárbol es
`1 UPDATE` contra "reescribir el path de todos los descendientes". La detección de ciclos es un walk de
≤8 saltos en el handler.

**La decisión que importa: carpeta y `categoria` son ejes independientes.**
`categoria` es el **eje de permisos** — es lo que leen `canReadCategory` (`documents.ts:73-79`), el gate del
zip y el de subida, contra el catálogo vivo `doc_categories`. Si la carpeta derivara o pisara la categoría,
**arrastrar un documento entre carpetas cambiaría quién puede leerlo**: una escalada de privilegios
disparada por un gesto que se lee como pura organización. La carpeta **nunca** afecta visibilidad, y eso va
escrito como comentario en el modelo. `DocumentoCliente` también sigue siendo el vínculo estructurado: una
carpeta puede *llamarse* como un cliente, pero no es el mismo hecho.

**Borrado: se bloquea con 409 si no está vacía** ("La carpeta tiene 3 subcarpetas y 12 documentos"), y
soft-delete si lo está. Cascada significa borrar documentos en silencio y esta app **no tiene papelera**;
huerfanizar a la raíz esparce 200 documentos sin deshacer. Bloquear cuesta un `count` y no pierde nada.

**Las claves de storage no se tocan** (`files.ts:56-64`). Un rename o un move obligaría a copiar y borrar
cada objeto en Supabase Storage: un bucle no transaccional que puede fallar a la mitad y dejar paths y filas
en desacuerdo, sin código de reconciliación en ningún lado. La carpeta es metadato. La clave nunca es
visible: la descarga es un 302 a una URL firmada y el nombre de archivo se arma del `titulo`.

**Backfill: ninguno.** `carpeta_id` es nullable; lo existente queda en "Sin carpeta". Autocrear una carpeta
por `categoria` fabricaría justo la taxonomía fija que descartaste, y haría existir "Legal" como *carpeta*
al lado de "Legal" la *categoría de permiso* — la confusión que toda esta sección evita.

**Índices que faltan.** Hoy hay **cero** índices en `documentos` (verificado en las 7 migraciones).
Se agregan `@@index([deleted_at, created_at])` (el orden por defecto del listado),
`@@index([carpeta_id])`, y `DocumentoCliente @@index([cliente_id])` — la PK compuesta
`(documento_id, cliente_id)` no sirve para el filtro `?cliente=`.

### 4A-bis — Aceptar diapositivas (`.pptx`)

Hoy la validación de subida (`src/lib/api/files.ts:9-18`, aplicada en `parseUploadForm`,
`documents/route.ts:67-140`) acepta **solo** `pdf|docx|xlsx|jpg|png` por extensión **o** por MIME.
Un `.pptx` se rechaza. Se agrega:

- extensión `pptx` y MIME `application/vnd.openxmlformats-officedocument.presentationml.presentation`
  a `ALLOWED_EXTENSIONS` / `ALLOWED_MIME_TYPES`;
- verificar el badge de extensión de la fila (`repository-list.tsx`, columna "Documento") — si se deriva
  del nombre de archivo es genérico y no hay nada que tocar; si hay un mapa de tipos, sumarle `pptx`;
- el zip, la descarga firmada y el versionado no cambian: son agnósticos al tipo.

**El texto de las diapositivas se extrae sin dependencia nueva.** Un `.pptx` es un ZIP OOXML igual que un
`.docx`, así que se resuelve con el mismo `jszip` que ya está: se leen `ppt/slides/slide*.xml` y se unen los
`<a:t>` (el equivalente de los `<w:t>` de Word), una diapositiva por bloque. ~20 líneas, la misma forma que
el extractor de docx.

> **Ojo con el tope de 10 MB** (`MAX_FILE_BYTES`, `files.ts:9`). Un deck con imágenes lo pasa con
> facilidad — es el tipo de archivo que más va a chocar contra ese límite de todos los que soporta el
> repositorio. Recomendación: subirlo a 25 MB **solo** si el equipo reporta rechazos reales, y en ese caso
> revisar antes el presupuesto de memoria de la subida (`route.ts` ya hace `await file.arrayBuffer()`, o sea
> que el archivo entero vive en RAM, y la extracción agrega una segunda copia). No se toca en este plan.

### 4B — Búsqueda dentro del contenido

**Columna `TEXT` plana + índice GIN por expresión.** No `Unsupported("tsvector")`: Prisma Client no puede
leer ni escribir esas columnas, así que cada extracción tendría que ser `$executeRaw` — y el índice por
expresión sigue siendo SQL crudo igual. No compra nada y cuesta el write path del ORM.

```prisma
model DocumentoVersion {
  contenido_texto String?   // texto extraído (null = sin texto / sin procesar)
  texto_estado    String?   // "ok" | "sin_texto" | "error" | null (= nunca procesado)
}
```
```sql
CREATE INDEX documento_versiones_contenido_fts_idx ON documento_versiones
  USING GIN (to_tsvector('spanish', coalesce(contenido_texto, '')));
```

`'spanish'` es una configuración nativa de Postgres (stemmer snowball + stopwords), presente en Supabase
sin extensión. La query tiene que usar la expresión **byte a byte idéntica** o el planner ignora el índice.

El texto vive en `DocumentoVersion` y no en `Documento` porque la extracción es por archivo, y un archivo es
una versión — además mantiene una columna potencialmente de 200 KB fuera de la tabla que **toda** query de
listado consulta. Que solo la versión activa sea buscable se resuelve en la *query*, no en la forma de
almacenamiento, lo que deja "buscar en versiones viejas" disponible gratis más adelante.

**Extracción — una sola dependencia nueva:**

| Tipo | Librería | ¿Nueva? |
|---|---|---|
| pdf | **`unpdf`** — build de pdf.js para serverless, sin worker, sin binarios nativos | **sí, la única** |
| docx | **`jszip`** (ya está, lo usa `zip/route.ts`) — un `.docx` es un ZIP: leer `word/document.xml`, unir los `<w:t>`. ~15 líneas | no |
| **pptx** | **`jszip`** — mismo truco: `ppt/slides/slide*.xml`, unir los `<a:t>`, una diapositiva por bloque. ~20 líneas | no |
| xlsx | **`exceljs`** (ya está, lo usa el export de clientes) | no |
| jpg/png | ninguna — sin OCR no hay texto → `estado: "sin_texto"` | no |

**Sin OCR.** `tesseract.js` son ~10 MB instalados, descarga datos de idioma en runtime y consume segundos
de CPU por página: viola la política de dependencias y el presupuesto serverless a la vez. Si algún día hace
falta, va en un worker en background que hoy no existe. Documentado, no construido.

**Inline, pero después del commit de la versión, y nunca lanza.** Es la convención que ya establecieron
`mirrorAttachmentAsDocument` (`tasks/[id]/attachments/route.ts:66-118`) y `logAudit`: un fallo en la
preocupación secundaria no puede tumbar la escritura primaria.

```
1 validar → 2 subir a Storage → 3 crear DocumentoVersion      ← el archivo del usuario, a salvo
4 try { texto = await withTimeout(extract(bytes), 5000) } catch { estado = "error" }
5 update contenido_texto/texto_estado (en su propio try/catch)
6 logAudit + 201                                              ← respuesta sin cambios
```

**Un documento cuyo texto no se puede extraer sube igual, devuelve 201 y sigue siendo buscable por
metadatos.** Ése es el primer test que se escribe. Topes: 5 s de timeout, 200 000 caracteres,
`maxDuration = 30` en las dos rutas de subida.

`texto_estado` se gana su columna porque distingue *"nunca se procesó"* (null → el backfill lo toma, y el
script es idempotente) de *"no hay texto que extraer"* de *"falló"* (reintentable). Sin eso el backfill
reintenta cada JPG en cada corrida y la UI no puede decir honestamente "12 documentos aún sin indexar".

**Snippets sin inyección.** `ts_headline` con `StartSel=«, StopSel=»` y split en React sobre esos
delimitadores → `<mark>`. **Nunca `dangerouslySetInnerHTML`.** Y se ejecuta en dos queries acotadas: primero
ids candidatos (tope 500), después `ts_headline` solo para los ≤25 de la página — si no, un término que
matchea 800 documentos re-parsea 800 textos completos para mostrar 25.

**De paso se arregla `etiquetas: { has: q }`** (`documents.ts:214`): hoy buscar `legal` nunca encuentra la
etiqueta `Legal`, porque es igualdad exacta y sensible a mayúsculas mientras los otros cuatro campos son
`contains`/insensitive. Se pliega al mismo query crudo con
`EXISTS (SELECT 1 FROM unnest(etiquetas) e WHERE e ILIKE $1)`.

**Acentos: se despacha sin resolver, documentado.** `to_tsvector('spanish', …)` no pliega acentos, así que
`informacion` no encuentra `información`. El arreglo es la extensión `unaccent`, pero `unaccent()` es
`STABLE` y no `IMMUTABLE`, así que no entra en una expresión de índice sin crear una configuración de
búsqueda propia. Es una trampa conocida; la receta queda escrita como migración de seguimiento.

### 4C — Asignar un documento suelto

Hoy **no existe ningún endpoint mutador sobre `Documento`** — un documento es inmutable después de subirlo:
no se puede cambiar título, categoría, etiquetas ni cliente. Se agrega el primero:

**`PATCH /api/v1/documents/[id]`** con `{ titulo?, categoria?, etiquetas?, carpeta_id?, cliente_ids? }`.
Gate nuevo `loadDocumentForWrite`, calcado de `loadDocumentForDelete` (`documents.ts:114-126`): 404 si no
existe, 403 si la categoría **actual** es restringida y no sos full-access, 403 si no sos el autor.
**Más una regla propia del PATCH**: 403 si la categoría **entrante** es restringida y no sos full-access —
sin eso un COLABORADOR podría mover su propio documento a `Legal`, es decir, hacer una escritura cuyo
resultado no puede leer. `cliente_ids` es reemplazo completo dentro de `$transaction`.
Auditoría: `accion: "editar"` con el snapshot de campos (ya existe esa acción para versiones; `cambios`
las desambigua).

**`POST /api/v1/tasks/[id]/attachments/from-document`** con `{ documento_id }` — el inverso exacto de
`mirrorAttachmentAsDocument`, reutilizando el mismo archivo, sin re-subir. Vive bajo `/tasks` porque la
escritura es sobre la tarea, así que hereda `getTaskForWrite` sin cambios. **Dos gates, ambos obligatorios**:
`getTaskForWrite` **y** `loadDocumentForRead`. Omitir el segundo es un agujero real: las descargas de
adjuntos de tarea acuñan su propia URL firmada y **no revalidan `Documento.categoria`**, así que un
COLABORADOR podría adjuntar un documento `Legal` a su propia tarea y bajárselo. Va con test explícito.

Asignar a **cliente** no necesita endpoint nuevo: es el `PATCH` con `cliente_ids`.

### UI de Documentos

Rail de carpetas de 240px (`lg:grid-cols-[240px_1fr]`, `Sheet` por debajo de `lg`) + breadcrumb + la tabla
actual. `repository-list.tsx` ya tiene 781 líneas: el árbol va en archivos nuevos
(`folder-tree.tsx`, `folder-dialogs.tsx`, `move-dialog.tsx`, `assign-dialog.tsx`), con `<ul role="tree">` y
el patrón de disclosure que ya usa `document-dialog.tsx:161-180`. Decenas de nodos → se renderizan todos,
sin virtualización.

**Mover: diálogo explícito, no drag.** No es un argumento de dependencias (`@dnd-kit` ya está instalado) —
es que acá los arrastrables son `<tr>` dentro de un contenedor con scroll horizontal y los destinos son
nodos de un rail con scroll vertical: contenedores anidados, dos ejes de autoscroll y zonas de drop de
28px de alto. Es el caso difícil, no el fácil. Además el repositorio **ya tiene multiselección**
(`repository-list.tsx:235`): "seleccionar 12 → Mover a…" sale gratis con el diálogo, y con drag necesita una
capa custom. ~80 líneas contra ~250. **El seam**: el drag llamaría al `PATCH` idéntico, así que agregarlo
después es un disparador más, no una reescritura.

**Cuando `q` está activo se ignora el filtro de carpeta** y el breadcrumb pasa a "Resultados de búsqueda"
— comportamiento de Drive. Buscar dentro de una sola carpeta es un default sin sorpresas pero inútil cuando
no sabés dónde está el archivo.

**Los conteos por carpeta tienen que excluir las categorías restringidas**, o un COLABORADOR lee
`Legal (14)` en el sidebar y aprende exactamente qué es lo que no puede ver.

### Futuro documentado — `docs/pendientes/busqueda-semantica.md`

Qué agrega (recall sobre paráfrasis: "contrato de arrendamiento" encontrando "acuerdo de alquiler"), qué
cuesta (~30 000 embeddings por cada 1 000 documentos, +100–400 ms por consulta remota), y **qué datos
saldrían**: con una API alojada (OpenAI, Voyage, Cohere) se transmite **el texto completo de cada documento
a un tercero** — exactamente lo que la política prohíbe y la razón por la que 4B se acotó a FTS. El único
camino compatible es un **modelo self-hosted** (ONNX en contenedor, o la Edge Function de Supabase que corre
en el propio proyecto): ahí no sale nada. **La decisión de habilitar búsqueda semántica es una decisión de
hosting, no de búsqueda** — queda escrito así para que nadie después "simplemente agregue una API key".

Los seams que este plan ya deja: `contenido_texto` poblado y backfilleado (sin eso, la fase 2 arranca
re-descargando y re-parseando cada archivo), `searchCandidateIds(q)` como una única función con una única
firma, `match.en` como discriminante con lugar para `"semantico"`, y `texto_estado` como la máquina de
estados de procesamiento que un job de embeddings necesita.

---

## 6. Responsive

**Estrategia: solo CSS. Cero media queries en JS. Y se borra el único que hay.**

`acceso-page.tsx:102` (`setAngosto(window.innerWidth < 940)`) alimenta tres estilos inline que son tres
clases. Se convierten, se borra el estado, el listener y el cleanup: **−8 líneas**, se elimina un mismatch
de hidratación, y el breakpoint pasa de un 940 inventado a `lg`.

**El swap del Kanban tampoco necesita hook ni doble render.** La "lista agrupada por estado" que pide el
backlog #7 *es* lo que una columna del tablero ya es, cuando dejás de forzarle 248px. Una clase en el
contenedor y otra en la columna convierten 6 columnas con scroll lateral en 6 grupos apilados, rotulados y
con conteo — mismo DOM, mismo `SortableContext`, sin árbol gemelo `hidden lg:flex`.

### Lo primero, porque son bugs

1. **El drawer no se cierra al navegar** (hallazgo #3). `useEffect` sobre `pathname` → `setMobileOpen(false)`.
   Tres líneas. Y de paso: bloqueo de scroll del body mientras está abierto (el scrim no lo impide), y
   ocultar el botón "Contraer menú" dentro del drawer — hoy muta el estado *persistido de escritorio* de
   forma invisible.
2. **El `ChipSelector` desborda el documento** (hallazgo #4). `overflow-x-auto` + `shrink-0` en los chips,
   y la etiqueta "RANGO" pasa a `hidden sm:inline`.
3. **Las barras de tabs se apilan en 4 filas.** "Actividad de clientes" mide ~178px de min-content; con
   `flex-1` + `whitespace-nowrap` dentro de `flex-wrap`, cada tab se lleva su propia fila: ~152px de barra
   antes de cualquier contenido. Patrón: tira con scroll abajo, ancho igual arriba (`md:` para ≤4 tabs,
   `lg:` para 5+).

### Los cinco patrones del proyecto

El repo no tiene ninguna convención responsive hoy — así es como se llega a 34 respuestas distintas. Se
definen y se documentan: **A** barra de tabs (scroll abajo / ancho igual arriba), **B** grupo de chips
(`shrink-0` + scroll), **C** tabla (`min-w-[N]` explícito para que **scrollee en vez de aplastarse** — el
precedente ya existe en `cara-clients-activity.tsx:91`), **D** grilla (siempre declarar la base móvil),
**E** fila de filtros (grilla fluida, y `Popover` cuando aún así quedan ≥3 filas — clonando
`client-list.tsx:517-560`, que ya funciona), **F** tablero (grupos apilados debajo de `lg`),
**G** ancho fijo → fluido.

Dos reglas de G que valen por sí solas: `sm:max-w-[Npx]` → `sm:max-w-[min(Npx,calc(100%-2rem))]` en 20
sitios (hoy cada consumidor **pisa** el cap móvil correcto de `ui/dialog.tsx:56` — `client-sheet.tsx:128`
son 760px en un iPad de 768: 4px de margen), y `vh` → `dvh` en 10 sitios (la barra del Safari móvil deja el
footer del diálogo debajo del chrome del navegador).

> **No** poner `overflow-x-hidden` en `main` como atajo: `dashboard-page.tsx:118` es `sticky top-2`, y
> cualquier `overflow-x` distinto de `visible` en un ancestro mata el sticky de todos los descendientes.

### Tablet — la banda que nadie revisó

| Viewport | Sidebar | Contenido |
|---|---|---|
| 375 (iPhone SE) | drawer | **299px** |
| 768 (iPad vertical) | drawer | **692px** |
| **1024 (iPad horizontal)** | rail 244 | **682px** |
| 1280 | rail 244 | 938px |

**Rotar un iPad de vertical a horizontal te da *menos* contenido que en vertical.** El sidebar de 244px
llega justo cuando no se puede pagar. Invisible en un monitor, que es por qué sobrevivió.

**El rail no debe arrancar en `md:`**: a 768px un rail expandido deja 434px de contenido, 37% peor que el
drawer. Y forzar modo rail por debajo de `lg` sería un cambio de **DOM**, no de CSS (`SidebarContent`
renderiza markup distinto según `rail`), o sea que pediría justo el hook que este plan evita. El arreglo es
escalar los paddings del shell y bajar el rail a 200px hasta `xl`: iPhone SE 299 → **327px**, iPad
horizontal 682 → **738px**, por fin más que en vertical.

### Áreas táctiles

**El sistema de diseño ya tiene la convención de 44px documentada** (`globals.css:271-279`) e implementada
en `ui/button.tsx:22-34` con `after:-inset-N`. O sea que este trabajo **no** es "agrandar cosas": es
**dejar de pisar `after:-inset-2` con `after:-inset-1`**. En la mayoría de los casos es borrar.
Los que sí quedan cortos: `ui/checkbox.tsx:17` (32px), la × de los chips de filtro
(`client-list.tsx:701`, 20px, sin `after:` ninguno), y la paginación del repositorio (40px).

### Backlog previo

**#8 ya está hecho** — `KeyboardSensor` + `sortableKeyboardCoordinates` y la región `aria-live` ya están en
`kanban-board.tsx:175-178,400-402`. Se cierra por verificación, no por desarrollo. **#7 se resuelve con el
patrón F** más el `Select` de estado que ya existe. **#10** queda parcial (los contenedores dejan de
desbordar; el tratamiento completo de estados vacíos sigue abierto) y **#11** se reencuadra: el patrón C fija
el ancho cómodo de cada columna, que es la referencia sobre la que un toggle de densidad tiene que operar —
hacerlo antes habría producido dos anchos mínimos en conflicto. Se **enmiendan en el lugar**, con nota de
estado; el archivo está fechado y es un registro de auditoría, no se reescribe.

---

## 1. Manual por pantalla (PDF)

**Va al final, aunque lo listaste primero** — 2, 3, 4 y 6 cambian justo las pantallas que el manual
describe. Documentar antes es escribirlo dos veces.

**Qué hay hoy.** `manual-usuario.html` (447 líneas, HTML autocontenido con `@page { size: A4 }`, portada,
TOC, sin imágenes) + el PDF commiteado como binario. Orientado a tareas, no a pantallas, con cobertura
despareja: Clientes tiene 9 subsecciones, Tablero 5 viñetas, Reportes 3 e inexactas, e **Inicio no existe**.
El TOC ya está desincronizado del cuerpo (8.2 dice una cosa en el índice y otra en el `<h2>`).

**El conteo por ruta subestima la app ~3×** — las pantallas verdaderas son tabs y diálogos:
7 pantallas autenticadas · 4 de acceso (login tiene 4 vistas internas) · 4 caras de dashboard ·
7 tabs de la ficha de cliente · 3 vistas de Tablero · 4 bloques de Administración · ~6 diálogos ·
`/api-docs`.

**Sin documentar hoy** (verificado contra el código): login con Google, vistas guardadas, export a Excel,
ficha imprimible, tab "Tareas relacionadas", subtareas, comentarios, adjuntos, las 4 caras, Catálogos,
Bitácora de accesos, Bitácora de auditoría, `/api-docs`, panel de notificaciones, modo oscuro, banner de
sesión de 4 h, colapso del sidebar, y **los 4 roles y qué puede hacer cada uno**.

**Columna vertebral**: `src/lib/nav.ts` (`NAV_GROUPS` + `PAGE_HEADERS`) ya tiene los títulos y subtítulos
canónicos. Usarlo como índice evita que el manual se desincronice de la app.

**Plantilla por pantalla**: qué es y para qué sirve → quién la ve (rol) → cómo se llega → recorrido de cada
control y opción, uno por uno → acciones y qué hace cada una → estados (vacío, error, sin permiso).

**Riesgo asumido**: el PDF sigue siendo un binario a mano, así que se desactualiza en silencio. Se mitiga
con una nota de proceso en el README. Automatizarlo con Playwright (ya instalado) queda anotado como mejora
futura.

---

## 2. Clientes

### 2A — Vista de lista y de detalles

Hoy solo hay grilla de tarjetas (`client-list.tsx:736,745`). Se agrega un selector de 3 modos estilo
explorador: **Tarjetas** (actual, default) · **Lista** (filas compactas) · **Detalles** (tabla con columnas
ordenables, que habilita 2B). Estado en `zustand`, patrón de `store/sidebar.ts`. La tabla reutiliza
`ui/table.tsx` — **no** se agrega TanStack Table: el orden se resuelve en el servidor y la tabla es de
presentación.

### 2B — Ordenamiento

**Hoy no existe.** El único orden es `orderBy: { updated_at: "desc" }` hardcodeado
(`clients/route.ts:201`). **Prerrequisito: arreglar la paginación** (hallazgo #1).

Cuatro criterios salen de columnas (última actividad, nombre, fecha de primer contacto, prioridad, estado
por etapa del embudo) y tres son agregados que se ordenan post-enriquecimiento, donde ya se filtra por
`valor_potencial` (valor potencial, compromisos abiertos, próximo compromiso vencido). Se expone como
`sort`+`dir` en el querystring, espejado en la URL como el resto de los filtros, para que una vista guardada
conserve el orden.

> Deuda anotada, no resuelta acá: `clients/route.ts:198-213` trae **todas** las filas que matchean, las
> enriquece y recién ahí pagina en JS. Ordenar por agregados encaja sin costo extra, pero el patrón no
> escala — y con lectura global (3A) deja de estar enmascarado. Ver §Verificación.

### 2C — El scroll de la ficha

**Causa raíz, no estética.** En `client-sheet.tsx:144-158` hay tres cosas peleándose:

1. `overflow-x-auto` está **sobre el `TabsList`**, y el subrayado de la tab activa se dibuja con `after:` en
   `bottom-[-5px]` (`ui/tabs.tsx:64`) — **5px fuera de la caja**, así que el overflow lo recorta. El `pb-1`
   es el parche que compensa.
2. `h-10` fijo + barra nativa horizontal: el scrollbar se come 10-15px de una fila de 40px.
3. `flex-none px-3` anula el `flex-1` del `TabsTrigger` base (`tabs.tsx:61`), así que las 7 tabs **siempre**
   desbordan en `sm:max-w-[760px]`.

**Arreglo**: mover el `overflow-x-auto` al `div` contenedor (`:145`, hoy solo `px-6`) para que el subrayado
deje de recortarse y se pueda soltar el `pb-1`; ocultar la barra nativa y señalar el desborde con máscaras
de degradado + `scroll-snap` (requiere una utilidad de scrollbar oculto en `globals.css`, no existe);
quitar el `h-10`. **La barra vertical se elimina** — el panel (`:157`) conserva el scroll con la barra
oculta y padding más generoso.

> Ojo: toca `ui/tabs.tsx`, un primitivo compartido. Revisar los otros consumidores (`reportes-page.tsx`;
> `kanban-board.tsx` usa `Segmented`, no `Tabs`) o limitar el cambio al override del `client-sheet`.

---

## 5. Bug: el parpadeo de "Adriana Gómez"

**Causa raíz.** `src/lib/mock/demo.ts:12-15` define `DEMO_USER` (archivo marcado
`// DEMO DATA — replaced by API in milestone 6`). Lo usan de fallback `shell/header.tsx:75-76`
(`?? DEMO_USER.nombre` → `Hola, {primer nombre}`) y `shell/user-menu.tsx:33-34,58,61,65-66` (nombre,
iniciales del avatar, label del trigger, dropdown).

Ambos leen `useCurrentUser()` (`hooks/kanban.ts:231-244`), un `useQuery` **puramente cliente**, sin
`initialData`, sin hidratación SSR, sin prefetch. En el primer paint `data === undefined`, entra el `??` y
se pinta el usuario demo. Nadie mira `isLoading`, no hay skeleton, y **el mismo `??` cubre tres casos
distintos**: cargando, error y modo demo real.

**Arreglo: eliminar el parpadeo, no disimularlo.** El usuario real **ya está en el servidor** —
`(app)/layout.tsx:15` llama `await requireUser()`, y `/api/v1/auth/me` no hace más que `getSessionUser()`.
Pasarlo como `initialData` hace que el primer paint tenga el nombre correcto: **no queda estado de carga que
mostrar.** Los "…" que pediste quedan como fallback del caso genuino (Supabase sin configurar, error de
red), separando por fin los tres casos. Es menos código que agregar skeletons y ataca la raíz en vez de
cambiar un placeholder feo por uno menos feo.

Un tercer consumidor sufre la misma carrera en silencio: `reportes-page.tsx:51-54` infiere `misTareas` del
rol — **lo resuelve 3A**, que elimina la inferencia. De paso se unifican las dos implementaciones duplicadas
de `iniciales()` (`mock/demo.ts:307` y `hooks/crm.ts:689`).

---

## Orden de ejecución

PRs encadenados de ≤400 líneas. **Features grandes primero**, como pediste.

### Fase 0 — Dos bugs de 20 líneas (opcional, se cuelan antes)
| PR | Contenido |
|---|---|
| 0a | Drawer móvil se cierra al navegar + scroll lock (hallazgo #3) |
| 0b | `ChipSelector` deja de desbordar el documento (hallazgo #4) |

### Fase 1 — Tablero global (permisos)
| PR | Contenido | Riesgo |
|---|---|---|
| 1 | `src/lib/permissions.ts` + matriz de escritura en tests. `getTaskForWrite`/`getClientForWrite` delegan. Rename `isFullAccess`→`canManageAny`, alias `canReadRestrictedDocs`. **Cero cambio de comportamiento** — se verifica porque toda la suite pasa sin tocar un test | bajo |
| 2 | `puede_editar` en las respuestas de tarea y cliente. Nadie lo consume todavía | bajo |
| 3 | **Se abren las lecturas.** Los 9 sitios READ-SCOPE + la mitad de lectura de la matriz | **alto — es EL PR** |
| 4 | Afordancias de solo-lectura consumiendo `puede_editar` | medio |
| 5 | Se elimina el toggle de alcance + `removeItem` del localStorage + filtro "Mis tareas" | bajo |
| 6 | Filtros prioridad/etiqueta/fecha al servidor + banner de truncado + auditoría de exports | medio |
| 7 | `useInfiniteQuery` / "Cargar más" | bajo |

> PR 3 y PR 4 dejan una ventana donde se ven registros ajenos con botones que dan 403. **Salen en la misma
> release** (pueden ser dos commits) o PR 3 va detrás de un flag.

### Fase 2 — Documentos
| PR | Contenido |
|---|---|
| 8 | Esquema: `Carpeta`, `carpeta_id`, `contenido_texto`, `texto_estado`, los 3 índices faltantes, el GIN crudo |
| 9 | API de carpetas (CRUD + ciclos + profundidad + bloqueo de no-vacía) |
| 10 | `PATCH /documents/:id` + filtro `carpeta` |
| 11 | Rail de carpetas + navegación + crear |
| 12 | Renombrar / eliminar / mover |
| 13 | Aceptar `.pptx` en la subida (4A-bis) + extracción de texto de los 4 tipos con texto (`unpdf` para pdf, `jszip` para docx y pptx, `exceljs` para xlsx) — paralelizable con 9-12, solo depende de 8 |
| 14 | Búsqueda full-text + snippet + fix de `etiquetas` |
| 15 | Asignar a tarea (doble gate) |
| 16 | Backfill de texto + `docs/pendientes/busqueda-semantica.md` |

### Fase 3 — Reportes
| PR | Contenido |
|---|---|
| 17 | Reutilizar primitivas del dashboard — **diff neto negativo**, ya resuelve media queja |
| 18 | Estado y cliente como barras |
| 19 | `StackedBarRow` + carga por persona |
| 20 | Vencimientos por antigüedad + carga semanal (aditivo, sin esquema) |
| 21 | Columna `completed_at` + backfill + los 3 consumidores |
| 22 | Tendencia de cierre |
| 23 | *(propio PR, cambia todos los números)* filtrar el rango por `completed_at` |

### Fase 4 — Clientes y bug de perfil
| PR | Contenido |
|---|---|
| 24 | Arreglar paginación (hallazgo #1) |
| 25 | Ordenamiento (`sort`+`dir`) |
| 26 | Selector de vista Tarjetas / Lista / Detalles |
| 27 | Restyle del scroll de la ficha (2C) |
| 28 | `initialData` del usuario + "…" + unificar `iniciales()` |

### Fase 5 — Responsive
| PR | Contenido | Tipo |
|---|---|---|
| 29 | Documentar los patrones A–G + tabla de anchos | docs |
| 30 | Barras de tabs + barra sticky | **CSS puro** |
| 31 | Escala de paddings del shell + rail 200px (el acantilado del iPad) | **CSS puro** |
| 32 | Bases móviles de grilla (7 sitios) | **CSS puro** |
| 33 | `min-w` en 8 tablas | **CSS puro** |
| 34 | Kanban patrón F + filtros | **CSS puro** |
| 35 | Diálogos: `min()` × 20 + `dvh` × 10 | **CSS puro** |
| 36 | Áreas táctiles + skeletons | **CSS puro** |
| 37 | Filtros de Documentos → Popover + borrar `angosto` de `acceso-page` | estructural |
| 38 | Enmendar el backlog #7/#8/#10/#11 | docs |

Los PRs 30-36 son **CSS puro, riesgo lógico cero**: ~145 líneas en total, revisables de una sentada, y
cubren cerca del 80% del daño visible.

### Fase 6 — Manual
| PR | Contenido |
|---|---|
| 39 | Reescritura de `manual-usuario.html` por pantalla + PDF + nota de proceso en el README |

---

## Verificación

**Tests que van primero y fallan** (TDD estricto está activo en este proyecto):

- **`src/lib/permissions.test.ts`** — la matriz rol × relación × operación, mitad escritura. Rojo en PR 1
  porque el módulo no existe. Es la red de seguridad de todo el refactor: **toda celda que hoy dice ❌ y
  mañana diga ✅ es una escalada de privilegios.**
- **`permissions.read.test.ts`** (PR 3) — `buildTaskWhere({}, colaborador)` no contiene `responsable_id`;
  `buildClientWhere` idem; `parseTaskFilters` conserva `responsable` para COLABORADOR.
- **Los tests de documentos existentes tienen que pasar sin modificación** en toda la fase 1. Si alguno hay
  que tocarlo, el PR está mal: significa que se abrió la frontera de categorías restringidas.
- **`extract-text.test.ts`** — fixtures armados en memoria (JSZip para el docx **y el pptx**, ExcelJS para
  el xlsx), sin archivos de prueba en disco. El test que importa: **un extractor que lanza → el POST igual
  devuelve 201** y las filas de documento y versión existen. Para pptx, además: dos diapositivas producen
  dos bloques de texto, y un deck sin texto (solo imágenes) cae en `estado: "sin_texto"`, no en `"error"`.
- **`files.test.ts`** — un `.pptx` pasa la validación por extensión **y** por MIME; un tipo no permitido
  sigue rechazándose. Es el test que prueba que no se abrió la puerta de más.
- **`from-document/route.test.ts`** — COLABORADOR adjuntando un documento `Legal` → 403. Ese es el test de
  la escalada.
- **`sidebar.test.tsx`** — abrir el drawer, cambiar el `usePathname` mockeado, verificar que se desmonta.
  Falla contra `main` hoy.
- **`report-view.test.tsx`** (no existe hoy) — contrato de preservación de información: para cada estado con
  `cantidad > 0`, label y conteo tienen que ser encontrables como texto. O sea, que reemplazar la tabla por
  barras no perdió nada.
- **Accesibilidad**: `StackedBarRow` tiene la barra `aria-hidden` y la frase completa en `sr-only`;
  `TrendFigure` mantiene el `<svg>` `aria-hidden` (test de regresión: que nadie "arregle" la accesibilidad
  destapando el sparkline).

**E2E (Playwright, ya instalado):**

- **`e2e/permisos-colaborador.spec.ts`** — no hace falta ruta dev nueva: el seed usa ids fijos
  (`prisma/seed.ts:71-73`), y la tarea #3 "Revisar contrato marco" tiene `responsableKey: "gerencia"`, o sea
  que ya es una tarea ajena conocida. Login como colaborador → **ve** la tarjeta (la prueba central de que
  la globalización funciona) → sin botón guardar ni eliminar → y **la prueba que importa**:
  `page.request.patch(...)` directo a la API → **403**. Demuestra que ocultar el botón es cosmética y que el
  servidor sigue siendo la autoridad.
- **`e2e/documents-folders.spec.ts`** — crear carpeta → subir dentro → breadcrumb → mover → intentar borrar
  con contenido (409) → vaciar → borrar → asignar a cliente.
- **`e2e/documents-search.spec.ts`** — subir un PDF con una frase única que **no** esté en título, categoría
  ni etiquetas → buscarla → aparece con el badge "Coincide en el contenido". Con una ruta dev-only
  (`ENABLE_DEV_ROUTES=true`, patrón de `dev/reset-token/route.ts:26-31`) que devuelve **solo** el
  `texto_estado` y un conteo de caracteres — nunca el contenido — para que un fallo diga "la extracción dio
  error" en vez de "el buscador no encontró nada".
- **`e2e/responsive.spec.ts`** con proyectos `mobile` (iPhone 13) y `tablet` (iPad Mini horizontal = 1024×768,
  justo el acantilado). `playwright.config.ts` necesita `testIgnore` en el proyecto `chromium` existente,
  porque está configurado con `slowMo: 350` para grabar un demo narrable y correr las specs actuales tres
  veces lo arruinaría. **La aserción más valiosa del archivo, una línea**:
  `document.documentElement.scrollWidth <= clientWidth` en las 5 rutas — caza el bug del `ChipSelector`,
  toda tabla sin piso, y cualquier regresión futura de la misma clase.

**Sin tests unitarios para los slices de CSS puro.** jsdom no aplica Tailwind ni calcula layout; un
`toHaveClass("md:flex-1")` afirma el diff, no el comportamiento — es una tautología que hay que actualizar
cada vez que se afina la clase. Playwright es la herramienta correcta y ya está instalada.

**Riesgos de rendimiento a medir después de PR 3** (hoy enmascarados porque el scope de COLABORADOR es
chico, mañana no):
- `clients/route.ts:198-213` carga la tabla de clientes completa + 3 agregados en **cada request de cada
  usuario**, con un `enriched.find()` dentro de un `.map()` (O(n²)).
- `clients/route.ts:142-151` (`nextTasks`): hace `take: ids.length` sobre una consulta ordenada
  **globalmente** por `fecha_entrega`, no N por cliente. Con 500 clientes trae las 500 tareas más próximas
  del conjunto, que pueden ser de 20 clientes → `next_compromiso` sale `null` en los otros 480. Hoy es
  invisible; con lectura global se va a leer como pérdida de datos.
- `tasks/report/route.ts:64-83` hace un `findMany` **sin `take`**; con `rango=all` es la tabla entera.

**Documentación a actualizar** (hoy afirma lo contrario de lo que va a ser verdad): `README.md:378,398,418,
429,448`, `docs/guia-demo.md:86` ("Solo ve/edita los clientes y tareas donde él es el responsable"), y las
notas de OpenAPI en `src/lib/openapi/paths/{clients,tasks,documents}.ts`.

**Antes de desplegar la fase 1**: la única frontera de confidencialidad que le queda a un COLABORADOR
después de este cambio son las categorías de documento restringidas. Si algún dato de cliente o tarea se
considera confidencial hoy *porque* solo lo ve su responsable, esa protección deja de existir y no hay
compensación. Conviene que quede aprobado por escrito por quien es dueño del dato — antes, no después.

---

## Deuda anotada, no resuelta acá

- **Índice GIN y drift de Prisma.** Prisma no representa índices por expresión, así que
  `documento_versiones_contenido_fts_idx` vive solo en SQL a mano. `prisma migrate dev` va a emitir un
  `DROP INDEX` en la **próxima** migración generada: hay que borrar esa línea. Nunca correr `prisma db push`
  en este esquema. (Es inevitable bajo cualquier diseño de FTS.)
- **La quirk de storage se vuelve alcanzable.** `documentClientFolderForVersions` (`documents.ts:279-287`)
  devuelve el cliente solo si hay **exactamente uno** vinculado; si no, escribe en `documentos/general/`.
  Hoy es latente porque nada puede agregar un segundo cliente después de crear. **4C lo vuelve rutinario**:
  una edición de metadatos cambia en silencio dónde se guarda la *próxima* versión. Arreglo recomendado
  (3 líneas, no mueve objetos): hacer el prefijo inmutable → `documentos/{documento_id}/v{n}_{name}` y
  borrar la función, que tiene un solo caller y nadie lee el prefijo de vuelta. Los paths históricos siguen
  funcionando porque cada versión guarda el suyo completo.
- **El dropdown de etiquetas sigue siendo por página** (`repository-list.tsx:164-172`). El query crudo del
  PR 14 hace que arreglarlo salga casi gratis (`SELECT DISTINCT unnest(etiquetas)`).
- **`Tarea` no tiene columna de orden**, así que el orden dentro de una columna del Kanban no sobrevive un
  refresh (backlog #6).
- **`NavItem` no tiene campo de rol** (`src/lib/nav.ts`): los no-admin ven "Administración" y "Solicitudes"
  en el menú y rebotan a `/?notice=admin_only`.
