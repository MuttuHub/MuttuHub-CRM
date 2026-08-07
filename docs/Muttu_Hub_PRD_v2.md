# MUTTU INNOVACIÓN SOCIAL S.A.S.
## Documento de Requerimientos Funcionales y Técnicos
### Plataforma Integral "Muttu Hub"
**Versión 2.0 — Alcance completo + especificaciones técnicas**
**Agosto 2026**

---

## Tabla de Contenido

1. Propósito y contexto
2. Alcance general de la plataforma
3. Seguridad, usuarios, roles y perfiles
4. Módulo CRM
5. Módulo Tablero Kanban
6. Módulo Repositorio de Documentos
7. Módulo Dashboard
8. Modelo de datos
   - 8.1 Consideraciones de arquitectura
   - 8.2 Contratos de API
   - 8.3 Schema Prisma (base de datos)
   - 8.4 Variables de entorno, deploy y límites del sistema
9. Orden de construcción sugerido
10. Decisiones de alcance confirmadas

---

## §0 — Stack Tecnológico Confirmado

> Esta sección es de consulta obligatoria para el equipo de desarrollo. Toda decisión técnica de implementación debe alinearse con estas elecciones.

| Capa | Tecnología | Versión | Rol |
|------|-----------|---------|-----|
| Frontend / Backend | Next.js + TypeScript | **16.3** (React 19, Turbopack) | App Router, API Routes, SSR |
| Base de datos | Supabase (PostgreSQL) | Cloud | BD relacional gestionada |
| ORM | Prisma | Latest | Acceso tipado a BD, migraciones |
| Autenticación | Supabase Auth | Cloud | JWT, sesiones, reset password |
| Almacenamiento archivos | Supabase Storage | Cloud | Repositorio de documentos |
| Estado global (cliente) | Zustand | Latest | Usuario actual, notificaciones, filtros activos |
| Estado servidor (caché) | TanStack Query | Latest | Caché de peticiones API, invalidación |
| UI / Componentes | shadcn/ui + Tailwind CSS | Latest | Design system base |
| Email transaccional | Resend | Latest | Notificaciones diarias |
| Cron jobs | Supabase pg_cron | Nativo | Job diario 8am, sin servidor extra |
| LLM (§4.8) | Anthropic API | claude-sonnet-4-6 | Extracción asistida de Briefs |
| Deploy | Vercel | Latest | CI/CD automático desde rama main |

**Notas de stack:**
- Cada push a `main` despliega automáticamente en Vercel sin configuración adicional.
- Turbopack es el bundler por defecto en Next.js 16 — no usar configuración webpack personalizada.
- Supabase maneja Auth, Storage y BD en un solo proveedor, reduciendo integraciones externas.
- El dominio inicial será el subdominio gratuito de Vercel (`muttu-hub.vercel.app`). La migración a dominio propio se hace desde el panel de Vercel en Settings → Domains, sin tocar código.

---

## 1. Propósito y contexto

Muttu opera hoy su gestión comercial y de proyectos sobre un archivo de Excel compartido ("Comité de Seguimiento MTT"), donde cada cliente o aliado es una fila y el histórico de gestión se acumula como texto libre concatenado dentro de una sola celda. Esto genera cuatro problemas estructurales que la nueva plataforma debe resolver de raíz:

1. **Pérdida de trazabilidad.** El seguimiento de cada cliente es un bloque de texto creciente donde se mezclan fechas, compromisos, responsables y decisiones sin estructura.
2. **Compromisos sin dueño claro ni alerta.** Los compromisos aparecen mencionados dentro del texto pero no existen como registros independientes con fecha límite y estado.
3. **Tareas de equipo invisibles fuera del CRM comercial.** No hay espacio separado para la carga operativa del equipo.
4. **Cero consolidación.** No existe una vista agregada de pipeline por estado, responsable, tipo de cliente o monto potencial.

### 1.1 Objetivo del documento

Especificar los requerimientos funcionales y técnicos necesarios para que un equipo de desarrollo pueda construir la plataforma sin ambigüedad sobre alcance, datos, roles y comportamiento esperado.

### 1.2 Principio rector de UX: simplicidad radical

- **Un flujo, un propósito por pantalla.**
- **Cero campos obligatorios innecesarios.** Solo lo mínimo indispensable es obligatorio al crear un registro.
- **El sistema guía, no interroga.** Textos de ayuda visibles, placeholders con ejemplos reales, validaciones en lenguaje natural.
- **Lenguaje humano, no técnico.** Nunca mostrar términos como "payload", "null", "índice", "sync".
- **Todo es reversible y visible.** Confirmaciones antes de eliminar, historial de cambios accesible.
- **Diseño mobile-responsive obligatorio.**

---

## 2. Alcance general de la plataforma

Cuatro módulos integrados sobre una base común de usuarios, roles y clientes:

| Módulo | Propósito central |
|--------|------------------|
| CRM | Ficha única de cada cliente/aliado con historial de gestión, contactos, oportunidades y compromisos |
| Tablero Kanban | Gestión de tareas del equipo con visibilidad de carga y cumplimiento individual y grupal |
| Repositorio de documentos | Biblioteca central de documentos institucionales, comerciales y administrativos |
| Dashboard | Vistas agregadas configurables sobre los datos de los tres módulos anteriores |

### 2.1 Fuera de alcance (versión 1)

- Integración con correo electrónico o WhatsApp Business API.
- Firma digital de documentos.
- Facturación o módulo contable.
- App móvil nativa.
- Automatizaciones con IA más allá de la carga asistida de documentos (§4.8).

---

## 3. Seguridad, usuarios, roles y perfiles

### 3.1 Autenticación

- Acceso exclusivamente mediante correo y contraseña — sin registro público.
- Contraseñas: mínimo 8 caracteres, combinación de letras y números.
- Recuperación de contraseña vía correo (token de un solo uso, expira en 1 hora).
- **Duración de sesión: 4 horas** desde el último login. Sin renovación automática (silent refresh deshabilitado).
- **Aviso de cierre:** banner no descartable a los 3h50m con el mensaje: *"Tu sesión se cerrará en 10 minutos. Guarda tu trabajo."* Sin opción de extender.
- **Al vencer la sesión:** cierre automático + redirect a `/login` con mensaje *"Tu sesión expiró"*.
- **Usuario desactivado por admin:** la sesión activa continúa hasta vencer naturalmente. En el próximo intento de login: *"Tu cuenta está inactiva. Contacta al administrador."*
- Todo el sitio detrás de autenticación — ninguna pantalla accesible sin sesión, salvo `/login` y `/auth/reset-password`.
- Comunicación cifrada (HTTPS) en todo momento.
- Implementación: `middleware.ts` en Next.js intercepta todas las rutas protegidas y verifica sesión activa con Supabase Auth.

### 3.2 Roles del sistema

| Rol | Descripción | Permisos clave |
|-----|------------|----------------|
| Administrador | Gerencia / control total | Crear/editar/desactivar usuarios, crear roles, ver todo, configurar catálogos, exportar todo |
| Gerencia / Dirección | Presidenta, Gerente | Ve todos los clientes y tareas, aprueba, accede a dashboard financiero completo |
| Coordinador de área | Coordinadora Comercial, Directores de Proyecto | Ve y edita todos los registros de su área, asigna tareas a su equipo, ve reportes de su equipo |
| Colaborador | Resto del equipo, incluyendo perfiles externos | Crea y edita registros propios y los que le sean asignados |

### 3.3 Módulo de administración

Accesible solo para Administrador:
- Crear, editar, desactivar usuarios (nunca eliminar en frío).
- Asignar rol y permisos granulares por módulo (ver/crear/editar/eliminar/exportar).
- Ver bitácora de accesos (quién entró, cuándo).
- Gestionar catálogos maestros: tipos de cliente, estados, prioridades, etiquetas, etc.

### 3.4 Buenas prácticas incorporadas

- **Soft delete en todo.** Usuarios, clientes y tareas se desactivan, preservando historial.
- **Registro de auditoría por registro.** Cada entidad guarda `created_at`, `updated_at`, `created_by`, `updated_by`.

---

## 4. Módulo CRM

### 4.1 Tratamiento de campos del Brief de Relacionamiento

| Sección del Brief | Tratamiento en CRM |
|-------------------|--------------------|
| Datos generales | Campos estructurados en ficha |
| Segmentación y perfil | Campos estructurados (listas desplegables) |
| Relación y estado comercial | Campos estructurados + resumen editable |
| Oportunidades y propuestas | Sub-entidad "Oportunidad" (1:N por cliente) |
| Compromisos y acciones | Motor unificado de tareas compartido con Kanban |
| Seguimiento y observaciones | Bitácora de entradas fechadas e inmutables |
| Archivos y enlaces | Módulo Repositorio de Documentos vinculado al cliente |

### 4.2 Ficha de cliente (vista modal)

Se abre como modal/panel desde cualquier listado, sin recargar la página.

**Encabezado fijo (siempre visible)**
- Nombre del cliente/entidad, tipo (badge de color), estado (badge de color), responsable interno, próximo compromiso pendiente con fecha (vencido = resaltado en rojo).

**Pestaña "General"**
- Nombre del cliente, empresa/organización
- Tipo de cliente *(ver estados §4.7)*
- Tamaño de la organización
- Ubicación (ciudad, dpto)
- Canal de contacto inicial
- Fecha de primer contacto
- Prioridad (Alta / Media / Baja)
- Estado del cliente *(ver estados §4.7)*
- Prioridades identificadas del cliente (texto corto)
- Riesgos o barreras (texto corto)
- Resumen de la relación (texto editable, no acumulativo)
- Responsable interno (usuario del sistema)

**Pestaña "Contactos"**
- Lista de contactos del cliente (múltiples por cliente).
- Por contacto: nombre, cargo, correo, teléfono/WhatsApp, rol en decisión (Decisor / Técnico / Influenciador / Otro), notas.
- Botón "Agregar contacto" siempre visible.

**Pestaña "Oportunidades"**
- Lista de oportunidades (múltiples simultáneas por cliente).
- Por oportunidad: nombre/descripción, problema detectado, solución propuesta, servicios de interés, valor estimado (COP), estado *(ver §4.7)*, fecha de última gestión, proyectos anteriores relacionados.
- El valor estimado alimenta el dashboard financiero (§7).

**Pestaña "Compromisos"**
- Lista de compromisos abiertos y cerrados asociados al cliente.
- Por compromiso: descripción, responsable, fecha límite, estado, notas.
- Compromiso vencido sin cerrar → resaltado visual + alerta (§4.4).
- Motor unificado con Kanban: un compromiso aquí puede aparecer también en el tablero.

**Pestaña "Bitácora de gestión"**
- Lista cronológica de entradas de seguimiento: fecha, autor, texto.
- Entradas **inmutables** una vez guardadas (no se puede editar ni eliminar — solo agregar nuevas).
- Botón simple "Agregar nota de seguimiento".

**Pestaña "Documentos"**
- Documentos del repositorio vinculados al cliente, con acceso de descarga.
- Botón para subir un documento y asociarlo automáticamente al cliente.

**Pestaña "Tareas relacionadas"**
- Todas las tareas del Kanban vinculadas a este cliente, con estado actual.

### 4.3 Creación y edición de registros

- Formulario mínimo obligatorio: nombre, tipo de cliente, responsable. El resto se completa progresivamente.
- Edición inline dentro de la ficha — sin "modo edición" separado.
- Historial de cambios accesible por campo relevante.

### 4.4 Alertas de incumplimiento de compromisos

- Todo compromiso con fecha vencida y estado distinto de "Cumplido" o "Cancelado" genera alerta.
- Las alertas aparecen en: panel de notificaciones (ícono campana, visible en toda la app) + resumen personal en dashboard + correo diario (ver §4.4.1).

#### §4.4.1 — Cron de notificaciones

```
Horario:          8:00am hora Colombia (UTC-5) — cron: '0 13 * * *'
Motor:            Supabase pg_cron (extensión PostgreSQL nativa)
Proveedor email:  Resend

Destinatarios y alcance:
  Colaborador     → sus propias tareas/compromisos vencidos y próximos
  Coordinador     → los propios + todos los de su equipo
  Gerencia        → los propios + todos los de la plataforma
  Administrador   → no recibe resumen operativo

Contenido del correo:
  1. Vencidos sin cerrar        (resaltados en rojo)
  2. Vencen hoy                 (resaltados en amarillo)
  3. Vencen en los próximos 3 días (informativos)

Si el usuario no tiene nada en ninguna categoría → no se envía correo ese día.

Manejo de errores:
  Fallo de Resend       → reintento automático a las 8:30am
  Fallo del reintento   → log en tabla cron_logs, sin tercer intento
```

### 4.5 Búsqueda y filtros

- Buscador de texto libre sobre nombre, contacto y contenido de bitácora.
- Filtros combinables por: tipo de cliente, estado, prioridad, responsable, rango de fecha, rango de valor estimado.
- Los filtros pueden guardarse como "vista" reutilizable.

### 4.6 Exportación

- Exportar listado filtrado a Excel (.xlsx) y PDF.
- Exportar ficha completa de un cliente individual a PDF.
- La exportación respeta los filtros y columnas visibles.

### 4.7 Catálogos maestros (editables desde admin)

**Estados de cliente:**
| Estado | Descripción |
|--------|-------------|
| `PROSPECTO` | Identificado pero sin contacto real aún |
| `EN_ACERCAMIENTO` | Ya hubo contacto, explorando la relación |
| `CLIENTE_ACTIVO` | Relación comercial o de proyecto en curso |
| `EN_PAUSA` | Relación pausada con intención de retomar |
| `STANDBY` | Sin actividad pero sin cierre formal, se monitorea |
| `INACTIVO` | Sin gestión en más de 6 meses, baja prioridad |
| `CERRADO` | Relación finalizada, sin retorno esperado |

**Estados de oportunidad:** `DISENANDO_PROPUESTA` / `PRESENTADA` / `EN_REVISION` / `EN_NEGOCIACION` / `GANADA` / `PERDIDA` / `STANDBY`

**Tipos de cliente:** `GOBIERNO_LOCAL` / `GOBIERNO_NACIONAL` / `COOPERANTE_MULTILATERAL` / `EMPRESA_PRIVADA` / `FUNDACION` / `ALIADO_ACADEMICO` / `OTRO`

**Roles de contacto:** `DECISOR` / `TECNICO` / `INFLUENCIADOR` / `OTRO`

### 4.8 Carga asistida de Brief existente

#### Plantilla oficial de Brief de Relacionamiento Muttu

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 1 — DATOS GENERALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre del cliente/organización: _______________
Empresa / Entidad:               _______________
Tipo de cliente:                 [ ] Gobierno local
                                 [ ] Gobierno nacional
                                 [ ] Cooperante/Multilateral
                                 [ ] Empresa privada
                                 [ ] Fundación
                                 [ ] Aliado académico
                                 [ ] Otro
Tamaño de la organización:       _______________
Ubicación (ciudad, dpto):        _______________
Fecha de primer contacto:        _______________
Canal de contacto inicial:       _______________
Responsable interno Muttu:       _______________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 2 — CONTACTOS PRINCIPALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contacto 1
  Nombre:           _______________
  Cargo:            _______________
  Correo:           _______________
  Teléfono/WA:      _______________
  Rol en decisión:  [ ] Decisor [ ] Técnico [ ] Influenciador [ ] Otro

Contacto 2 (si aplica)
  Nombre:           _______________
  Cargo:            _______________
  Correo:           _______________
  Teléfono/WA:      _______________
  Rol en decisión:  [ ] Decisor [ ] Técnico [ ] Influenciador [ ] Otro

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 3 — PERFIL Y SEGMENTACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prioridad:                [ ] Alta  [ ] Media  [ ] Baja
Prioridades identificadas del cliente:
___________________________________________________
Riesgos o barreras:
___________________________________________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 4 — OPORTUNIDAD DETECTADA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre de la oportunidad:    _______________
Problema detectado:
___________________________________________________
Solución propuesta:
___________________________________________________
Servicios de interés:        _______________
Valor estimado (COP):        _______________
Estado de la oportunidad:    [ ] Diseñando propuesta
                             [ ] Presentada
                             [ ] En revisión
                             [ ] En negociación
                             [ ] Ganada / Perdida / Standby

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECCIÓN 5 — RESUMEN DE LA RELACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resumen general:
___________________________________________________
Proyectos anteriores relacionados:
___________________________________________________
```

#### Flujo técnico de extracción

1. Usuario sube el Brief (PDF o DOCX, máx 10 MB) al endpoint `POST /api/v1/clients/import-brief`.
2. El servidor extrae el texto del documento y lo envía a `claude-sonnet-4-6` con el siguiente prompt y schema:

```
Eres un extractor de datos estructurados.
Analiza el Brief de Relacionamiento adjunto y devuelve
ÚNICAMENTE un JSON válido con esta estructura exacta.
Si un campo no aparece en el documento, usa null.
Nunca inventes valores.

{
  "nombre": "string | null",
  "empresa": "string | null",
  "tipo_cliente": "GOBIERNO_LOCAL | GOBIERNO_NACIONAL |
                   COOPERANTE_MULTILATERAL | EMPRESA_PRIVADA |
                   FUNDACION | ALIADO_ACADEMICO | OTRO | null",
  "tamano_org": "string | null",
  "ubicacion": "string | null",
  "canal_contacto_inicial": "string | null",
  "fecha_primer_contacto": "YYYY-MM-DD | null",
  "responsable_interno": "string | null",
  "prioridad": "ALTA | MEDIA | BAJA | null",
  "prioridades_identificadas": "string | null",
  "riesgos_barreras": "string | null",
  "resumen_relacion": "string | null",
  "contactos": [
    {
      "nombre": "string | null",
      "cargo": "string | null",
      "correo": "string | null",
      "telefono": "string | null",
      "rol_decision": "DECISOR | TECNICO | INFLUENCIADOR | OTRO | null"
    }
  ],
  "oportunidad": {
    "nombre": "string | null",
    "problema_detectado": "string | null",
    "solucion_propuesta": "string | null",
    "servicios_interes": "string | null",
    "valor_estimado_cop": "number | null",
    "estado": "DISENANDO_PROPUESTA | PRESENTADA | EN_REVISION |
               EN_NEGOCIACION | GANADA | PERDIDA | STANDBY | null"
  },
  "confianza_general": 0.0
}
```

3. Se presenta al usuario un formulario de revisión con los campos prellenados. Campos con `confianza < 0.6` se resaltan en amarillo como "requiere revisión".
4. El usuario confirma o corrige. Solo entonces se crea el cliente.
5. El documento original queda automáticamente vinculado al cliente en el Repositorio.

**Manejo de errores:**
- Archivo > 10 MB → error antes de procesar: *"El archivo supera el límite de 10 MB."*
- Formato no soportado → error: *"Solo se aceptan archivos PDF o Word (.docx)."*
- Timeout (> 30 seg) → formulario vacío con mensaje: *"No pudimos leer el documento. Completa los campos manualmente."*
- Fallo de parsing JSON → formulario vacío, nunca bloquear al usuario.
- El sistema nunca guarda información extraída sin revisión humana previa.

---

## 5. Módulo Tablero Kanban

### 5.1 Estructura del tablero

**Columnas por defecto (editables por admin):**

| Columna | Estado interno | Visible en tablero |
|---------|---------------|-------------------|
| Por hacer | `POR_HACER` | Sí |
| En curso | `EN_CURSO` | Sí |
| En revisión | `EN_REVISION` | Sí |
| Bloqueada | `BLOQUEADA` | Sí |
| En espera | `EN_ESPERA` | Sí |
| Completada | `COMPLETADA` | Sí |
| Cancelada | `CANCELADA` | No (estado oculto, visible en reportes) |

- Vista tablero (drag & drop) y vista lista como alternativa.
- Filtro por: responsable, cliente, fecha de entrega, prioridad, etiqueta.
- Vista "Mi tablero" (solo mis tareas) como default al entrar.
- Vista "Equipo completo" para coordinadores y gerencia.

### 5.2 Tarjeta de tarea

| Campo | Obligatorio | Notas |
|-------|------------|-------|
| Título | Sí | Único campo obligatorio al crear |
| Descripción | No | |
| Responsable | Sí (para activar) | Obligatorio para salir de borrador |
| Cliente relacionado | No | Vincula automáticamente a ficha del cliente |
| Fecha de entrega | No | Sin fecha → badge "sin fecha" visible |
| Prioridad | No | Alta / Media / Baja |
| Etiquetas | No | Configurable: Comercial, Administrativo, Proyecto, Interno |
| Motivo de bloqueo | No | Solo cuando estado = BLOQUEADA |
| Comentarios | No | Hilo cronológico, inmutable por entrada |
| Checklist de subtareas | No | Para tareas compuestas |
| Archivos adjuntos | No | |

### 5.3 Reglas de negocio clave

- Ninguna tarea puede quedar sin responsable para estar activa en el tablero.
- Tarea sin fecha de entrega → marcada visualmente como "sin fecha".
- Alertas de vencimiento: mismo motor que CRM (panel interno + correo diario 8am).
- Toda tarea creada es visible para coordinadores/gerencia en el tablero general.

### 5.4 Reportes de equipo

- Por persona: asignadas, completadas a tiempo, completadas tarde, vencidas, en curso.
- Por equipo: carga total, distribución por estado, tasa de cumplimiento (semana/mes/trimestre).
- Por cliente: todas las tareas asociadas y su estado.
- Exportable a Excel/PDF.

---

## 6. Módulo Repositorio de Documentos

### 6.1 Concepto: biblioteca con metadatos

Se modela como biblioteca con metadatos, no como explorador de carpetas.

### 6.2 Funcionalidades

**Subir documento:** arrastrar o seleccionar archivo. Al subir: título, categoría, etiquetas libres, cliente relacionado (opcional). Fecha y autor se registran automáticamente.

**Versionado:**
- Cada documento tiene una versión activa (la más reciente) que se descarga con el botón principal.
- El botón **"Subir nueva versión"** es explícito en la ficha del documento — el versionado nunca es automático por detección de nombre.
- Versiones anteriores disponibles en dropdown: `v2 — 12 jul 2026 · Adrián G.` — solo descarga, no se pueden editar ni eliminar.
- Soft delete solo sobre el documento completo (todas sus versiones). No se puede borrar una versión individual.
- Sin límite de versiones en v1.

```
Vista de la ficha de documento:
┌─────────────────────────────────────────┐
│ Contrato Marco Alcaldía 2026.pdf        │
│                                         │
│ [Descargar v3]  [Subir nueva versión]   │
│                                         │
│ Versiones anteriores ▾                  │
│   v2 — 5 jul 2026 · Adrián G.          │
│   v1 — 18 jun 2026 · Laura M.          │
└─────────────────────────────────────────┘
```

**Búsqueda:** por nombre, categoría, etiqueta, cliente, autor, rango de fecha.

**Descarga:** individual y múltiple en .zip.

**Almacenamiento:** Supabase Storage. Path: `/documentos/{cliente_id}/{doc_id}/v{n}_{nombre}.ext`

**Permisos por categoría:** ciertas categorías (ej. Legal, Administrativo financiero) restringibles a roles específicos.

---

## 7. Módulo Dashboard

### 7.1 Concepto: múltiples "caras" sobre los mismos datos

**Cara "Pipeline Comercial"**
- Total de oportunidades activas y valor estimado sumado.
- Embudo por estado (Prospecto → Negociación → Ganada/Perdida).
- Top clientes por valor potencial.
- Comparativo monto potencial vs. ganado histórico.

**Cara "Gestión de Tareas"**
- Estado general del tablero Kanban (tareas por columna).
- Cumplimiento por persona y equipo.
- Tareas vencidas activas con acceso directo.

**Cara "Actividad de Clientes"**
- Clientes sin gestión reciente (sin bitácora en más de X días).
- Distribución por tipo, estado y prioridad.
- Mapa de calor de actividad por responsable.

**Cara "Mi resumen"** (cualquier usuario)
- Mis tareas pendientes y vencidas.
- Mis compromisos de clientes pendientes y vencidos.
- Mis clientes asignados y su estado.

### 7.2 Filtros comunes

Rango de fechas, responsable, tipo de cliente — consistentes en todas las caras.

### 7.3 Exportación de reportes

Botón "Generar reporte" en cualquier cara → PDF con formato de presentación limpia, con los filtros aplicados.

---

## 8. Modelo de datos

### 8.1 Consideraciones de arquitectura

- **BD:** PostgreSQL en Supabase Cloud. ORM: Prisma.
- **Auth:** Supabase Auth con JWT. Contraseñas con hash bcrypt (manejado por Supabase).
- **Almacenamiento:** Supabase Storage para documentos.
- **Notificaciones:** Resend + pg_cron. Job diario a las 8am (UTC-5).
- **Permisos en BD:** Row Level Security (RLS) de Supabase, complementado con validaciones en API Routes.
- **Compromiso/Tarea:** tabla unificada con campo `origen` (`CRM` / `KANBAN` / `AMBOS`). No dos tablas separadas.

---

### 8.2 Contratos de API

**Convención base:** `/api/v1/`
**Autenticación:** Bearer token en header `Authorization`
**Formato:** JSON en request y response
**Errores:** siempre `{ "error": "string", "code": "string" }`

#### Códigos de error HTTP

| Código | Code | Cuándo |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Campo inválido o faltante |
| 401 | `UNAUTHORIZED` | Sin sesión o token expirado |
| 403 | `FORBIDDEN` | Sin permisos para esta acción |
| 404 | `NOT_FOUND` | Recurso no existe o fue eliminado |
| 409 | `CONFLICT` | Ej. email ya registrado |
| 413 | `FILE_TOO_LARGE` | Archivo supera 10 MB |
| 500 | `INTERNAL_ERROR` | Error no controlado |

#### Auth
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/reset-password/confirm
```

#### Users *(admin only)*
```
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
PATCH  /api/v1/users/:id/deactivate
```

#### Clients
```
GET    /api/v1/clients          ?estado=&tipo=&responsable=&prioridad=
                                &sin_gestion_dias=&page=&limit=
POST   /api/v1/clients
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
DELETE /api/v1/clients/:id      (soft delete)
POST   /api/v1/clients/import-brief    (§4.8 carga asistida)
GET    /api/v1/clients/:id/export      (PDF ficha completa)
GET    /api/v1/clients/export          (xlsx listado filtrado)
```

#### Contacts
```
GET    /api/v1/clients/:id/contacts
POST   /api/v1/clients/:id/contacts
PATCH  /api/v1/clients/:id/contacts/:contactId
DELETE /api/v1/clients/:id/contacts/:contactId
```

#### Opportunities
```
GET    /api/v1/clients/:id/opportunities
POST   /api/v1/clients/:id/opportunities
PATCH  /api/v1/clients/:id/opportunities/:opportunityId
DELETE /api/v1/clients/:id/opportunities/:opportunityId
```

#### Bitácora *(solo POST — entradas inmutables)*
```
GET    /api/v1/clients/:id/log
POST   /api/v1/clients/:id/log
```

#### Tasks *(CRM + Kanban unificado)*
```
GET    /api/v1/tasks            ?responsable=&client=&estado=
                                &origen=&prioridad=&vencidas=
POST   /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id/status (solo mover columna Kanban)
DELETE /api/v1/tasks/:id        (soft delete)
POST   /api/v1/tasks/:id/comments
POST   /api/v1/tasks/:id/attachments
GET    /api/v1/tasks/export     (xlsx/pdf)
```

#### Documents
```
GET    /api/v1/documents        ?categoria=&cliente=&etiqueta=&autor=
POST   /api/v1/documents
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id    (soft delete — todas las versiones)
POST   /api/v1/documents/:id/versions     (subir nueva versión)
GET    /api/v1/documents/:id/versions     (listar versiones)
GET    /api/v1/documents/:id/versions/:versionId/download
```

#### Notifications
```
GET    /api/v1/notifications    ?leida=false
PATCH  /api/v1/notifications/:id/read
PATCH  /api/v1/notifications/read-all
```

#### Dashboard
```
GET    /api/v1/dashboard/pipeline
GET    /api/v1/dashboard/tasks
GET    /api/v1/dashboard/clients-activity
GET    /api/v1/dashboard/my-summary
```

---

### 8.3 Schema Prisma (base de datos)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────

enum RolUsuario {
  ADMINISTRADOR
  GERENCIA
  COORDINADOR
  COLABORADOR
}

enum EstadoCliente {
  PROSPECTO
  EN_ACERCAMIENTO
  CLIENTE_ACTIVO
  EN_PAUSA
  STANDBY
  INACTIVO
  CERRADO
}

enum TipoCliente {
  GOBIERNO_LOCAL
  GOBIERNO_NACIONAL
  COOPERANTE_MULTILATERAL
  EMPRESA_PRIVADA
  FUNDACION
  ALIADO_ACADEMICO
  OTRO
}

enum PrioridadCliente {
  ALTA
  MEDIA
  BAJA
}

enum RolContacto {
  DECISOR
  TECNICO
  INFLUENCIADOR
  OTRO
}

enum EstadoOportunidad {
  DISENANDO_PROPUESTA
  PRESENTADA
  EN_REVISION
  EN_NEGOCIACION
  GANADA
  PERDIDA
  STANDBY
}

enum EstadoTarea {
  POR_HACER
  EN_CURSO
  EN_REVISION
  COMPLETADA
  BLOQUEADA
  EN_ESPERA
  CANCELADA    // estado oculto en tablero, visible en reportes
}

enum OrigenTarea {
  CRM
  KANBAN
  AMBOS
}

enum PrioridadTarea {
  ALTA
  MEDIA
  BAJA
}

enum TipoNotificacion {
  COMPROMISO_VENCIDO
  TAREA_VENCIDA
  POR_VENCER
}

// ─────────────────────────────────────────
// MODELOS
// ─────────────────────────────────────────

model Usuario {
  id         String     @id @default(uuid())
  email      String     @unique
  nombre     String
  rol        RolUsuario @default(COLABORADOR)
  activo     Boolean    @default(true)
  created_at DateTime   @default(now())
  updated_at DateTime   @updatedAt

  clientes_asignados  Cliente[]
  tareas_asignadas    Tarea[]
  bitacora_entradas   BitacoraEntrada[]
  documentos_subidos  Documento[]
  notificaciones      Notificacion[]

  @@map("usuarios")
}

model Cliente {
  id                        String            @id @default(uuid())
  nombre                    String
  empresa                   String?
  tipo_cliente              TipoCliente
  tamano_org                String?
  ubicacion                 String?
  canal_contacto_inicial    String?
  fecha_primer_contacto     DateTime?
  prioridad                 PrioridadCliente?
  prioridades_identificadas String?
  riesgos_barreras          String?
  resumen_relacion          String?
  estado                    EstadoCliente     @default(PROSPECTO)
  responsable_id            String
  created_at                DateTime          @default(now())
  updated_at                DateTime          @updatedAt
  deleted_at                DateTime?

  responsable   Usuario            @relation(fields: [responsable_id], references: [id])
  contactos     Contacto[]
  oportunidades Oportunidad[]
  tareas        Tarea[]
  bitacora      BitacoraEntrada[]
  documentos    DocumentoCliente[]

  @@map("clientes")
}

model Contacto {
  id           String       @id @default(uuid())
  cliente_id   String
  nombre       String
  cargo        String?
  correo       String?
  telefono     String?
  rol_decision RolContacto?
  notas        String?
  created_at   DateTime     @default(now())
  deleted_at   DateTime?

  cliente Cliente @relation(fields: [cliente_id], references: [id])

  @@map("contactos")
}

model Oportunidad {
  id                     String            @id @default(uuid())
  cliente_id             String
  nombre                 String
  problema_detectado     String?
  solucion_propuesta     String?
  servicios_interes      String?
  valor_estimado_cop     Decimal?          @db.Decimal(15, 2)
  estado                 EstadoOportunidad @default(DISENANDO_PROPUESTA)
  fecha_ultima_gestion   DateTime?
  proyectos_relacionados String?
  created_at             DateTime          @default(now())
  updated_at             DateTime          @updatedAt
  deleted_at             DateTime?

  cliente Cliente @relation(fields: [cliente_id], references: [id])

  @@map("oportunidades")
}

// Tabla unificada CRM + Kanban
model Tarea {
  id             String         @id @default(uuid())
  titulo         String
  descripcion    String?
  responsable_id String
  cliente_id     String?
  estado         EstadoTarea    @default(POR_HACER)
  origen         OrigenTarea    @default(KANBAN)
  prioridad      PrioridadTarea?
  fecha_entrega  DateTime?
  etiquetas      String[]       @default([])
  motivo_bloqueo String?        // solo cuando estado = BLOQUEADA
  created_at     DateTime       @default(now())
  updated_at     DateTime       @updatedAt
  deleted_at     DateTime?

  responsable    Usuario           @relation(fields: [responsable_id], references: [id])
  cliente        Cliente?          @relation(fields: [cliente_id], references: [id])
  comentarios    ComentarioTarea[]
  subtareas      Subtarea[]
  adjuntos       AdjuntoTarea[]
  notificaciones Notificacion[]

  @@map("tareas")
}

// Inmutable por diseño — sin updated_at
model BitacoraEntrada {
  id         String   @id @default(uuid())
  cliente_id String
  autor_id   String
  texto      String
  created_at DateTime @default(now())

  cliente Cliente @relation(fields: [cliente_id], references: [id])
  autor   Usuario @relation(fields: [autor_id], references: [id])

  @@map("bitacora_entradas")
}

model Documento {
  id         String    @id @default(uuid())
  titulo     String
  categoria  String    // String libre — configurable desde admin sin tocar código
  etiquetas  String[]  @default([])
  autor_id   String
  created_at DateTime  @default(now())
  deleted_at DateTime?

  autor     Usuario            @relation(fields: [autor_id], references: [id])
  versiones DocumentoVersion[]
  clientes  DocumentoCliente[]

  @@map("documentos")
}

model DocumentoVersion {
  id             String   @id @default(uuid())
  documento_id   String
  numero_version Int
  storage_path   String   // path en Supabase Storage
  tamano_bytes   Int?
  tipo_archivo   String?
  subido_por_id  String
  created_at     DateTime @default(now())

  documento Documento @relation(fields: [documento_id], references: [id])

  @@unique([documento_id, numero_version])
  @@map("documento_versiones")
}

model DocumentoCliente {
  documento_id String
  cliente_id   String

  documento Documento @relation(fields: [documento_id], references: [id])
  cliente   Cliente   @relation(fields: [cliente_id], references: [id])

  @@id([documento_id, cliente_id])
  @@map("documentos_clientes")
}

model ComentarioTarea {
  id         String   @id @default(uuid())
  tarea_id   String
  autor_id   String
  texto      String
  created_at DateTime @default(now())

  tarea Tarea @relation(fields: [tarea_id], references: [id])

  @@map("comentarios_tareas")
}

model Subtarea {
  id         String  @id @default(uuid())
  tarea_id   String
  titulo     String
  completada Boolean @default(false)

  tarea Tarea @relation(fields: [tarea_id], references: [id])

  @@map("subtareas")
}

model AdjuntoTarea {
  id           String   @id @default(uuid())
  tarea_id     String
  storage_path String
  nombre       String
  created_at   DateTime @default(now())

  tarea Tarea @relation(fields: [tarea_id], references: [id])

  @@map("adjuntos_tareas")
}

model Notificacion {
  id         String           @id @default(uuid())
  usuario_id String
  tipo       TipoNotificacion
  tarea_id   String?
  leida      Boolean          @default(false)
  created_at DateTime         @default(now())

  usuario Usuario @relation(fields: [usuario_id], references: [id])
  tarea   Tarea?  @relation(fields: [tarea_id], references: [id])

  @@map("notificaciones")
}
```

---

### 8.4 Variables de entorno, deploy y límites del sistema

#### .env.example

```bash
# ── Supabase ──────────────────────────────────
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Auth ──────────────────────────────────────
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://muttu-hub.vercel.app

# ── Email (Resend) ────────────────────────────
RESEND_API_KEY=
EMAIL_FROM=noreply@muttu.co

# ── LLM — Carga asistida §4.8 ─────────────────
ANTHROPIC_API_KEY=

# ── Storage ───────────────────────────────────
SUPABASE_STORAGE_BUCKET=muttu-docs
MAX_FILE_SIZE_MB=10
```

#### Deploy e infraestructura

```
Hosting frontend:    Vercel (subdominio gratuito en v1)
                     URL: muttu-hub.vercel.app
                     Dominio propio: migrable desde Vercel Settings →
                     Domains, sin tocar código ni redesplegar.

Hosting BD/Auth:     Supabase Cloud (plan gratuito en v1)

CI/CD:               Automático — push a rama main → despliega en
                     Vercel en ~2 minutos. Sin configuración extra.

Backups:             Automáticos diarios por Supabase.
                     Retención: 7 días (plan gratuito).
                     Recuperación desde panel Supabase, sin
                     intervención del desarrollador.

Ramas recomendadas:
  main       → producción (auto-deploy a Vercel)
  develop    → staging (preview URL automática en Vercel)
  feature/*  → desarrollo de funcionalidades
```

#### Límites del sistema (v1)

| Límite | Valor |
|--------|-------|
| Usuarios concurrentes | 15 |
| Tamaño máx por archivo | 10 MB |
| Formatos de archivo aceptados | PDF, DOCX, XLSX, JPG, PNG |
| Almacenamiento total | 500 MB (plan gratuito Supabase) → ampliable a 100 GB por $25/mes |
| Exportación máx registros | 500 filas por exportación |
| Duración de sesión | 4 horas |
| Timeout extracción LLM §4.8 | 30 segundos |
| Versiones por documento | Sin límite en v1 |
| Retención de backups | 7 días |
| Retención logs cron | 30 días en tabla `cron_logs` |

---

## 9. Orden de construcción sugerido

| Orden | Contenido | Por qué en ese orden |
|-------|-----------|----------------------|
| 1 | Auth, usuarios y roles (§3) + schema Prisma completo + migraciones | Todo lo demás depende de usuarios y permisos |
| 2 | CRM completo: ficha con pestañas, contactos, oportunidades, compromisos, bitácora, búsqueda/filtros, exportación | Módulo de mayor complejidad. §4.8 carga asistida al final de este bloque |
| 3 | Kanban completo con vinculación tarea↔cliente y reportes (§5) | Reutiliza el motor de tareas ya construido en CRM |
| 4 | Repositorio de documentos con versionado (§6) | Módulo más autocontenido |
| 5 | Alertas y notificaciones transversales: panel interno + cron de correo 8am (§4.4, §5.3) | Requiere que ya existan tareas y compromisos con fechas |
| 6 | Dashboard con las 4 caras (§7) y exportación PDF | Depende de que los tres módulos de datos ya existan |

---

## 10. Decisiones de alcance confirmadas

1. **Usuarios:** mínimo 15 usuarios. Efraín accede como rol Colaborador o con rol Externo de acceso limitado.
2. **Migración de datos:** clientes con Brief existente → flujo §4.8. Clientes sin Brief → alta manual usando datos del Excel como referencia. El párrafo narrativo del Excel se vuelca como primera entrada en la Bitácora de gestión.
3. **Permisos por atributo del cliente** (público/privado/cooperante): fuera de v1. El modelo de datos queda flexible para incorporarlo en fases posteriores.
4. **Modalidad:** desarrollo a la medida (código propio, no low-code). Stack: Next.js 16.3 + Supabase + Prisma.
5. **Plazo:** lo antes posible. Construcción por módulos con hitos demostrables al final de cada etapa del §9.
6. **Dominio:** subdominio Vercel gratuito en v1 (`muttu-hub.vercel.app`). Migración a dominio propio (ej. `hub.muttu.co`) sin tocar código, desde panel Vercel.

---

*Documento preparado como especificación técnica para desarrollo con Claude Code.*
*Versión 2.0 — Agosto 2026*
*Muttu Innovación Social S.A.S. — NIT 901.791.077-8*
