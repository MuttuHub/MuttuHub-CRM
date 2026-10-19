# Guía para grabar la demo de Muttu Hub

> Guion práctico para grabar un video de demo o hacer una presentación en vivo
> de Muttu Hub (CRM + Kanban + Documentos + Notificaciones + Administración).
> Usa los datos sembrados por `prisma/seed.ts`. No es material de marketing:
> es un libreto de trabajo, pantalla por pantalla, para quien está grabando.

---

## 1. Preparación (antes de grabar)

### 1.1. Requisitos previos

- Apuntar el proyecto **solo a un Supabase + Postgres de desarrollo/demo**,
  nunca a producción. El seed crea usuarios reales en Supabase Auth con una
  contraseña compartida — si se corre contra producción, cualquiera con esa
  contraseña podría entrar a datos reales.
- Variables de entorno necesarias en `.env` (ver README para el detalle de
  cada una):
  - `DATABASE_URL` — conexión de runtime (pooler transaction mode).
  - `DIRECT_URL` — conexión de migraciones (pooler session mode).
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` — solo servidor, nunca la expongas en el
    cliente ni en capturas de pantalla.
  - `SEED_DEMO_PASSWORD` (opcional) — si no se define, el seed usa el
    placeholder `MuttuDemo2026!` e imprime una advertencia en consola.

### 1.2. Correr el seed localmente (verificado 2026-08-12)

Este repo tiene su propio stack de Supabase local (`supabase/config.toml`,
`project_id = "muttu-hub"`), separado de cualquier otra copia del proyecto que
tengas en la máquina. Probado de punta a punta: login real, CRM, tareas,
alertas, documentos con descarga real y restricción por categoría, todo
funcionando.

```bash
npm install                 # primera vez, o tras cambios de dependencias
supabase start               # levanta Postgres + Auth + Storage locales (Docker)
supabase status               # imprime DB_URL, API_URL, ANON_KEY, SERVICE_ROLE_KEY

# Con esos valores, exportá (o cargalos en tu .env local, nunca el real):
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export DIRECT_URL="$DATABASE_URL"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY de supabase status>"
export SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY de supabase status>"
export SUPABASE_STORAGE_BUCKET="muttu-docs"

npx prisma migrate deploy   # crea el schema completo en `public` (stack recién nacido)
npm run db:seed             # corre prisma/seed.ts (idempotente, se puede repetir)
npm run dev
```

`ANON_KEY`/`SERVICE_ROLE_KEY` locales son las claves fijas de demo de Supabase
(iguales en cualquier proyecto local, no son secretos reales), pero igual no
las muestres en pantalla por costumbre.

El bucket `muttu-docs` no existe todavía en un stack recién creado — el seed
sube archivos reales, así que hay que crearlo una vez antes de sembrar
(`supabase.storage.createBucket("muttu-docs", { public: false })` con el
cliente admin, o desde Studio en `http://127.0.0.1:54323`).

El seed es **idempotente**: usa ids fijos y hace upsert, así que correrlo
varias veces solo refresca los datos demo, nunca duplica filas. Al final
imprime en consola las 4 credenciales y un resumen de cuántos registros creó.

Para arrancar de cero: `supabase stop --no-backup && supabase start`, volver a
crear el bucket, `npx prisma migrate deploy` y `npm run db:seed`.

Para borrar solo los datos de la demo y arrancar de cero:

```bash
docker exec supabase_db_MUTTU_HUB psql -U postgres -d postgres \
  -c "DROP SCHEMA IF EXISTS muttu_hub_demo CASCADE;"
# y volver a correr migrate deploy + db:seed de arriba
```

### 1.3. Credenciales demo

| Rol | Correo | Contraseña | Alcance de datos |
|---|---|---|---|
| Administrador | `admin@demo.muttuhub.local` | `MuttuDemo2026!` (o `SEED_DEMO_PASSWORD`) | Ve y edita todo. Único rol con acceso a `/administracion`. |
| Gerencia / Dirección | `gerencia@demo.muttuhub.local` | igual | Ve y edita todo (clientes, tareas, documentos). |
| Coordinador | `coordinador@demo.muttuhub.local` | igual | Ve y edita todo, igual que Gerencia. |
| Colaborador | `colaborador@demo.muttuhub.local` | igual | Solo ve/edita los clientes y tareas donde **él es el responsable** ("alcance propio"). No ve documentos de categorías restringidas (Legal, Administrativo-financiero). |

> ⚠️ Recuerda en cámara: esta contraseña es de un proyecto Supabase de
> desarrollo, nunca se reutiliza en un entorno real.

### 1.4. Qué dejó listo el seed (para no buscarlo en vivo)

- 12 clientes ficticios cubriendo los 7 estados del pipeline.
- 10 oportunidades cubriendo los 7 estados (incluye Ganada y Perdida).
- 20 tareas cubriendo los 7 estados de Kanban, los 3 orígenes y las 3
  prioridades, con fechas de entrega repartidas entre vencidas, hoy, próximas
  y sin fecha — para que el panel de notificaciones y el dashboard tengan
  contenido real en cada categoría.
- 1 tarea con adjunto real ("Revisar contrato marco") y otra
  ("Gestionar permisos con curaduría") — ambas con un PDF real subido al
  bucket, listas para descargar en vivo.
- 8 documentos (uno por categoría), incluyendo "Legal" (restringida) y con
  2 versiones en el documento de categoría "Informes".
- 1 solicitud de acceso **pendiente** (para aprobar en vivo), una aprobada y
  una rechazada (históricas, para que la cola no se vea vacía).
- Historial de accesos de los 4 usuarios demo (para que la tabla de
  Administración no arranque vacía).

---

## 2. Guion sugerido por bloque de funcionalidad

Grabar en este orden. Cada bloque indica qué mostrar, en qué pantalla, qué
decir y qué acción hacer en vivo (no solo narrar).

### Bloque 1 — Login y dashboard ("4 caras")

- **Pantalla:** `/login` → `/` (dashboard).
- **Mostrar:** login con `gerencia@demo.muttuhub.local` (full access, así se
  ve el dashboard completo desde el primer bloque).
- **Decir:** "Muttu Hub centraliza CRM, Kanban, Documentos y Notificaciones
  en una sola plataforma. El dashboard tiene 4 vistas según lo que cada rol
  necesita ver."
- **Acción en vivo:** recorrer las 4 pestañas del dashboard (Pipeline /
  Gestión / Actividad / Mi resumen) y exportar a PDF una de ellas con
  `/print/dashboard/pipeline` (o el botón de imprimir de la vista, que abre
  el diálogo de impresión del navegador → "Guardar como PDF").

### Bloque 2 — CRM

- **Pantalla:** `/clientes`.
- **Mostrar:** lista de clientes, filtros (estado, tipo, prioridad,
  responsable), vistas guardadas, y la ficha de un cliente.
- **Decir:** "Cada cliente tiene su ficha 360°: contactos, oportunidades y
  bitácora de relacionamiento en un solo lugar."
- **Acción en vivo:**
  1. Aplicar un filtro (ej. estado = "Cliente activo") y guardarlo como
     vista.
  2. Abrir la ficha de **Fundación Horizonte Nuevo** (tiene oportunidad en
     revisión y bitácora con varias entradas).
  3. Mostrar pestañas de Contactos, Oportunidades y Bitácora dentro de la
     ficha.
  4. Imprimir la ficha (`/print/clientes/[id]`) o el listado
     (`/print/clientes`).

### Bloque 3 — Kanban

- **Pantalla:** `/tablero`.
- **Mostrar:** las 7 columnas del tablero con tarjetas repartidas (todas
  tienen contenido gracias al seed).
- **Decir:** "El tablero soporta drag-and-drop con mouse y también
  completamente por teclado, para accesibilidad."
- **Acción en vivo:**
  1. Hacer drag-and-drop de una tarjeta **con el teclado** (foco en la
     tarjeta → activar modo de arrastre → mover con flechas → soltar; la
     región viva anuncia el cambio de columna).
  2. Abrir el diálogo de una tarea con subtareas y comentarios (ej.
     "Validar entregable con equipo técnico" o "Preparar propuesta
     técnica") y mostrar subtareas, comentarios de distintos usuarios y el
     adjunto real descargable.
  3. Abrir el "reporte de equipo" (`report-view.tsx` dentro de `/tablero`) y
     exportar a xlsx (`/api/v1/tasks/export`).
  4. Imprimir el reporte de tareas (`/print/reportes/tareas`).

### Bloque 4 — Documentos

- **Pantalla:** `/documentos`.
- **Mostrar:** repositorio con las 8 categorías, versiones de un documento,
  y el comportamiento de categorías restringidas.
- **Decir:** "Los documentos de categorías sensibles como Legal o
  Administrativo-financiero solo los ven los roles con acceso completo."
- **Acción en vivo:**
  1. Abrir el documento de categoría "Informes" y mostrar sus 2 versiones.
  2. Descargar un documento (o seleccionar varios y descargar el zip).
  3. **Cerrar sesión y entrar con `colaborador@demo.muttuhub.local`** para
     mostrar en vivo que el documento "Legal" (Contrato marco de
     confidencialidad) desaparece del listado para ese rol.
  4. Volver a entrar con `gerencia@demo.muttuhub.local` (o `admin@…`) para
     continuar la grabación con acceso completo.

### Bloque 5 — Notificaciones

- **Pantalla:** panel de notificaciones (icono de campana en el header,
  disponible desde cualquier pantalla).
- **Mostrar:** las 3 categorías de alertas (vencidos, hoy, próximos 3 días)
  ya pobladas por el seed.
- **Decir:** "Las alertas se calculan en vivo a partir de las fechas de
  entrega — no hay que sembrarlas aparte."
- **Acción en vivo:**
  1. Abrir el panel y marcar una notificación individual como leída/no
     leída.
  2. Click en "Marcar todas como leídas" y luego usar el toast con el botón
     **"Deshacer"** (ventana de ~5 segundos) para mostrar el undo.

### Bloque 6 — Administración

- **Pantalla:** `/administracion` y `/administracion/solicitudes`.
- **Mostrar:** tabla de usuarios, catálogos configurables, log de accesos y
  cola de solicitudes.
- **Decir:** "Solo el rol Administrador ve este módulo. Desde acá se
  invitan usuarios, se ajustan catálogos sin tocar código, y se controla
  quién pidió acceso a la plataforma."
- **Acción en vivo (con `admin@demo.muttuhub.local`):**
  1. Click en "Nuevo usuario" e **invitar** uno nuevo en vivo (modo
     invitación por correo, sin definir contraseña manualmente).
  2. Mostrar la sección de catálogos (etiquetas de tareas, categorías de
     documentos) — editar o agregar un valor.
  3. Mostrar el log de accesos histórico ya poblado por el seed.
  4. Ir a `/administracion/solicitudes` y **aprobar la solicitud
     PENDIENTE** sembrada (queda como historial junto a la ya aprobada y la
     rechazada).

### Bloque 7 — Tema claro/oscuro

- **Pantalla:** cualquiera (toggle disponible en el header).
- **Acción en vivo:** cambiar de tema claro a oscuro y viceversa, idealmente
  sobre una pantalla con gráficos (dashboard) o con el tablero Kanban
  abierto, para mostrar que ambos temas se ven bien.

### Cierre

- **Decir:** resumen de una frase por módulo (CRM, Kanban, Documentos,
  Notificaciones, Administración) y el mensaje de cierre que se quiera dar
  (siguiente paso, invitación a probar, etc.).

---

## 3. Checklist final — no te olvides de mostrar

- [ ] Login y las 4 caras del dashboard + exportar un PDF.
- [ ] CRM: filtros, vista guardada, ficha de cliente completa, imprimir.
- [ ] Kanban: drag-and-drop **con teclado**, diálogo de tarea con
      subtareas/comentarios/adjunto real, reporte de equipo + exportar
      xlsx, imprimir reporte.
- [ ] Documentos: versiones múltiples, descarga/zip, categoría restringida
      cambiando a un usuario Colaborador.
- [ ] Notificaciones: marcar leída/no leída, "Marcar todas como leídas" +
      Deshacer.
- [ ] Administración: invitar usuario nuevo, catálogos, log de accesos,
      aprobar la solicitud pendiente.
- [ ] Cambio de tema claro/oscuro.
- [ ] Cierre con mensaje final.
