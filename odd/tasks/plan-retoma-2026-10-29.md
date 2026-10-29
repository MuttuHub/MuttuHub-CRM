# Plan de retoma — 2026-10-29 (noche)

Documento de continuidad para retomar sin releer nada. Todo el trabajo está pusheado; nada vive solo en
una máquina. Repo: `MuttuHub/MuttuHub-CRM`. Directorio de trabajo: `/mnt/c/Users/Adrian/Documents/MuttuHub-CRM`.

Origen: sesión del 29-oct que revisó el documento de la PO «Ajustes al módulo Proyectos» v1.1
(`docs/Hub-proyectos261028.docx`) y llevó AJ-01 desde «rama local sin PR» hasta una cadena de PRs revisable.

---

## 0. Estado en una línea

La cadena de AJ-01 está **completa, verificada y lista para mergear**. Suite completa confirmada en
**4734/4735** (el único fallo es un test de DB viva preexistente, ajeno a esta rama).
**Lo único que falta es mergear y cerrar #112.** Nada está bloqueado por trabajo pendiente.

---

## 1. Lo primero al llegar (5 minutos)

### 1.1 Suite completa — YA CONFIRMADA ✅

La corrida final cerró antes de dejar la oficina: **4734/4735 en verde (422 de 423 archivos).**

El único fallo es `prisma/municipios.invariant.test.ts` → «accepts INSERT into municipios», un test de
**base de datos viva**. Es el mismo fallo preexistente que ya registró AJ-06 en su cierre (`odd/tasks/
aj06-soportes-multiples.md`, entrada L9), y esta rama **no toca ese archivo**
(`git diff --name-only origin/main HEAD | grep municipios` → vacío).

**No es una regresión. No hay nada que arreglar acá.**

> Contexto por si vuelve a aparecer: la corrida intermedia había dado 4 fallos, todos `Test timed out in
> 5000ms` en `src/components/proyectos/ficha/editar-datos-generales.test.tsx` (archivo no tocado por esta
> rama; aislado pasa 12/12). Era carga del entorno — esa corrida tardó 586 s contra 396 s normales. La
> corrida final, más tranquila, los pasó todos. Lección: antes de sospechar del código, correr el archivo
> solo.

### 1.2 Confirmar el estado de los PRs

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,mergeStateStatus
```

---

## 2. La cadena de entrega: mergear en este orden

Cada PR tiene su base en una rama real, no en un rebase adivinado: al mergear uno, GitHub reapunta la base
del siguiente sola. **El orden no es opcional.**

| Orden | PR | Contenido | Base | Tamaño |
|---|---|---|---|---|
| 1 | **#113** | 1/4 esquema + dominio (migración `ReporteActividad`, `avance.ts`) | `main` | +714 / 5 archivos |
| 2 | **#114** | 2/4 API + gates + `tope_en_curso` | #113 | +1372 / 21 archivos |
| 3 | **#119** | 3/4 UI «Registrar avance» + historial | #114 | +937 / 6 archivos |
| 4 | **#120** | 4/4 docs + higiene CRLF (`.gitattributes`) | #119 | +602 / 7 archivos |

**#117** (documentos AJ-02/AJ-03) es **independiente**, va contra `main`. Puede mergearse en cualquier momento,
antes o después de la cadena.

```bash
gh pr merge 113 --squash --delete-branch   # esperar a que GitHub reapunte #114
gh pr merge 114 --squash --delete-branch
gh pr merge 119 --squash --delete-branch
gh pr merge 120 --squash --delete-branch
gh pr merge 117 --squash --delete-branch
```

**Antes de mergear #113**, recordar que lleva una migración (`20261029120000_v2_reportes_actividad`). Ya está
aplicada en local y verificada idempotente, pero en producción se aplica aparte, como se hizo con AJ-04/AJ-05.

---

## 3. Cerrar el PR #112 (el monolito)

**#112** es la versión original de AJ-01: 3588 líneas, 18 commits, un solo PR. Sigue **abierto**.

**Ahora es seguro cerrarlo.** Se comprobó que la cadena quedó **con cero diferencia de código** contra él:

```bash
git diff --stat origin/feat/aj01-estado-en-curso origin/feat/aj01-4-docs-v2 -- 'src/**' 'prisma/**'
# → vacío
```

La única diferencia son +37 líneas de documentación en `odd/tasks/aj01-estado-en-curso.md` (el registro de la
verificación de riesgos, que el monolito no tiene). No queda contenido único ahí.

```bash
gh pr close 112 --comment "Reemplazado por la cadena #113 → #114 → #119 → #120. Verificado que la cadena no
tiene diferencia de código contra esta rama (git diff vacío en src/ y prisma/), así que no pierde nada. Se cierra
a favor de rebanadas revisables de ~700-1400 líneas en vez de 3588."
```

> Esperar a que la cadena esté mergeada antes de cerrarlo, para no dejar AJ-01 sin nada abierto si algo falla.

---

## 4. Después de mergear: qué queda del documento de la PO

Estado de las 6 reglas, verificado contra código (no contra lo que declaran los documentos):

| ID | Regla | Estado |
|---|---|---|
| AJ-01 | En curso con reporte de avance | **Se cierra con esta cadena** |
| AJ-02 | Peso = duración en semanas | **Documento listo** (`odd/tasks/aj02-peso-duracion.md`), sin implementar |
| AJ-03 | Atraso por ejecución, no por soportes | **Documento listo** (`odd/tasks/aj03-atraso-por-ejecucion.md`), sin implementar |
| AJ-04 | Subtotal + IVA | **Hecho**, en producción (#99, migración aplicada 28-oct) |
| AJ-05 | Periodo por fecha del documento | **Hecho** (#99) |
| AJ-06 | Varios soportes, botón visible | **Hecho**, mergeado (#108) |

**Siguiente frente: AJ-02, después AJ-03.** Ambos dependen de que AJ-01 aterrice (consumen la tabla
`ReporteActividad` y el parámetro `tope_en_curso`), así que **no arrancar antes del merge**.

La decisión que bloqueaba AJ-02 ya está resuelta y registrada en su documento (S6): el peso usa «el mayor entre
el último reporte y el promedio de entregables», no la línea literal de la PO. Con el razonamiento escrito.

---

## 5. Deuda de higiene (no urgente, sí real)

No se tocó para no mezclarla con la entrega. Merece su propia sesión:

- **75 ramas locales, 21 worktrees, 74 ramas sin mergear en `main`.** Varias son post-squash huérfanas
  (`feat/aj06-soportes-multiples` figura «ahead 5» aunque su PR #108 está mergeado).
- **No borrar a ciegas:** verificar por contenido, no por ancestoría (el squash rompe `git branch --merged`).
- Los worktrees **`aj01-verify-base`** y **`aj01-verify-src`** ya cumplieron su función (fueron los de la
  verificación de riesgos) y se pueden podar:

```bash
git worktree remove /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/aj01-verify-base
git worktree remove /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/aj01-verify-src
git worktree prune
```

- Las ramas `feat/aj01-3-ui` y `feat/aj01-4-docs` (las reemplazadas por `-v2`) también se pueden borrar una vez
  mergeada la cadena.

---

## 6. Contexto técnico que conviene no re-descubrir

- **El ruido CRLF estaba resuelto en la raíz**, no con `git restore` cada vez: `.gitattributes` con
  `* text=auto eol=lf` + binarios explícitos. Antes, cada checkout marcaba ~80 archivos como modificados con
  cero contenido detrás, lo que entrena a ignorar `git status`.
- **El `.docx` de la PO está marcado binario.** Estaba expuesto a corromperse con un checkout `autocrlf=true`.
  Se verificó byte-idéntico al original.
- **`psql` no existe en el host.** Para tocar la DB local: `docker exec supabase_db_muttu-hub psql -U postgres -d postgres`.
- **Las pruebas de migración se hacen dentro de `BEGIN … ROLLBACK`**: así se verifica sin escribir datos.
- **La versión buena de `ejecucion-avance.test.tsx` tiene 619 líneas.** Si en algún momento vuelve a aparecer
  una versión de ~330, es la vieja y se perdió cobertura de la UI de reportes.
- **`gh pr edit` no cambia la rama head** de un PR (solo la base). Para reapuntar hay que cerrar y reabrir.

---

## 7. Riesgos conocidos

| Riesgo | Estado |
|---|---|
| Migración `ReporteActividad` en datos almacenados | Verificada: idempotente, CHECKs probados en filas reales. Aplicar en producción por separado. |
| Gate de permisos por responsable | Verificado: 31/31, con casos negativos (403 no-responsable, 403 COLABORADOR). |
| PR #112 mergeado por error | Mitigado: cerrarlo (sección 3). Si se mergea antes que la cadena, la cadena queda redundante. |
| Suite completa con timeouts bajo carga | Conocido y acotado a `*.invariant.test.ts` y a tests de UI lentos. Verificar aislado antes de alarmarse. |

---

## 8. Orden sugerido de la noche

1. Mergear #117 (independiente, sin riesgo) — 1 min.
2. Mergear la cadena #113 → #114 → #119 → #120 — 5 min.
3. Cerrar #112 (sección 3) — 1 min.
4. Podar los dos worktrees de verificación (sección 5) — 1 min.
5. Si hay energía: abrir la rama de AJ-02 y empezar T1 (migración de pesos por duración).

Total: menos de 10 minutos hasta tener AJ-01 entregado.
