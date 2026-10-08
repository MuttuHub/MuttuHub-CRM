# Guía de prueba paso a paso: sección Proyectos (v2)

Cubre lo construido en las slices S0–S3: crear un proyecto desde una oportunidad ganada, lista, ficha, historial
auditado, equipo (S2.6) y estructura técnica (S3). Todo corre en local; nunca contra el Supabase remoto.

## 0. Preparación

1. Base local arriba (Docker/Supabase en `127.0.0.1:54322`). Aplicar las migraciones nuevas (cuatro de S3 y la de
   membresías) **solo a la base local**:
   ```bash
   npm run db:migrate:status:local
   node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
   npm run db:generate:local
   ```
2. Dejar la demo en estado inicial (primero en seco, luego aplicar):
   ```bash
   npm run db:demo:reset:local
   npm run db:demo:reset:local -- --apply
   ```
3. Levantar el servidor: `npm run dev` (si lo levantas desde Windows y WSL no conecta, usa la IP de la puerta de
   enlace; ver `docs/guia-demo.md` §1.6). La primera carga de cada ruta puede tardar 30–60 s.
4. Usuarios (contraseña `MuttuDemo2026!`): `admin@`, `gerencia@`, `coordinador@`, `colaborador@` + `demo.muttuhub.local`.

## 1. Crear un proyecto (admin)

1. Entra como `admin@demo.muttuhub.local` y abre **Proyectos** en el menú.
2. La lista debe estar vacía. Pulsa el botón de crear: el diálogo lista oportunidades en estado **Ganada** (hay dos).
3. Elige una; se precargan cliente, nombre y valor. Completa fecha de inicio, fecha de fin, línea estratégica
   principal y municipios, y confirma.
4. Resultado esperado: el proyecto aparece como `PRY-2026-001` en estado **Borrador**, y esa oportunidad ya no sale
   como elegible.

## 2. Ficha del proyecto

1. En la fila, usa **Ver detalle**.
2. Revisa datos generales, líneas, municipios, duración en semanas (derivada de las fechas).
3. Al final, **Historial**: debe verse un paso "conversión de oportunidad + creación" y otro paso separado
   "Integrante del equipo" (el responsable se agregó como miembro al crear).

## 3. Equipo (S2.6)

1. En la ficha, sección **Equipo**: aparece el responsable.
2. Agrega a otro usuario con el selector. El servidor solo acepta **coordinadores activos**; si eliges otro rol,
   verás el mensaje de error del servidor (comportamiento esperado, el selector aún no filtra por rol).
3. Agregar al mismo usuario dos veces responde 409. Quitarlo lo marca como baja lógica (no se borra la fila).
4. Revisa el **Historial**: cada alta y baja queda auditada.
5. Visibilidad: entra como `coordinador@`. Solo debe ver los proyectos donde es miembro activo; si lo quitas, el
   proyecto desaparece de su lista de inmediato. `colaborador@` no ve la sección de gestión del equipo.

## 4. Estructura técnica (S3)

En la ficha de un proyecto en **Borrador**, como admin o gerencia:

1. **Objetivos**: crea uno (código y descripción). Aparece con contador de actividades e indicadores.
2. **Actividades**: dentro del objetivo, crea una con semana de inicio y fin.
   - Las fechas se muestran **calculadas** a partir de las semanas del proyecto; no se editan a mano.
   - Sin peso, el peso es la duración en semanas. Si escribes un peso, aparece la marca **Peso manual**.
   - Una semana fuera de la duración del proyecto responde error 400.
3. **Entregables**: dentro de la actividad, crea uno (código, descripción, cantidad meta, unidad, tipo de medio).
   Una actividad sin entregables muestra una advertencia.
4. **Indicadores**: dentro del objetivo, crea uno (código, nombre, meta, unidad, línea base opcional).
5. **Reglas a comprobar**:
   - Código repetido en el mismo proyecto: 409 (no distingue mayúsculas).
   - Borrar un objetivo con actividades o indicadores: 409. Borrar una actividad con entregables: 409.
   - Borra primero los hijos y luego el padre: debe funcionar.
   - Cada alta, cambio o borrado aparece en el **Historial**.
6. **Solo lectura**: entra como `coordinador@` (miembro) o `colaborador@`. La estructura se ve pero sin controles de
   edición. Un proyecto fuera de Borrador también queda de solo lectura con una nota que lo explica.

## 5. Ensayo automatizado (opcional)

```bash
npm run db:demo:reset:local -- --apply
npx playwright test e2e/proyectos-demo.spec.ts   # con el dev server arriba
npm run db:demo:reset:local -- --apply           # dejar limpio al terminar
```

## 6. Límites conocidos (para decirlo en la reunión)

Aún **no existen**: avances y semáforo de ejecución (S4), presupuesto y programación (S5), gastos y validación (S6),
plantilla Excel (S7), línea base y versiones (S8), dashboards (S9), diseño visual final (S10), ni el Gantt.
No hay edición de datos generales del proyecto desde la UI, ni filtro por rol en el selector del equipo. La
estructura solo la edita administración o gerencia, y solo en Borrador. Las revisiones nativas (RDD) de T4, T5 y de
S3 no se ejecutaron. Los valores por defecto de S3 (peso, borrado con hijos, medio exigido como texto libre) están
en `odd/tasks/v2-projects-s3-structure.md` y esperan confirmación del PO.
