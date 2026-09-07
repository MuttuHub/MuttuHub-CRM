# Proposal: Extracción automática de briefs con IA (OpenRouter) para prellenar la creación de clientes

- **Fecha:** 2026-09-01
- **Estado:** Propuesta (pendiente de aprobación y decisiones de negocio)
- **Autor:** Ingeniería MuttuHub
- **Driver:** Solicitud del equipo directivo: al crear un cliente usando "Cargar desde brief existente", que el sistema analice el contenido del brief y extraiga automáticamente la información para prellenar la ficha.

---

## 1. Resumen ejecutivo

El flujo actual de "Cargar desde Brief existente" es deliberadamente liviano: solo copia el **título** del documento como nombre sugerido. No lee el contenido del archivo.

La propuesta es agregar un paso de **extracción asistida por IA vía OpenRouter** que:

1. Recibe el archivo del brief (DOCX/PDF/imagen).
2. Extrae el texto y lo mapea a los campos del schema de creación de cliente.
3. **Prefila el formulario** para que el usuario revise, corrija y confirme antes de guardar.

**Principio rector: la IA solo prefiere, nunca guarda sola.** Si la extracción falla o es ambigua, el flujo degrada al ingreso manual actual. El resultado del modelo se valida con el mismo schema `zod` que usa el servidor para crear clientes.

**Hallazgo clave del brief demo (Diaco):** el template interno de briefs es una **tabla fija `Campo | Descripción`** con 7 secciones. Eso permite una arquitectura **híbrida**: parser determinista de la tabla (costo cero) + un modelo barato de OpenRouter solo para el mapeo semántico + validación `zod`. El costo por brief estimado es **menor a USD 0.001** y la experiencia de usuario es de pocos segundos.

---

## 2. Contexto: cómo funciona hoy

- `src/components/crm/client-form.tsx` → `BriefPickerDialog` (líneas ~52-140): el usuario busca un documento existente del Repositorio y se copia solo `doc.titulo` como nombre sugerido del cliente.
- Comentario del código actual: *"no hay lectura del contenido del archivo"* (hallazgo de QA audit #4.8 / #5).
- El modal "Nuevo Cliente" es un diálogo; los campos obligatorios son `nombre`, `tipo_cliente`, `responsable_id`; `estado` por defecto `PROSPECTO`.
- Stack: Next.js 16, Prisma, Supabase, `zod`, `@tanstack/react-query`. **No hay SDK de IA ni parser de DOCX/PDF en `package.json` hoy.**

### Schema de creación de cliente (destino de la extracción)

Fuente: `src/app/api/v1/clients/route.ts` → `POST_CLIENT_SCHEMA`:

| Campo | Tipo | ¿Extraíble del brief? | Observación |
|---|---|---|---|
| `nombre` | string (1-200) | ✅ Sí (empresa) | **No confundir con el "Nombre del cliente" del brief, que es la persona** |
| `tipo_cliente` | enum `TipoCliente` | ✅ Sí | "Empresa privada." → `EMPRESA_PRIVADA` (sección 2) |
| `responsable_id` | string (UUID) | ⚠️ Depende | El brief da "Responsable interno (Muttu)" como **nombre libre**; hay que matchear en UI y confirmar |
| `empresa` | string | ✅ Sí | "DIACO S.A." (sección 1) |
| `tamano_org` | string | ✅ Sí | "entre 1.000 y 5.000 aproximadamente" (sección 2) |
| `ubicacion` | string | ✅ Sí | "Bogotá, Colombia" (sección 1) |
| `canal_contacto_inicial` | string | ✅ Sí | "Reunión de acercamiento" (sección 1) |
| `fecha_primer_contacto` | fecha (ISO) | ✅ Sí | Brief trae "11/03/2026" (DD/MM/YYYY) → normalizar a ISO |
| `prioridad` | enum `PrioridadCliente` (null) | ❌ No | **No viene en el template**; se deja null/manual |
| `estado` | enum `EstadoCliente` | ✅ Sí | "Prospecto" → `PROSPECTO` (sección 3) |
| `prioridades_identificadas` | texto | ✅ Sí | Sección 2 |
| `riesgos_barreras` | texto | ✅ Sí | Sección 2 |
| `resumen_relacion` | texto | ✅ Sí | Sección 3 "Resumen de la relación" |

### Trampas reales detectadas en el brief demo

1. **"Nombre del cliente" no es la empresa.** En el template es la persona de contacto (María Fabiana De La Espriella Salcedo); la empresa está en "Empresa / Organización" (DIACO S.A.). → *Decisión de negocio: el `nombre` del registro debe ser la empresa / organización; la persona pasa a sugerencia de contacto (fase 3).*
2. **Placeholders que hay que ignorar:** "(En COP o USD)", "N.A.", "¿Qué sigue?...", "DD/MM/AAAA", "Espacio libre...", "En diseño / En revisión / Aprobada / Rechazada", "(Link a Notion, Drive, etc.)".
3. **Fecha en formato DD/MM/YYYY** — hay que normalizar a ISO con `parseDate` (el schema ya lo valida).
4. **Responsable interno se toma como sugerencia, no como auto-asignación** — hay que matchear contra usuarios reales y confirmar en UI.
5. **Prioridad del cliente no viene en el template** — no inventar inferencias (p. ej. desde "Nivel de madurez").

---

## 3. Propuesta de arquitectura

### 3.1 Flujo propuesto (alta de cliente con brief)

```
[Nuevo Cliente] → "Cargar desde brief"
   │
   ├─ (a) Elegir documento del Repositorio (flujo actual)
   └── (b) Subir archivo (nuevo): DOCX / PDF / imagen
   │
   └── POST /api/v1/briefs/extract  {archivo | documentId}
         │
         ├─ 1. Extractor de texto
         │      ├─ DOCX nativo → parse de tabla (pares Campo|Valor) [costo cero]
         │      ├─ PDF nativo → extractor de texto + parse heurístico
         │      └── Imagen/PDF escaneado → modelo con visión (fase 3, opcional)
         │
         ├─ 2. LLM vía OpenRouter (solo con los pares, no el doc completo)
         │      └─ JSON estructurado adherido al schema zod (structured output)
         │
         ├─ 3. Validación zod + normalización (fechas, opciones conocidas, placeholders)
         │
         └── {sugerencias, confianza, warnings} 200 | {error} 422
   │
   └── UI: prellenado de campos con badge "IA" + revisión humana → submit (flujo actual)
```

### 3.2 Componentes nuevos / modificados

| Componente | Tipo | Descripción |
|---|---|---|
| `POST /api/v1/briefs/extract` | Nuevo endpoint server | Recibe archivo o `documentId`, devuelve sugerencias validadas. Autenticación + autorización como el resto de la API. |
| `lib/brief/parser` | Servicio nuevo | Parse de DOCX (`mammoth`) / PDF (`pdf-parse`) + extracción de tabla Campo→Valor |
| `lib/brief/extractor` | Servicio nuevo | Llamada a OpenRouter (fetch a `https://openrouter.ai/api/v1/chat/completions`) + construcción de prompt + parsing de respuesta |
| `lib/brief/schema` | Schema zod nuevo | `BriefSugerencias` — mismos campos que `POST_CLIENT_SCHEMA` (reuso de reglas) + `confianza` y `warnings` |
| `BriefPickerDialog` | Modificar | Agregar pestaña "Subir archivo", estados cargando/analizando/error, badge "IA", prellenado y match de responsable |
| `.env` | Config | `OPENROUTER_API_KEY`, `BRIEF_AI_MODEL` (default sugerido: `openai/gpt-5-nano`) |

### 3.3 Llamada a OpenRouter

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Modelo recomendado (barato + structured output):
  - `openai/gpt-5-nano` — $0.05/M (prompt) / $0.20/M (completion). Con ~30 pares por brief → **< USD 0.001 / brief**.
  - Alternativa: `google/gemini-2.5-flash-lite` — $0.10/M; `google/gemma-4-31b-it:free` (gratis, buena calidad, ideal para pruebas).
- Request con `response_format` / instrucción de JSON schema zod → el modelo devuelve solo el JSON con los campos esperados.
- **La clave va única y exclusivamente server-side** (variables de entorno). Nunca llega al cliente.
- Routing / `fallback` de proveedores: OpenRouter ya resuelve redundancia entre proveedores.

### 3.4 Seguridad y privacidad

- Los briefs contienen datos de clientes/contactos → la extracción se hace server-side; el contenido del archivo viaja a OpenRouter solo en la llamada de extracción (texto extraído si es nativo; imagen si es escaneado, fase 3).
- Política de retención/no entrenamiento: verificar si el plan free de OpenRouter entrena con el prompt; si es un requisito, usar modelo de pago de un proveedor con compromiso de no-training (p. ej. Anthropic/OpenAI vía OpenRouter).
- Rate limiting por usuario + tope de tamaño de archivo (p. ej. 10 MB) + quota de extracciones/día/costo.
- Log de extracciones (audit): quién, qué brief, costo, éxito/fallo, correcciones del usuario (para mejorar el prompt).

---

## 4. Mapeo campo a campo (basado en el template real)

| Sección brief | Campo template | Campo destino schema | Regla de mapeo |
|---|---|---|---|
| 1. Datos Generales | Empresa / Organización | `empresa` + sugiere `nombre` | Nombre = organización; persona ≠ nombre |
| 1. Datos Generales | Nombre del cliente | (contacto) | Sugerido a contactos en fase 3 |
| 1. Datos Generales | Correo electrónico | (contacto) | Sugerido |
| 1. Datos Generales | Teléfono / WhatsApp | (contacto) | Sugerido |
| 1. Datos Generales | Ubicación | `ubicacion` | Directo |
| 1. Datos Generales | Canal de contacto inicial | `canal_contacto_inicial` | Normalizar a valor existente si aplica |
| 1. Datos Generales | Fecha de primer contacto | `fecha_primer_contacto` | parsear DD/MM/YYYY → ISO |
| 2. Segmentación | Tipo de cliente | `tipo_cliente` | Mapear enum: "Empresa privada." → `EMPRESA_PRIVADA` |
| 2. Segmentación | Tamaño de la organización | `tamano_org` | Texto directo (opcional normalizar rango) |
| 2. Segmentación | Prioridades identificadas | `prioridades_identificadas` | Texto directo; ignorar si es placeholder |
| 2. Segmentación | Riesgos o barreras | `riesgos_barreras` | Texto directo |
| 2. Segmentación | Perfil persona de contacto | (contacto) | Sugerido a contactos |
| 3. Relación | Responsable interno (Muttu) | `responsable_id` (sugerido) | Match en UI contra usuarios; nunca auto-asignar |
| 3. Relación | Estado del cliente | `estado` | "Prospecto" → `PROSPECTO` (coincide con default) |
| 3. Relación | Resumen de la relación | `resumen_relacion` | Texto directo (sin proyectar acá) |
| 4. Oportunidades | Servicios de interés | (nota/bitácora futuro) | Opcional, fuera de alcance v1 |
| 5. Compromisos y Acciones | Tabla de acciones | (bitácora/tareas futuro) | Fuera de alcance v1 |
| — | `prioridad` | `prioridad` | **No extraer** (no viene); queda null/manual |

---

## 5. Plan de acción por fases

### Fase 0 — Setup y decisiones de negocio (½ día)

**Decisiones que necesito confirmar con dirección antes de código:**

1. `nombre` del registro = empresa/organización (recomendado) — ¿de acuerdo?
2. `prioridad` del cliente queda siempre manual; ¿ok?
3. `estado` queda en PROSPECTO fijo (no lo toca la IA); ¿ok?
4. ¿La extracción es solo para briefs del Repositorio, o también subida directa de archivo al momento de crear cliente? (recomendado: ambas)
5. Privacidad: ¿hay restricción sobre enviar contenido a un proveedor externo?

**Setup técnico:**

- Agregar `OPENROUTER_API_KEY` y `BRIEF_AI_MODEL` a `.env` + `.env.example`.
- Instalar deps: `mammoth` (DOCX), `pdf-parse` (PDF).
- Crear `lib/brief/schema.ts` (zod) y un test de humo con un mock del LLM.

### Fase 1 — Backend (1-2 días)

- Endpoint `POST /api/v1/briefs/extract` con:
  - parser DOCX/PDF → pares Campo→Valor (testeable con el brief Diaco como golden file).
  - llamada OpenRouter con prompt (reglas: placeholders a ignorar, fecha DD/MM/YYYY, enum mapping) + `response_format` JSON.
  - validación zod; errores del modelo → `422` con mensaje claro.
- Tests:
  - Golden file con el brief Diaco (parse + extracción con mock del LLM).
  - Variantes: placeholders, fecha en otro formato, enum inválido, brief escaneado (fallback).
  - Error del modelo/timeout → respuesta de error recuperable → UI degrada a manual.

### Fase 2 — Frontend (1-2 días)

- Modificar `BriefPickerDialog`:
  - Tabs: "Del Repositorio" (flujo actual) | "Subir archivo" (nuevo).
  - Estados: cargando → analizando ("IA analizando el brief…") → resultado.
  - Prellenado de campos con badge "IA" (distinto a manual) — sugerencia preparada, el usuario acepta/edita.
  - Match de responsable sugerido contra lista de usuarios; si no matchea → vacío + hint.
  - Errores (tipo de archivo no soportado, tamaño, fallo del modelo) → aviso + flujo manual intacto.
- Tests del componente (mock de fetch/react-query), accesibilidad (aria-live para anunciar "analizando").

### Fase 3 — Extensión post-MVP (cuando haya uso real)

- Soporte de escaneos/PDF como imagen → modelo con visión (`openai/gpt-5.1-codex-mini` o `google/gemini-2.5-flash-image`) para extracción óptica.
- Sugerencia de creación de contacto (persona, cargo, correo, teléfono) desde sección 1/2.
- Log de correcciones del usuario → fine-tuning del prompt / heurísticas.
- (Opcional) Prellenado de la sección "Oportunidades" (servicios de interés) como borrador de bitácora.

---

## 6. Definición de hecho (DoD)

- [ ] Endpoint de extracción responde `200` con sugerencias validadas para brief nativo (DOCX/PDF).
- [ ] El brief Diaco demo se extrae correctamente: `nombre`=DIACO S.A., `tipo_cliente`=EMPRESA_PRIVADA, `ubicacion`=Bogotá, `fecha`=2026-03-11, `estado`=PROSPECTO, textos largos.
- [ ] UI prellena con badge "IA" y permite revisión/edición antes de crear.
- [ ] Errores del modelo y archivos inválidos no rompen el flujo manual (degrada).
- [ ] Clave OpenRouter solo en server, nunca en cliente.
- [ ] Tests (golden + variantes) pasan; build + lint + test verdes.

---

## 7. Riesgos y plan de mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El modelo malidentifica o extrae campos incorrectos | Datos sucios | Revisión humana obligatoria antes de guardar; badge "IA"; confianza y warnings; log de correcciones para iterar el prompt |
| Costo de API | Costo financiero | Modelos baratos; solo manda pares (no doc completo); quota/día; monitoreo de costo por brief |
| Privacidad de datos del cliente enviados a externo | Cumplimiento | Evaluación no-training; minimizar payload (solo texto necesario); describir qué se envía al proveedor |
| Brief escaneado (sin texto nativo) | Extracción vacía/frágil en v1 | Degrada claro a manual + aviso "no pudimos leer el archivo"; visión en fase 3 |
| Cambio del template del brief | Mapeos rotos | Parser tolerante (búsqueda case-insensitive, key aliases); tests que marcan cambios de template |

---

## 8. Decisiones pendientes (para dirección)

1. ¿`nombre` del registro = empresa / organización? (recomendado: sí)
2. ¿`prioridad` y `estado` quedan fijos/manuales? (recomendado: sí, PROSPECTO)
3. ¿Permitimos subida directa de archivo desde la creación, o solo re-usamos briefs del Repositorio? (recomendado: ambas)
4. ¿Hay restricción de privacidad para enviar contenido del brief a un proveedor externo (OpenRouter/OpenAI/Google)?
5. ¿Aprobamos el alcance v1 (solo prellenado + revisión) o exigimos algo más (contactos en la misma entrega)?

---

## 9. Referencias y vínculos

- Código de destino: [BriefPickerDialog → client-form.tsx](src/components/crm/client-form.tsx)
- Schema de código: [POST_CLIENT_SCHEMA → api/v1/clients/route.ts](src/app/api/v1/clients/route.ts)
- Catálogos (enums): [src/lib/catalogs.ts](src/lib/catalogs.ts)
- Brief demo: `C:\Users\Adrian\Downloads\Brief relacionamiento - Diaco.docx`
- PRD: [docs/Muttu_Hub_PRD_v2.md](docs/Muttu_Hub_PRD_v2.md)