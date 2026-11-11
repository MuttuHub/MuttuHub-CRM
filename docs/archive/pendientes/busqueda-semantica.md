# Búsqueda semántica en el Repositorio — futuro documentado (no construido)

> Plan `voy-a-hacer-un-synthetic-rabin.md`, §4B → "Futuro documentado". Este
> archivo existe para que nadie "simplemente agregue una API key" después.
> **La decisión de habilitar búsqueda semántica es una decisión de hosting,
> no de búsqueda.**

## Qué agregaría

Recall sobre paráfrasis: "contrato de arrendamiento" encontraría un documento
cuyo texto dice "acuerdo de alquiler". La búsqueda full-text (4B) no puede:
`to_tsvector('spanish', …)` empareja formas de la misma palabra (stemming), no
sinónimos ni paráfrasis.

## Qué cuesta

- **~30 000 embeddings por cada 1 000 documentos** (embeddings por párrafo o
  por página, no por documento completo).
- **+100–400 ms por consulta remota** a la API de embeddings.
- Almacenamiento y mantenimiento del vector de cada versión.

## Qué datos saldrían — la restricción que define el diseño

Con una API alojada (OpenAI, Voyage, Cohere) se transmite **el texto completo
de cada documento a un tercero** para generar el embedding. La política del
proyecto prohíbe que el contenido del Repositorio salga de la organización —
es la razón por la que 4B se acotó a full-text de Postgres (el contenido nunca
sale de la base).

El único camino compatible es un **modelo self-hosted**:

- **ONNX en contenedor** (transformers.js / onnxruntime): el embedding se
  genera dentro de la infraestructura propia.
- **Edge Function de Supabase** que corre en el propio proyecto.

En ambos casos **no sale nada**. Si algún día se habilita, la decisión es de
hosting (¿dónde corre el modelo?), nunca de "agregar una API key".

## Seams que 4B ya dejó

| Seam | Estado |
|---|---|
| `contenido_texto` poblado y backfilleado | ✅ PR 13 + `scripts/backfill-document-text.ts` — sin esto, la fase 2 arrancaría re-descargando y re-parseando cada archivo |
| `searchCandidateIds(q)` como función única con una firma | ✅ PR 14 — el query crudo es el único lugar que decide "qué matchea" |
| `match.en` como discriminante con lugar para `"semantico"` | ✅ PR 14 — `match: "metadatos" \| "contenido"`; `"semantico"` es el tercer valor natural |
| `texto_estado` como máquina de estados de procesamiento | ✅ PR 13 — `null \| "ok" \| "sin_texto" \| "error"` es exactamente el estado que un job de embeddings necesita para saber qué re-procesar |

## Qué habría que construir (si se decide)

1. Decidir hosting del modelo (contenedor ONNX o Edge Function) — la única
   decisión que importa.
2. Job de embeddings: mismo patrón del backfill de texto, leyendo
   `texto_estado` para no re-procesar.
3. Columna de vector (`Unsupported("vector")` o SQL crudo, como el GIN) +
   índice `pgvector` (`<=>` / `<=>` cosine).
4. `searchCandidateIds` gana la rama `"semantico"` (o una segunda función con
   la misma firma que hace el recall sobre paráfrasis y se fusiona).
5. Ranking híbrido (FTS + vector) si se necesita.

## Estados de procesamiento hoy

| `texto_estado` | Significado | ¿Backfill de texto lo toma? | ¿Job de embeddings lo tomaría? |
|---|---|---|---|
| `null` | nunca procesado | ✅ | ✅ |
| `ok` | texto extraído | no | ✅ |
| `sin_texto` | no hay texto que extraer (ej. JPG) | no | no |
| `error` | falló la extracción (reintentable) | ✅ | ✅ |