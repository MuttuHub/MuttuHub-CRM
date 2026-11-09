# Plan de limpieza del código

Fecha: 2026-11-08. Objetivo: que los próximos cambios sean más fáciles de leer, ubicar y probar, sin cambiar el
comportamiento de la aplicación. Evidencia tomada de la rama `fix/proyectos-ficha-prototipo` (cifras redondeadas).

## Diagnóstico

| Problema | Evidencia | Costo hoy |
|---|---|---|
| Archivo gigante de hooks | `src/hooks/projects.ts`: 2947 líneas, 76 hooks, 108 tipos, descargas y `toast` en un solo archivo | Cada cambio de proyectos toca el mismo archivo; los conflictos entre PRs se concentran ahí |
| Formateadores duplicados | `fechaCorta` × 6, `nf` × 5, `formatPct` × 5, `formatMonto` × 4, `MESES_CORTOS` × 3 (uno dice «sept» y otro «sep»), `formatCOP` × 2 con firmas distintas; 23 usos sueltos de `Intl.DateTimeFormat` y 31 de `Intl.NumberFormat` | La misma fecha se ve distinta según la pantalla; corregir un formato exige buscarlo en 6 lugares |
| Estructura plana | `src/components/proyectos`: 58 archivos en la raíz y 34 en subcarpetas; la ficha nueva todavía monta componentes viejos de la raíz (`ProjectFinanciero`, `ProjectGastos`, `ProjectHistorial`) | Cuesta saber qué está vivo y dónde va un archivo nuevo |
| Código muerto | 7 archivos sin ninguna ruta que los alcance (`soportes-format.ts`, `crm/clientes-section-placeholder.tsx`, `ui/card.tsx`, `ui/page-header.tsx`, `ui/separator.tsx`, `proyectos-v3/{import-guards,lista-verificacion}.tsx`); unos 7 exports muertos (`useCreateBeneficiario`, `useVoidBeneficiario`, `useProjectBeneficiaries`, `BigValue`, `NumeroPaso`, `reintentarProyecto`, `formatoSoporte`); unos 110 `export` que nadie usa fuera de su archivo | Ruido al buscar; miedo a borrar |
| Sin red contra lo muerto | No hay knip ni ts-prune; `tsconfig` sin `noUnusedLocals`/`noUnusedParameters`; ESLint sin reglas propias | El código muerto vuelve a crecer |
| Componentes grandes | 18 `.tsx` de más de 500 líneas (`project-ejecucion` 620, `project-create-form` 606, `ficha-documentos` 517, `client-sheet` 1715, `repository-list` 1664…) | Revisión lenta; un cambio chico arrastra contexto grande |
| Desorden de documentos | Raíz con PDFs/HTML de guías y `voy-a-hacer-un-synthetic-rabin.md` (plan de agente colado); `docs/` con 101 archivos y planes repetidos; `odd/tasks` con 61 archivos, varios ya cerrados | Cuesta encontrar el plan vigente |
| E2E fuera de CI | 7 de 15 specs (`change-password`, `crm-demo`, `invitation-flow`, `oportunidad-ciclo`, `permisos-colaborador`, `proyectos-demo`, `proyectos-ficha-pagina`) no corren en ningún workflow; 3 configs de Playwright | Pruebas que se pudren sin que nadie lo note |
| Higiene de git | 22 worktrees (1 `prunable`), 96 ramas locales, 8 PRs abiertos | Confusión sobre qué rama es la buena; ya hubo un `next dev` sirviendo código viejo |
| Idiomas mezclados | API en inglés, páginas en español; `project-*` × 16 frente a ~76 nombres en español; `can*` y `puede*` | Hay que adivinar cómo se llama algo |

## Reglas de la limpieza

1. **Sin cambios de comportamiento.** Cada PR de limpieza deja igual la salida de la app; si algo cambia (por ejemplo
   «sept» → «sep»), va en un PR aparte y con decisión explícita.
2. **Una familia por PR**, de unas 400 líneas como máximo, con `vitest --dir src`, `tsc`, `eslint` y el e2e de
   proyectos en verde.
3. **Primero la red, después la poda:** herramientas que detectan lo muerto antes de borrar.
4. **Regla del boy scout para lo grande:** los componentes de más de 500 líneas se parten cuando una tarea los toca,
   no en un PR gigante.
5. **Nada en paralelo con features que tocan los mismos archivos** (por ejemplo `hooks/projects.ts` con PRs abiertos
   que lo modifican): primero se integra o se cierra lo abierto.

## Fases

| Fase | Qué | Tamaño | Terminado cuando |
|---|---|---|---|
| **L0 · Higiene de git** | Cerrar o integrar los 8 PRs abiertos; `git worktree prune` y borrar los worktrees de ramas ya integradas; borrar ramas locales integradas (con squash, verificar contra `origin/main` por contenido o PR cerrado) | S | `git worktree list` con solo los activos; ramas locales = ramas con trabajo vivo |
| **L1 · Red** | Agregar `knip` en modo reporte (sin fallar CI) y guardar la línea base; activar `noUnusedLocals` y `noUnusedParameters` en `tsconfig` | S | CI publica el reporte de knip; `tsc` limpio con las reglas nuevas |
| **L2 · Poda** | Borrar los 7 archivos muertos y los ~7 exports muertos con sus tests; quitar `export` de lo que solo se usa dentro de su archivo; después, knip pasa a **fallar** CI ante código muerto nuevo | S–M | knip en 0 hallazgos y bloqueando |
| **L3 · Formateadores únicos** | Crear `src/lib/format/fechas.ts` y `src/lib/format/numeros.ts` (fecha de calendario, instante, día-mes, mes corto, COP, porcentaje, entero) con pruebas; migrar los usos por módulo (proyectos, CRM, kanban, impresión), un PR por módulo | M | Ningún `Intl.*Format` fuera de `lib/format`; una regla de ESLint (`no-restricted-syntax`) lo impide |
| **L4 · Partir `hooks/projects.ts`** | `src/hooks/projects/{keys,types,estructura,ejecucion,gastos,presupuesto,documentos,versiones,kpis,descargas}.ts` con un `index.ts` que reexporta todo, así ningún import cambia en el primer paso | M | Ningún archivo de hooks pasa de ~500 líneas; los imports siguen funcionando |
| **L5 · Ordenar `components/proyectos`** | Mover los 58 archivos de la raíz a carpetas por sección (`ficha/*`, `portafolio/`, `estructura/`, `importar/`, `compartido/`); terminar de llevar `ProjectFinanciero`, `ProjectGastos` y `ProjectHistorial` dentro de `ficha/` | M | La raíz solo tiene `index`/compartidos; cada sección de la ficha vive en su carpeta |
| **L6 · Documentos y pruebas** | Archivar `odd/tasks` cerrados en `odd/archive/`; un solo plan vigente (`docs/plan-trabajo-restante.md`); guías publicadas solo en un formato fuente (md) y el resto generado; sacar `voy-a-hacer-un-synthetic-rabin.md`; decidir por cada spec e2e fuera de CI si entra o se borra | S–M | `docs/` sin duplicados; los 15 specs o corren en CI o no existen |
| **L7 · Convención de nombres** | Escribir la convención (por ejemplo: identificadores en inglés, términos de dominio en español sin traducir, permisos siempre `can*`) y aplicarla **solo a código nuevo** y a lo que se mueva en L5 | S | Convención en `AGENTS.md` y aplicada en las revisiones |
| **L8 · Componentes grandes** | Partir los 18 `.tsx` de más de 500 líneas cuando una tarea los toque (container + presentacionales, como ya hace la ficha) | continuo | Cada componente tocado queda por debajo de ~400 líneas |

**Orden sugerido:** L0 → L1 → L2 → L3 (proyectos primero) → L4 → L5 → L6, con L7 y L8 de forma continua. L0 a L2
caben en uno o dos días; L3 a L5 son una semana repartida en PRs chicos.

## Riesgos

- **L3 cambia texto visible** si se unifican formatos que hoy difieren («sept» frente a «sep», «05 de oct de 2026»
  frente a «05 oct 2026»). Elegir el formato canónico con la PO antes de migrar.
- **L4 y L5 generan conflictos** con cualquier PR abierto que toque los mismos archivos: hacerlos con la cola de PRs
  vacía.
- **Mover archivos rompe el historial de `git blame`** si se mezcla con cambios: cada movimiento va en su propio commit,
  sin editar contenido.
