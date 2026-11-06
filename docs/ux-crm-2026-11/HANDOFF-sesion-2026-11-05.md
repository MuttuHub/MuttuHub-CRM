# Traspaso — ajustes AJ-01 a AJ-06 y mejoras de UI (sesión del 2026-11-05)

Para retomar con otra cuenta de Claude Code. Léelo completo antes de tocar nada. El idioma de la UI es español
neutro con «tú»; commits en inglés convencional **sin** línea Co-Authored-By; PR en español con el pie
«🤖 Generated with [Claude Code](https://claude.com/claude-code)».

## 1. Qué ya está hecho

- **PR #145** `fix/aj01-registrar-avance-miembros` → `main` (8 commits, último `a505d88`, CI verde, sin mergear;
  el merge lo decide Adrián). Cubre AJ-01..AJ-06: permisos de «Registrar avance» por membresía, nombre en el
  historial, «90 %», «Registrar cantidad», atajo de cabecera, chip «Semáforo: …», etiqueta AJ-03, KPIs que cuentan
  los reportes, aviso de solo consulta, seed con los casos de la PO. Detalle en la descripción del PR.
- **Canvas de diseño** (privado): https://claude.ai/artifact/B2jBj1ScW9vrGFxWNEi5xC — página «AJ-01 a AJ-06» y
  página **«Mejoras UX»** (UX1–UX7: captura real vs. propuesta).
- **Video** de 2 min: `docs/ux-crm-2026-11/demo-aj01-aj06-2026-11-05.mp4` (ignorado por git, `.gitignore:85`).
- **Plan y hallazgos**: `docs/ux-crm-2026-11/plan-verificacion-aj-y-ux.md` (F1–F8, tabla pasa/falla).
- Memoria Engram (proyecto `muttuhub-crm`): buscar «PR #145», «AJ-01», «grupos 1 y 2».

## 2. Estado exacto del repo (verifícalo primero)

- **Copia principal** `C:\Users\Adrian\Documents\MuttuHub-CRM` en `docs/plan-backlog-completo`.
  `odd/tasks/proyectos-v3.md` modificado **no es de esta sesión** (es del tracker v3): no lo toques ni lo commitees.
  Sin commitear también: este archivo y `plan-verificacion-aj-y-ux.md`.
- **Worktree** `C:\Users\Adrian\Documents\MuttuHub-CRM\.claude\worktrees\aj01-review` en la rama
  **`fix/proyectos-ux-grupos-1-2`** (creada sobre `a505d88`, sin upstream). Tiene **trabajo sin commitear**:
  - Grupo 1 (mío, a medias): `src/components/proyectos/selector-archivo.tsx` (nuevo, listo) y su
    `selector-archivo.test.tsx`; pruebas nuevas en `ejecucion-avance.test.tsx` (anulado sin adjuntar, finalizada sin
    registrar; fixture `TECNICO` pasado a `EN_CURSO`), `ejecucion-avance-form.test.tsx` (submit «Registrar
    cantidad»), `gasto-form.test.tsx` («Elegir archivo»), `project-ejecucion.test.tsx` (fixture a1 `EN_CURSO`).
    Estas pruebas están en **RED a propósito**: falta la implementación (sección 4, T1).
  - Grupo 2: lo estaba haciendo un subagente escritor cuando se cortó la sesión. Puede estar completo, parcial o
    vacío. Revisa `git -C <worktree> status` y el diff de los archivos del grupo 2 (sección 4, T2).
  - `node_modules` del worktree es una **junction** a la copia principal (ya creada).
  - En ese worktree quedó abierta una revisión nativa de gentle-ai (lineage `review-e4c2215b709cebd6`). Adrián dijo
    «déjalo así»: no la abandones ni la continúes.

## 3. Reglas del entorno (lo que ya dolió)

- **Vitest y Next solo con `node.exe`** y **siempre** `--dir src` (o `--dir scripts`): sin eso levanta copias de
  `.claude/worktrees/*` y fallan pruebas ajenas.
  `node.exe node_modules/vitest/vitest.mjs run --dir src <patrón>`
- **tsc**: `node.exe node_modules/typescript/bin/tsc --noEmit -p .` — ignora errores bajo `.next/` (los genera
  `next dev`); cuenta solo los de `src/ scripts/ e2e/ prisma/`.
- **Base de datos**: solo `.env.local` (Docker local). **Nunca** `.env` (es la nube con datos reales). Scripts de datos
  deben importar `prisma/require-local-db` primero. Hay una regla que impide leer `.env.local`: respétala.
- **Servidor de desarrollo**: corre desde la **copia principal** (`.claude/launch.json`, `muttuhub-dev`, puerto 3000),
  porque el worktree no tiene `.env.local` y Next caería al `.env` de la nube. Para probar el código del worktree en el
  navegador: en la copia principal, `git stash push -m "<etiqueta única>" -- odd/tasks/proyectos-v3.md`, luego
  `git switch --detach <commit>`; al terminar `git switch docs/plan-backlog-completo` y `git stash apply <sha>` +
  `drop` buscando por la etiqueta. No uses `git stash` / `pop` sin etiqueta.
- **Login demo**: `coordinador@demo.muttuhub.local` (Laura Jiménez, Coordinadora), contraseña la del seed
  (`prisma/seed.ts:114`). Proyecto demo: PRY-2026-001 «Demo CedeTextil · En ejecución»
  (`/proyectos/579debc9-d3ce-4468-a5ca-3d9821d0df37`). Las actividades tienen como responsable a Andrés Torres.
- **gentle-ai**: al cerrar cada turno el hook de parada pide el preflight de revisión: corre el STATUS que indica y
  el START con `--consent=relay`; muestra el sobre de consentimiento a Adrián **sin responder por él**. Hasta ahora
  eligió «Omitir esta vez». El revisor en proceso **no se autentica** desde la app de escritorio (401).
- **Push**: con nombre explícito (`git push origin <rama>`); las ramas nuevas no deben trackear `origin/main`.

## 4. Pendientes, en orden

### T1 — Grupo 1 (aprobado por Adrián): implementar hasta que las pruebas RED pasen
1. `src/components/proyectos/ejecucion-avance.tsx`, `ReporteRow` (~línea 285): «Adjuntar archivo» solo si el reporte
   **no** está anulado: `canWrite && !anulado`.
2. Mismo archivo: una actividad con `tecnico.estado` `FINALIZADA` o `FINALIZADA_CON_RETRASO` **no** muestra
   «Registrar avance»; en su lugar, si `canWrite`, el texto exacto:
   «Actividad finalizada: ya no recibe avances. Si hay que corregir algo, anula el último avance o solicita una
   modificación.» (pasar `finalizada` de `EjecucionAvance` a `ActividadReportes`). Anular el último sigue disponible.
3. `src/components/proyectos/ejecucion-avance-form.tsx:235`: el botón de enviar pasa de «Registrar avance» a
   **«Registrar cantidad»**; y `e2e/proyectos-v2/ficha-ejecucion.spec.ts:78` igual.
4. Reemplazar los `<input type="file">` nativos por `SelectorArchivo` (props `id`, `onChange(file|null)`, `accept`,
   `disabled`, `inputRef`), conservando `id`, `ref` y etiqueta:
   `gasto-form.tsx:360`, `adjuntar-soporte.tsx:136`, `ejecucion-avance-form.tsx:197`, `ejecucion-avance.tsx:383`,
   `gastos-import-dialog.tsx:294`, `presupuesto-import-dialog.tsx:232`, `import-dialog.tsx:261`,
   `estructura-po-import-dialog.tsx:249`, `ficha/subir-documento-dialog.tsx:119` (los de import usan `<Input>`; ojo
   con `accept` y `disabled`). Ajusta las pruebas de esos componentes si consultan el input.

### T2 — Grupo 2 (aprobado): verificar lo del escritor y completar
Specs (exactamente esto):
- S1 Quitar el SectionHeader «Ficha financiera» bajo la subpestaña Finanzas (`project-financiero.tsx:43`); si otro
  consumidor lo necesita como único título, conservarlo ahí.
- S2 «E/P 40,3 %» → «40,3 % de lo programado» en las tarjetas; encabezado de tabla «E/P» → «% de lo programado».
- S3 La barra «Ejecutado» de cada rubro con el color de su semáforo (verde/amarillo/rojo); «Programado» gris; sin
  color → neutro.
- S4 «Semáforo provisional» (`vocabulario-seguimiento.tsx:51`) → «Umbrales sin confirmar», con su ⓘ explicando que
  Gerencia aún no confirma los umbrales.
- S5 Quitar el SectionHeader «Modificaciones» repetido (`project-modificaciones.tsx:59`).
- S6 Lista de gastos (`project-gastos.tsx`): periodo (AAAA-MM) bajo la fecha, manteniendo «Periodo modificado»; en el
  monto, total en negrita y debajo «Sin IVA» o «{subtotal} + IVA {iva}» (en vez de «IVA $ 0»).
- S7 Contadores cuando hay datos: «Gastos · N» (Finanzas), «Modificaciones · N» y «Versiones · N» (Historial),
  reutilizando los hooks existentes (`ficha/ficha-finanzas.tsx`, `ficha/ficha-historial.tsx`).
Cada spec con prueba en RED primero. Archivos permitidos: los nombrados y sus `*.test.tsx`, `project-ficha.test.tsx`,
`project-kpis-panel.test.tsx`, `ficha-resumen.test.tsx`, `e2e/proyectos-v2/**`.

### T3 — Cierre técnico
`vitest --dir src` completo, `--dir scripts`, tsc (fuera de `.next`), eslint de los archivos tocados. Revisión visual
en el navegador (sección 3) de: historial de la 1.1 (anulado sin adjuntar, finalizada sin registrar), formulario de
gasto («Elegir archivo»), Finanzas › Resumen, Historial › Modificaciones, lista de gastos.

### T4 — Entrega
Commits por unidad (G1 anulado/finalizada; G1 selector; G2 Finanzas; G2 gastos; G2 contadores), push con nombre,
PR **apilado** con base `fix/aj01-registrar-avance-miembros` (explica en el PR que es apilado porque comparte
archivos con #145 y que GitHub lo reapunta a `main` al mergear #145). Actualiza `plan-verificacion-aj-y-ux.md`.

### T5 — Pendiente de aprobación de la PO (no implementar sin su OK)
Grupos 3 y 4 del canvas: formulario de gasto por secciones, fila de actividad con tabla de entregables, historial
como línea de tiempo, estado vacío de Modificaciones, Finanzas con 3 cifras clave, cabecera con indicadores en número.
Recordar a Adrián que comparta el canvas (menú Share) para que la PO lo vea.

### T5b — Plan de mejoras de UI
Después de T1–T4, seguir `docs/ux-crm-2026-11/plan-mejoras-ui-proyectos.md` (inventario, auditoría de usabilidad,
Design System desde el código, diseños en Claude Design, validación con la PO; implementación solo con aprobación).

### T6 — Decisiones abiertas
F4 (¿PRY-2026-002 también con responsable distinto?), F7 (¿varios soportes al crear el gasto?), merge de #145.

## 5. Datos locales que quedaron cambiados por la demo
1.1: 30 % de Mateo Salazar anulado y 90 % de Laura al 2026-10-11 · 1.3: 50 % de Laura · 4 gastos con periodo = mes
de la fecha · FV-1001 con IVA 1.615.000 · 4 actividades de PRY-2026-001 con responsable Andrés Torres.

## 6. Prompt para pegar en la nueva sesión
> Retoma el trabajo de la sesión del 2026-11-05 en MuttuHub-CRM. Lee completo
> `docs/ux-crm-2026-11/HANDOFF-sesion-2026-11-05.md` y sigue sus reglas. Empieza verificando el estado del worktree
> `.claude/worktrees/aj01-review` (rama `fix/proyectos-ux-grupos-1-2`) y luego haz T1 → T2 → T3 → T4 en orden.
> No implementes T5 sin aprobación. Responde en español.
