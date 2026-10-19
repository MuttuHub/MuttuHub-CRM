# Pasos siguientes — Muttu Hub (después de la sesión del 2026-10-09)

Guía para retomar el trabajo. Rama: `feat/projects-v2`. Todo está **commiteado en local y sin publicar** (268 commits sobre `6bee83f`, 228 de ellos por delante de `origin/feat/projects-v2`; no se hizo push ni se abrió ningún PR).
Actualizado el 2026-10-12 (después de la sesión del viernes 2026-10-09): último commit `bac3d28`, 268 commits locales sobre `6bee83f` (228 por delante de `origin/feat/projects-v2`). Última revisión nativa aprobada: todo hasta `9e017d1` (U3 a U7 revisadas por candidatos pequeños).
Detalle técnico: `odd/tasks/v2-ui-v6-base.md`, `v2-projects-ficha-page.md`, `v2-projects-s11-convert-and-seed.md`, `v2-projects-delivery-chain.md`. Resumen guardado en Engram (tema `session/summary-2026-10-09`).

## Actualización 2026-10-12 — S14 completo (secciones v6)

El branch avanzó mucho más desde esta guía. Lo nuevo, commiteado en local y **sin publicar** (268 commits sobre `6bee83f`, último commit `bac3d28`):

- **S14 (secciones de Proyectos contra el diseño v6) P1–P9 COMPLETO**: Portafolio con KPIs y barras de avance, Resumen con tarjetas KPI y "Requiere atención" (endpoint `GET projects/:id/attention`), ficha a **8 pestañas** (Resumen, Metas e indicadores, Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios), Metas e indicadores con roll-ups por objetivo, Cronograma en tabla v6, **curva S** (técnica y financiera separadas) en Avance, **gauge** de Presupuesto con barras por rubro, y Tablero gerencial con radar, gauge, barras por proyecto y tabla territorial.
- Suite completa **320 archivos / 3365 tests verde**; `tsc` 0; guardas de diseño (S13) verdes.
- Verificación independiente del slice: sin bloqueantes; se corrigió un defecto real (el Tablero recalculaba el % de entregables en el cliente en vez de usar el valor del servidor).
- Detalle: `odd/tasks/v2-projects-v6-sections.md`.

Lo que sigue (no bloqueante): **capturas claro/oscuro** contra los diseños v6 (necesita el dev server de Windows), **revisión nativa** de P1–P9 en Claude Code, y las decisiones del usuario (umbrales del PO, `size:exception`, PRD, push/PRs).

La sección 5 de abajo (U3–U6) ya está hecha; se conserva como registro.

## 1. Dónde quedó todo

| Tema | Estado |
|---|---|
| Botón "Convertir en proyecto" en la oportunidad ganada (S11) | Hecho, probado con tests y revisado |
| Seed de proyectos para la demo (S11) | Hecho; la base local ya lo tiene |
| Ficha de proyecto en su propia página, en pestaña nueva (S12) | Hecho, probado en navegador con Playwright y revisado |
| Columna "Ver detalle" del Tablero cortada | Arreglada |
| Base de la nueva interfaz (S13: tokens v6, paleta del manual v2, claro por defecto, un solo `h1`, botones destructivos de contorno) | Hecha y revisada |
| Barra lateral blanca en claro (U3), tablas (U4), botones y campos pequeños (U5), tarjetas y superficies (U6) y la limpieza de las revisiones (U7) | **Hecho y revisado** (2026-10-11). Capturas antes y después en claro y oscuro; guardas automáticas contra estilos fijos |
| Secciones de Proyectos contra el diseño v6 (S14, P1–P9) | **Hecho en código y commiteado en local**; falta la revisión nativa y las capturas claro/oscuro |
| Plan de entrega en PRs encadenados | Planeado, **nada creado ni publicado** |
| Brief del video para Claude Motion | Escrito (`docs/brief-video-direccion.md`) |

## 2. Antes de nada: levantar el entorno

1. Docker Desktop abierto. Comprueba que Supabase local esté arriba (12 contenedores): `docker ps`.
2. Base local al día: `npm run db:migrate:status:local` (debe decir "Database schema is up to date").
3. **El servidor de desarrollo se levanta desde Windows (PowerShell), no desde WSL:** `npm run dev` en la carpeta del proyecto. Desde WSL fallan los binarios de Next.
4. Abre `http://localhost:3000/login` en el navegador de Windows. Desde WSL, la app responde en `http://172.30.48.1:3000`.
5. Usuarios demo (contraseña `MuttuDemo2026!`, dominio `demo.muttuhub.local`): `admin@`, `gerencia@`, `coordinador@`, `colaborador@`.

Regla de oro: **todo comando que toque la base debe cargar `.env.local`** (los scripts `npm run db:*:local` ya lo hacen). El `.env` de la raíz apunta a un Supabase remoto con datos reales.

## 3. Probar tú mismo la demo (lo primero que falta)

Nadie ha visto esto con ojos humanos en un navegador, solo tests y capturas automáticas. Como `admin@`:

1. **Proyectos**: deberías ver `PRY-2026-001` (En ejecución) y `PRY-2026-002` (Borrador).
2. **Convertir en proyecto**: en Clientes, abre la oportunidad ganada "Demo · Programa de formación técnica…". El botón debe abrir el diálogo de crear proyecto con esa oportunidad elegida. Es la escena central de la demo y solo tiene tests unitarios.
3. **Ficha de `PRY-2026-001`**: "Ver detalle" abre `/proyectos/<id>` en una pestaña nueva. Revisa las seis pestañas, los chips de semáforo y "Volver a proyectos".
4. **Tablero** (`/proyectos?vista=tablero`): KPIs, tabla con semáforos y el botón "Ver detalle" visible.
5. **`PRY-2026-002`**: prueba "Aprobar línea base" solo si quieres gastarla: es irreversible sin restaurar la base (ver sección 6).
6. **Tema:** el botón de la cabecera alterna claro y oscuro. La app abre en claro.
7. **Móvil:** achica la ventana a menos de 768 px y revisa las tarjetas.

Anota qué pantalla y qué viste si algo falla, y se lo pasas a Claude.

Qué decirle a tu jefe como límites (detalle en `docs/guia-prueba-proyectos.md` §6): PDF no existe (solo Excel); no se puede cerrar ni cancelar un proyecto desde la interfaz; los umbrales de los semáforos están sin confirmar; todo está en local, no desplegado; el diseño no se ha comprobado en un teléfono real.

## 4. Decisiones que están esperando respuesta

1. **Clientes de prueba "sdd-invariant-linea-base-cliente-…"** en tu base local (los dejan los tests de invariantes; la barra lateral muestra 14 clientes y el seed crea 12). Salen en la primera pantalla de Clientes. Borrarlos es una escritura local con un script protegido; pídeselo a Claude.
2. **Seguir con U3** (barra lateral). Es el cambio visual más notorio que falta.
3. **Semáforos:** el seed solo muestra verdes. Un caso amarillo o rojo luce mejor en la demo, pero exige datos nuevos y restaurar la base.
4. **Producto (no son de interfaz):** umbral amarillo de la ficha (−15 o −20 pp) y color de "En curso" (magenta o amarillo), que el propio manual de identidad deja pendientes.
5. **`size:exception`:** casi todas las unidades del plan de PRs pasan de 400 líneas; un mantenedor debe aceptar la excepción.
6. **PRD:** el PRD v2 (agosto) solo describe cuatro módulos y no incluye Proyectos. Si el video o la dirección necesitan respaldo, hay que actualizarlo.

## 5. Trabajo técnico que sigue (en este orden)

| Unidad | Qué hace | Nota |
|---|---|---|
| **U3** Barra lateral | HECHA: blanca en claro, 220 px, ítem activo con tinte y barra rosa de 3 px | Revisada y aprobada |
| **U4** Tablas | HECHA: 35 cabeceras unificadas, 11 tablas crudas convertidas | Revisada y aprobada |
| **U5** Botones y campos pequeños | HECHA: ~290 controles auditados, 191 alturas y radios fijos eliminados | Revisada y aprobada (tres candidatos) |
| **U6** Tarjetas y superficies | HECHA: tokens `surface` y radios de 20 y 14 px; CRM, dashboard, kanban, documentos, reportes, administración, proyectos, shell y autenticación | Revisada y aprobada (tres candidatos; el de autenticación como riesgo alto, cuatro lentes) |
| **U7** Limpieza | HECHA: tamaños de letra de controles, guardas con analizador de etiquetas, contraste en oscuro de las píldoras de origen | Revisada y aprobada |
| Pendiente menor | Dos `Input` con `text-[13px]` en `kanban/task-dialog.tsx`, un botón con `rounded-lg` en `documents/document-dialog.tsx` y la constante `INLINE_INPUT_CLASS` de `crm/client-sheet.tsx` (alcance pendiente explícito en las guardas); tabla de Solicitudes a 390 px con Aprobar/Rechazar fuera de pantalla; Detalles de Clientes a 390 px con una sola columna; columna de casillas de Documentos como barra fina | Ver `odd/tasks/v2-ui-v6-base.md` |
| Después | Secciones de Proyectos contra el diseño v6: Portafolio con KPIs y barras de avance, ficha › Resumen con tarjetas KPI y "Requiere atención", Estructura, Avance, Presupuesto, Gastos, Tablero | Ver la comparación diseño vs app en la conversación de Engram |

Cada unidad sigue el mismo ritmo: documento ODD actualizado, worker con tests primero, capturas antes y después en claro y oscuro (las de "antes" están en el scratchpad de la sesión y pueden perderse; se regeneran), commit local y evaluación de riesgo.

## 6. Comandos útiles

```bash
# Estado de la base y migraciones (siempre local)
npm run db:migrate:status:local

# Seed de proyectos de la demo (en seco por defecto; --apply escribe; si ya está sembrado no cambia nada)
npm run db:demo:seed-projects:local
npm run db:demo:seed-projects:local -- --apply

# Reset del demo: SOLO borra proyectos en Borrador. NO puede borrar proyectos aprobados (triggers append-only)
npm run db:demo:reset:local -- --apply

# Restaurar la base local COMPLETA (BORRA TODO). Después hay que volver a sembrar
npm run db:migrate:reset:local
npm run db:seed:local
npm run db:demo:seed-projects:local -- --apply

# Calidad
npx tsc --noEmit
TZ=America/Bogota npx vitest run src/components src/app src/lib src/hooks --reporter=dot

# e2e (con el servidor arriba; el de la ficha necesita el seed de proyectos; el de la demo necesita una base SIN sembrar)
npx playwright test e2e/proyectos-ficha-pagina.spec.ts
npx playwright test e2e/proyectos-demo.spec.ts
```

Notas: `db:migrate:reset:local` puede ejecutar el seed por su cuenta (comportamiento de Prisma); no se verificó aquí, revisa el resultado con `db:seed:local`. Desde WSL, Playwright pasa por el `npx` de Windows y **no respeta** `PLAYWRIGHT_BASE_URL`: pon la URL en el spec.

## 7. Entrega: PRs encadenados

- Estrategia elegida: **Feature Branch Chain** (una rama de integración con un PR "tracker" en borrador; cada unidad apunta a la anterior). Mezclar estrategias no está permitido.
- El plan completo (21 unidades, commits por unidad, dependencias, archivos conflictivos y commits de arreglo por fusionar) está en `odd/tasks/v2-projects-delivery-chain.md`. El orden lo fuerzan las migraciones y es estrictamente serial.
- **No se ha creado ninguna rama de la cadena, ni push, ni PR.** Empezar es decisión tuya; Claude puede armar la cadena solo en local, unidad por unidad, con cherry-pick y verificando cada una.
- Antes de publicar: un mantenedor debe aceptar `size:exception`, y conviene dejar la UI en un estado estable (después de U3).

## 8. Video para dirección (Claude Motion)

- El brief está en `docs/brief-video-direccion.md`: 13 escenas, identidad del manual v2, cifras de la demo y una lista de lo que **no** debe mostrarse como terminado.
- **Grábalo después de U3**: si no, las capturas saldrán con la barra lateral oscura y la píldora rosa sólida.
- Pruébalo antes en el navegador: el clic de "Convertir en proyecto", los semáforos y las cifras de la demo dependen de la fecha en que se sembró.
- No digas "búsqueda global" (⌘K solo filtra el menú) ni "en producción".

## 9. Cómo retomar con Claude

Abre Claude Code en la carpeta del proyecto y dile algo como:

> Retoma desde `docs/pasos-siguientes.md` y la memoria de Engram `session/summary-2026-10-09`. Quiero seguir con U3 (barra lateral).

Qué se espera de Claude (reglas de esta sesión): documentar en `odd/tasks` antes de escribir código, delegar la implementación en un worker con tests primero, verificar por su cuenta lo que le reportan, no hacer push ni abrir PRs sin tu orden, y usar siempre `.env.local` para cualquier cosa que toque la base.

Revisión nativa (RDD): el recordatorio que aparece al terminar cada respuesta propone revisar **toda la rama contra `6bee83f`**; ignóralo, es demasiado grande. Lo correcto es revisar por rebanadas: Claude evalúa el riesgo de cada slice y, si corresponde, te muestra un consentimiento ("Revisar este cambio" u "Omitir esta vez"). Hoy no hay ninguna revisión pendiente.

## 10. Riesgos y cosas a tener presentes

- La base local contiene un proyecto **aprobado**; solo `db:migrate:reset:local` la limpia por completo.
- El módulo de Proyectos **no está desplegado**: la base remota no tiene la columna de la bandera gerencial. No se migra sin tu autorización.
- Hasta terminar U3 a U6 la interfaz mezcla estilos (barra lateral oscura con contenido claro); es esperado.
- Ficha en móvil (390 px): no se logró capturarla (el script automático no encontró el enlace "Ver detalle" en la vista de tarjetas). No se sabe si es un fallo del script o de la pantalla: revísalo a mano.
- Los textos del título "Muttu Hub" siguen apareciendo en otras rutas con detalle (por ejemplo, `/clientes/<id>`), porque el mapa de títulos es por ruta exacta. Solo se arregló la ficha de proyecto.
