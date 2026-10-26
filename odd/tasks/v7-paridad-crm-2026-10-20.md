# Paridad de v7 en CRM — verificación (2026-10-20)

Tarea **V0** del plan: comprobar contra el código y los endpoints qué pantallas de v7 en CRM existen de verdad.
Solo lectura; no se cambió nada. Fuente de expectativas: `odd/tasks/v7-gap-analysis.md` (secciones A y B).

## Veredicto

| Pantalla | Ruta | Veredicto | Qué hay | Qué falta |
|---|---|---|---|---|
| **Salud de la cartera** | `/clientes/salud` | **Cumple** | `GET /api/v1/clients/health` + `SaludVista`: resumen (total, Sana/Atención/En riesgo/Sin datos, promedio), lista rankeada con score, barra y motivo, enlace a la ficha. Pesos del prototipo **40/35/25** fijados en pruebas (`PESO_CONTACTO/COMPROMISOS/PROYECTOS`) | Nada funcional. El subscore de proyectos se oculta a quien no lee el portafolio, por diseño |
| **Relaciones** | `/clientes/relaciones` | **Cumple (lectura)** | Mapa 2×2 poder × interés con las cuatro zonas de v7 y lista de contactos con cargo, owner, rol y fuerza de 3 barras. `GET /api/v1/contacts` ya devuelve `poder`, `interes`, `fuerza_relacion` y `owner_nombre`; el formulario de contacto los edita (1–5 y 1–3) | Nada funcional. La sección es de solo lectura a propósito; se edita desde la ficha del cliente |
| **Automatizaciones** | `/clientes/automatizaciones` | **Parcial** | `GET/PUT /api/v1/settings/automatizaciones`: encendido del resumen diario, ventana de «próximos» (1–30 días) y categorías incluidas; el cron las consume | Las demás reglas del prototipo («recordar 2 días antes», «30 días sin contacto») y las **plantillas de correo**. Hoy son solo el resumen diario |
| **Mapa** | `/clientes/mapa` | **Esqueleto** | La ruta **redirige** a `/clientes` (`M4/Y3`: «aún no está construida») | Todo: no hay relación cliente → departamento (`Cliente.ubicacion` es texto libre) ni endpoint de agregación ni UI |

## Lo que la verificación cambia en el plan

- **V5 (mapa), V6 (salud), V7 (relaciones) y V8 (automatizaciones)** dejan de ser «sin verificar». Salud y relaciones
  se cierran; mapa sigue pendiente y automatizaciones queda como ampliación.
- El trabajo real de v7 en CRM queda así:

| Brecha | Tamaño | Depende de |
|---|---|---|
| Mapa por departamento (relación cliente → departamento + agregación + UI) | M–L | Migración |
| Reglas adicionales de automatización (toggles sobre `Setting`) | S–M | — |
| Plantillas de correo y envío | L | Dominio verificado en Resend (A2) |
| Oportunidades globales con kanban de 7 etapas | L | Decisión D-D y mapeo del enum de estados |
| Interacciones con `tipo` y `próximo paso` + feed global | M | Migración |
| Convocatorias | M | Decisión D-D |
| Propuesta económica de la oportunidad | L | Decisión D-D (hoy fuera de alcance) |
| Ficha de seguimiento con tabla mensual editable | M | — |

## Recomendación

1. **No construir v7 en CRM todavía** salvo que el negocio lo pida (D-D). Salud y relaciones ya están; lo que falta es
   caro (oportunidades globales, propuesta económica) o depende de datos que la operación aún no produce.
2. Lo que sí tiene valor inmediato: **interacciones con tipo y próximo paso** (M, reutiliza la bitácora y alimenta la
   salud de la cartera) y **reglas adicionales de automatización** (S–M, sin migración).
3. Para la PO, el siguiente entregable sigue siendo **B2/B3** (adaptador de sus plantillas), que depende de la decisión
   **D-A** (importar estructura sin presupuesto).
