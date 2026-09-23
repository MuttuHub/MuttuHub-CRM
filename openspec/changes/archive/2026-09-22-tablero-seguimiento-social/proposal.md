# Proposal: tablero-seguimiento-social — Tablero de Seguimiento y Gestión de Proyectos de Impacto Social

## Intent

`oportunidades-comerciales` (PRs #44-46, en `main`) cerró el lado comercial: una `Oportunidad` llega a `GANADA` y se convierte (`fase = EJECUCION`, `fecha_adjudicacion`, auditado). Ahí se detiene. La decisión **D2 de ese change difirió explícitamente la entidad `Proyecto`** con presupuesto, cronograma e impacto social. Este change es ese diferido: hoy una oportunidad adjudicada no se convierte en nada ejecutable — no hay metas, cronograma, presupuesto por rubro, indicadores, soportes ni tablero gerencial. Dirección no puede responder "¿este proyecto va en tiempo y en plata?".

Greenfield total: `prisma/schema.prisma` (496 líneas) no tiene `Proyecto`, `Meta`, `Actividad`, `Presupuesto`, `Rubro`, `Indicador` ni `Beneficiario` en ninguna rama.

| RF | Estado hoy | Hueco |
|----|-----------|-------|
| RF-01 creación/ficha de proyecto | ❌ | Solo existe `Oportunidad`; `proyectos_relacionados` es un `String?` suelto |
| RF-02 cronograma de actividades ligadas a metas | ❌ | `Tarea` es Kanban+CRM+comercial, no cronograma con línea base |
| RF-03 semáforo técnico | ❌ | No hay medición de avance |
| RF-04 / RF-06 soportes (archivos **y enlaces externos**) | 🟡 | `AdjuntoTarea`/`Documento` asumen objeto subido; `storage_path` no admite URL |
| RF-05 / RF-07 presupuesto por rubro y semáforo financiero | ❌ | Nada de ejecución presupuestal |
| 3.4 Tablero de Control Gerencial | ❌ | `DashboardTabs` tiene 4 caras; sin gauge, curva S ni radar (no hay librería de gráficos en `package.json`) |
| RNF-01..03 | ❌ | No hay rol "Visualizador/Directivo" — ningún `RolUsuario` es solo-lectura |

## Scope

**In:** RF-01 a RF-07 + módulo KPI 3.4 + RNF-01 a RNF-03.
- Entidad `Proyecto` (código, cliente, territorio, línea estratégica, fechas, estado, trazabilidad a la oportunidad) y su CRUD con permisos.
- `Meta` + `Actividad` (cronograma con línea base vs. real) y avance técnico con semáforo.
- `Presupuesto` por `Rubro` (catálogo administrable), ejecución y semáforo financiero.
- Soportes por proyecto/actividad/gasto: archivo subido **o** enlace externo.
- Quinta "cara" del dashboard: Tablero de Control Gerencial (tacómetro, curva S, radar, tarjeta Beneficiarios Atendidos/Meta) reutilizando el shell y la convención `/print/dashboard/{cara}`.
- Acceso de solo-lectura gerencial (RNF-01) y auditoría de las acciones nuevas (RNF-03).

**Out (diferido explícitamente):** multi-tenant / multi-organización; notificaciones o alertas al cambiar de color el semáforo; exportación a PDF/Excel más allá de `/print/dashboard/{cara}` ya existente; registro nominal de beneficiarios con datos personales (ver D6); multi-moneda (ver D4); auto-creación de `Proyecto` dentro del endpoint de conversión (ver D1); migración de `Tarea` existentes a `Actividad`.

## Capabilities

### New
- **`project-tracking`** — `Proyecto`: identidad, ficha, estados, trazabilidad `Cliente`/`Oportunidad` (RF-01).
- **`project-schedule`** — `Meta` + `Actividad`, cronograma, línea base vs. ejecución, avance técnico y semáforo (RF-02, RF-03).
- **`project-budget`** — catálogo `Rubro`, presupuesto planificado vs. ejecutado, semáforo financiero (RF-05, RF-07).
- **`project-attachments`** — soportes con archivo **o** URL externa, espejo opcional a `Documento` (RF-04, RF-06).
- **`management-dashboard`** — quinta cara KPI: tacómetro, curva S, radar, beneficiarios (3.4, RNF-02).
- **`project-access-control`** — visibilidad gerencial de solo lectura y gates de edición (RNF-01).

### Modified
None — `openspec/specs/` no existe todavía en este repositorio.

## Approach

Módulo nuevo, no extensión del Kanban. `Proyecto` es un agregado propio bajo `Cliente`, con un vínculo de trazabilidad opcional hacia la `Oportunidad` que lo originó. Se reutilizan los patrones ya probados del change anterior: soft delete (`deleted_at`), `Decimal(15,2)` en COP, enums Prisma para listas cerradas, catálogo en tabla para listas abiertas, FK compuesta `@@unique([id, padre_id])` + `CHECK` de Postgres para invariantes de pertenencia, predicados componibles en `permissions.ts` (sin middleware genérico), y `logAudit` con las uniones `AuditEntidad`/`AuditAccion` ampliadas. TDD estricto.

## Decisiones

**D1 — Acoplamiento `Proyecto` ↔ `Oportunidad` (el fork central).** Se elige el **Enfoque 1 (desacoplado con enlace explícito)**: `Proyecto.cliente_id` requerido (misma forma que `Oportunidad`) y `Proyecto.oportunidad_id String? @unique` opcional. El `Proyecto` **no** se crea automáticamente dentro de `convert/route.ts`; se crea con una acción propia "Crear proyecto desde oportunidad ganada" que pre-llena el formulario y setea `oportunidad_id` (auditado, `@unique` impide dos proyectos sobre la misma oportunidad). *Razón:* los campos obligatorios del `Proyecto` (código, territorio, línea estratégica, cronograma, presupuesto) no se pueden capturar en un clic, y el enfoque acoplado chocaría además con D7 del change anterior (`fase = EJECUCION` es terminal: un `Proyecto` auto-creado mal no se podría rehacer). La FK nullable deja la puerta abierta a auto-crear más adelante sin migración destructiva.

**D1-bis — Riesgo de regresión sobre `convert/route.ts` (ya en producción, 11/11 verde).** D1 lo **no modifica**: es la mitigación principal. Si un cambio futuro exige tocarlo, la regla es: extender `convert/route.test.ts`, nunca reescribirlo, y los 11 escenarios existentes deben seguir pasando **sin modificación**. Lo único admitido en este change sobre ese endpoint es lectura (la UI de la oportunidad en `EJECUCION` muestra un CTA / el proyecto vinculado si existe), sin tocar su payload de escritura ni su guardia de idempotencia (409).

**D2 — RF-02: modelo `Actividad` nuevo, no extender `Tarea`.** *Razón:* `Tarea` ya carga tres propósitos (Kanban, CRM, comercial vía `oportunidad_id`) y el propio design anterior marcó ese costo. `Actividad` necesita semántica que `Tarea` no tiene: pertenencia a `Meta`, peso/ponderación, fecha planificada vs. real (insumo de la curva S) y % de avance. Invariante: `Meta @@unique([id, proyecto_id])` + relación compuesta `Actividad(meta_id, proyecto_id)` + `CHECK` de Postgres, igual que `Tarea↔Oportunidad`.

**D3 — RNF-01 "Visualizador/Directivo": flag ortogonal, no quinto `RolUsuario`.** `Usuario.puede_ver_tablero_gerencial Boolean @default(false)`, compuesto como `canViewManagementDashboard(u) = canManageAny(u.rol) || u.puede_ver_tablero_gerencial`. *Razón:* se sigue el precedente firmado por el owner en D3 del change anterior (`gestiona_oportunidades`): `rol` es un enum de valor único y meterle un eje de visibilidad fuerza un o-esto-o-lo-otro falso (alguien puede ser ejecutor **y** directivo) y obliga a migrar a todos los usuarios. La condición de "solo lectura" se obtiene por composición: el flag otorga lectura y **no** habilita ningún predicado de escritura.

**D4 — Moneda y precisión: COP únicamente, `Decimal(15,2)`, sufijo `_cop`.** *Razón:* precedente literal `Oportunidad.valor_estimado_cop`; no existe multi-moneda en ninguna parte del esquema y el documento no la pide. Multi-moneda exigiría tabla de tasas y semántica de fecha de conversión en todos los reportes: diferido.

**D5 — Catálogos: dos formas distintas.** `LineaEstrategica` como **enum Prisma** (lista cerrada y nombrada de 8 ítems: Empleabilidad, Emprendimiento, Productividad, Cultural, Social, Cívico-político, Método Muttu, Ambiental). `Rubro` como **tabla de catálogo administrable** (`nombre`, `activo`, `deleted_at`), no enum y no string libre. *Razón:* el documento cierra la lista de rubros con "etc." — un enum obliga a migración por cada rubro nuevo; un string libre (patrón `Documento.categoria`) rompe la agregación presupuestal por escritura inconsistente. La tabla da ambas cosas: administrable sin desplegar código y con FK que garantiza agregados correctos.

**D6 — `Beneficiario`: contadores, no registro nominal.** `Proyecto.beneficiarios_meta Int` + atendidos derivados de las mediciones de `Indicador`. *Razón:* el único requisito declarado es una tarjeta resumen "Atendidos / Meta"; un registro nominal implica datos personales (Ley 1581 de habeas data), consentimiento, deduplicación y borrado — alcance grande sin pedido del negocio. Compatible hacia adelante: una tabla `Beneficiario` futura convierte el contador en derivado sin romper el esquema.

**D7 — Gráficos 3.4: primitivas SVG propias, sin nueva dependencia.** Se construyen `Gauge`, `CurvaS` y `Radar` con el mismo estilo de casa que `sparkline.tsx` y `BarRow`. *Razón:* son tres gráficos estáticos, y la convención `/print/dashboard/{cara}` exige SVG determinista y renderizable en impresión — la mayoría de librerías miden el DOM y se rompen ahí. Cero bundle nuevo y cero mantenimiento externo. *Escape hatch:* si la fase de diseño detecta requisitos de interacción (tooltips, zoom, drill-down) que excedan estas tres primitivas, se reevalúa con **una** librería liviana.

**D8 — RF-04 enlaces externos: columna `url_externa` con XOR en base de datos.** En la fila de soporte, `storage_path String?` y `url_externa String?`, ambas nullable, con un `CHECK` de Postgres que exige exactamente una no nula; `nombre` obligatorio en ambos casos; `documento_id` nullable como espejo opcional al repositorio central, sin cascada (mismo contrato que `AdjuntoTarea`). Validación de esquema `https` únicamente. *Razón:* una sola lista de soportes en la UI, sin segunda tabla polimórfica ni tipos de adjunto divergentes.

**D9 — RNF-02 "< 3 s": presupuesto de rendimiento, no requisito bloqueante.** Se trata como objetivo medido (p95 del endpoint agregado del tablero sobre un dataset sembrado de referencia: ~50 proyectos × 20 metas × 200 actividades). Compromisos de ingeniería sí vinculantes: **un solo endpoint agregado** (no N+1), agregación en SQL (`groupBy`), índices en `(proyecto_id)`, `(deleted_at)` y en las claves de fecha del cronograma. *Razón:* no existe ningún SLA documentado ni monitoreo en el repositorio con el cual comparar o hacerlo exigible. Escalada diferida si no se cumple: tabla de snapshot/materialización precalculada.

**D10 — ✅ CONFIRMADO — Umbrales de semáforo (RF-03 técnico y RF-07 financiero).**

> **Confirmado por el negocio (2026-09-18).** El documento de requisitos decía "Pendiente por definir"; el owner confirmó los cortes exactos vía el usuario, en tres rondas: (1) bandas técnicas, (2) mismas bandas para el financiero, (3) el financiero es bidireccional (alerta también por sobre-ejecución, no solo por atraso).
>
> | Semáforo | Métrica | Verde | Amarillo | Rojo |
> |---|---|---|---|---|
> | Técnico (RF-03) | avance real / avance planificado a la fecha de corte | > 85 % | 60 % – 85 % | < 60 % |
> | Financiero (RF-07) | ejecutado / planificado a la fecha de corte (bidireccional) | 85 % – 115 % | 60 % – 85 % ó 115 % – 140 % | < 60 % ó > 140 % |
>
> El semáforo financiero es **bidireccional**: la sobre-ejecución (gastar más rápido de lo presupuestado) es una alerta igual que el atraso. Los cortes 115 %/140 % son un espejo simétrico de 85 %/60 % alrededor del 100 %, propuesto por el equipo técnico y aceptado por el negocio — no son un número que el owner haya dictado literalmente, a diferencia de los cortes técnicos (60/85) que sí vinieron directos de él.
>
> **Nota de diseño (sigue vigente):** los umbrales se almacenan como **parámetros configurables** (defaults a nivel organización, override opcional por proyecto), nunca como constantes en el código — así que aunque el negocio ajuste estos números más adelante, el cambio sigue siendo un dato, no un despliegue.
>
> **Nota técnica para `sdd-design`/`sdd-tasks`:** "% ejecutado"/"% avance" en el semáforo financiero debe leerse como *ritmo* (gasto real a la fecha vs. gasto planificado a la fecha), no como *total* (gasto acumulado / presupuesto total) — de lo contrario la sobre-ejecución no es detectable a mitad de proyecto.

## Affected Areas

| Área | Impacto | Qué cambia |
|------|---------|------------|
| `prisma/schema.prisma` | Modified | Nuevos: `Proyecto`, `Meta`, `Actividad`, `Presupuesto`/línea presupuestal, `Rubro`, `Indicador`, `SoporteProyecto`, enum `LineaEstrategica`, parámetros de semáforo, `Usuario.puede_ver_tablero_gerencial` |
| `prisma/migrations/` | New | FKs compuestas + `CHECK` de pertenencia + `CHECK` XOR de soporte + seed del catálogo de rubros |
| `src/app/api/v1/projects/**` | New | CRUD de proyecto, metas, actividades, presupuesto, soportes, avance |
| `src/app/api/v1/dashboard/**` | New/Modified | Endpoint agregado único del tablero gerencial |
| `src/lib/permissions.ts`, `src/lib/api/crm.ts` | Modified | `canViewManagementDashboard`, `canManageProject`, alcance de lectura |
| `src/lib/api/files.ts` | Modified | Soportes de proyecto + validación de URL externa |
| `src/components/dashboard/*` | Modified/New | Quinta cara en `CARAS`; primitivas `Gauge`, `CurvaS`, `Radar` |
| `src/lib/api/audit.ts` | Modified | Ampliar `AuditEntidad`/`AuditAccion` (`proyecto`, `presupuesto`, `actividad`, …) |
| `openapi/paths/` | Modified | Contratos del módulo |
| `.../opportunities/[opportunityId]/convert/route.ts` | **Sin cambios** | Solo lectura desde UI; ver D1-bis |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Umbrales de semáforo nunca confirmados → se implementa un corte inventado | ~~Alta~~ Resuelto | D10 confirmado por el negocio (2026-09-18); umbrales igual quedan como parámetro configurable, no constante |
| Regresión en `convert/route.ts` (11/11 verde, ya en `main`) | Baja (por D1) | No se toca; si se tocara: extender tests, jamás reemplazarlos |
| Esquema grande en un solo PR → revisión inviable | **Alta** | PRs encadenados (ver Tamaño) |
| Fuga de lectura por `Actividad` apuntando a `Meta` de otro proyecto | Med | FK compuesta + `CHECK` + test de invariante dedicado (precedente `Tarea↔Oportunidad`) |
| Tres primitivas SVG propias salen más caras de lo estimado | Med | Escape hatch de D7 evaluado en `sdd-design`, antes de `sdd-apply` |
| `< 3 s` (RNF-02) tratado como bloqueante por el negocio | Med | D9 lo declara presupuesto medido; confirmar con el owner en revisión de propuesta |

## Rollback Plan

Todo el módulo es **aditivo**: modelos nuevos + una columna nullable con default (`Usuario.puede_ver_tablero_gerencial`). Revertir = bajar la migración (ningún modelo preexistente pierde datos; `Cliente` y `Oportunidad` quedan intactos porque la FK vive del lado de `Proyecto`) y quitar la quinta cara del array `CARAS`. Falla parcial del tablero gerencial: se retira la cara sin tocar el esquema ni las APIs. Falla de permisos: `canViewManagementDashboard` vuelve a `canManageAny` sin revertir nada más. Al no modificarse `convert/route.ts`, no hay rollback del ciclo comercial ya entregado.

## Dependencies

- **El documento de requisitos del negocio no está en el repositorio.** El texto exacto de RF-05, RNF-01 y RNF-03 no es recuperable desde el código; `sdd-spec` debe recibirlo inyectado o especificará sobre esta propuesta únicamente.
- ~~Firma del negocio sobre **D10** (umbrales) antes de implementar el corte~~ — **Confirmado 2026-09-18**, ver D10 arriba.
- Confirmación del owner sobre **D1** (proyecto no auto-creado en la conversión), **D6** (sin registro nominal de beneficiarios) y **D9** (RNF-02 no bloqueante).
- `oportunidades-comerciales` ya está en `main` (PRs #44-46): no hay dependencia de rama pendiente.

## Tamaño estimado

Muy por encima del presupuesto de 400 líneas por PR: ~7 modelos nuevos, migración con restricciones a mano, 4 familias de endpoints, permisos, adjuntos y 3 primitivas de gráfico. **Se anticipa `Chained PRs recommended: Yes`**; `sdd-tasks` emite el forecast formal. Corte propuesto en 4 slices autónomos: (1) esquema + migración + catálogo de rubros; (2) `Proyecto` CRUD + permisos + vínculo con la oportunidad; (3) metas/actividades/cronograma + soportes con URL externa; (4) presupuesto + semáforos parametrizados + tablero gerencial.

## Success Criteria

- [ ] Un `Proyecto` se crea desde una `Oportunidad` en `EJECUCION`, queda vinculado por `oportunidad_id` (único) y la acción se audita — sin modificar el endpoint de conversión ni sus 11 escenarios verdes
- [ ] Ninguna `Actividad` puede apuntar a una `Meta` de otro proyecto (test de invariante contra la base de datos, no solo validación de API)
- [ ] El presupuesto agrega por `Rubro` del catálogo administrable y el semáforo financiero lee los umbrales de configuración, nunca de constantes en el código
- [ ] Un soporte es archivo **o** URL externa, nunca ambos ni ninguno (rechazado por la base de datos)
- [ ] Un usuario con `puede_ver_tablero_gerencial` y sin rol de gestión ve el Tablero de Control Gerencial y no puede editar nada del proyecto
- [ ] La quinta cara renderiza tacómetro, curva S, radar y la tarjeta Beneficiarios Atendidos/Meta, e imprime vía `/print/dashboard/{cara}`
- [ ] El endpoint agregado del tablero resuelve en una sola consulta agregada; p95 medido y reportado contra el objetivo de 3 s (D9)
- [ ] La suite existente pasa sin modificaciones; `permissions.test.ts` cubre las celdas nuevas
