# Decisiones abiertas — Muttu Hub

**Fecha:** 2026-11-04 · **Para:** Adrián (producto), PO, Gerencia y TI
**Origen:** `plan-trabajo-ux-crm.md` §4 y `rediseno-ciclo-proyecto.md` §5
**Estado:** 24 abiertas. **3 cerradas el 2026-11-04** (D-V3-1, D-F, D-T5) y 1 nueva abierta (D-T5b).

---

## Antes de empezar: ¿esto frena los merges?

**No.** Las 8 ramas que están listas para PR salen de ítems ya resueltos o que no dependen de
ninguna decisión pendiente.

Las dos únicas excepciones, y ninguna frena el *merge*:

| Excepción | Qué pasa |
|---|---|
| **`feat/email-outbox` (PR-M1)** | El código se puede mergear. **Llevarlo a producción** sí necesita D-M1 (proveedor) y D-E (DNS de `muttu.co`). |
| **F0.3 / T14 (contrato de AJ-02)** | Es una migración **en producción**: necesita tu autorización paso a paso, con respaldo y ensayo sobre copia. No es una decisión de producto. |

Y un matiz honesto sobre **D-G1 (glosario)**: el plan exige que todo texto nuevo use ese glosario,
pero la decisión no está tomada. Los textos que acaban de entrar en PR-7a–c usaron la propuesta del
plan. Si la reunión cambia algún nombre, esos textos se ajustan después — es copy, no estructura.

---

## Bloque 1 · PO (12) — lo que más desbloquea

| ID | Pregunta | Desbloquea | Recomendación | Si se posterga |
|---|---|---|---|---|
| **D-G1** | Glosario: ¿**Clientes** (menú y título, «Aliados» como tipo), **Tareas** para el Kanban, **Portafolio** para el tablero gerencial, **Actividades** dentro del proyecto, **Interacciones** para la actual «Bitácora»? | PR-3 y todos los textos nuevos | Aprobar tal cual: es la propuesta y ya está en los prototipos | Nada se rompe; pero cada texto nuevo queda provisional y habrá que repasarlos |
| **D-G2** | Inicio: ¿pasa a «Mi día» (vencidos, agenda, compromisos, accesos rápidos) y la analítica vive solo en Reportes? | PR-12, PR-13, N1, N2 | Aprobar: hoy Inicio y Reportes se solapan | Se sigue duplicando información en dos lugares |
| **D-G3** | Valores iniciales por rol: Kanban en «Mías» y pestaña «Mi resumen» para Colaborador y Coordinador; «Todas» y «Pipeline» para Gerencia y Administración. ¿Se recuerda la última elección? | PR-6, N9 | Aprobar, y **sí** recordar la última elección por usuario | Cada usuario sigue acomodando la vista cada vez que entra |
| **D-G4** | BL#17: al soltar archivos en Documentos, ¿se suben directo con una categoría por defecto o con la última usada? | PR-9 | Última usada; con categoría por defecto solo si es la primera vez | Se mantiene el diálogo extra en cada carga |
| **D-G5** | BL#24: ¿la exportación de clientes (Excel/PDF) respeta el filtro de etiqueta activo? | PR-4 (parte) | Sí, siempre: exportar lo que se está viendo | Se exporta de más y hay que filtrar en Excel |
| **D-G6** | BL#25: ¿dónde se ven las etiquetas del cliente (tarjeta, fila, ficha)? | PR-10 | Fila y ficha; en la tarjeta solo si hay 1 o 2 | Las etiquetas siguen invisibles fuera del formulario |
| **D-G7** | U22: ¿se aprueba el avance por hitos? ¿Los hitos se definen al planificar o también en ejecución? ¿Pesan igual? ¿Son obligatorios para aprobar la línea base? | U22 | Aprobar con hitos definidos al planificar y obligatorios para aprobar | El % de avance sigue midiendo actividades, no resultados |
| **D-A** | Segunda importación del mismo proyecto: ¿se conserva la estructura y solo se carga el presupuesto, o se reemplaza todo? | B5 | Conservar estructura y reemplazar solo lo que trae el archivo | Importar de nuevo sigue borrando lo cargado a mano |
| **D-B8** | ¿Cualquier miembro del proyecto puede adjuntar el soporte de un gasto, o solo quien lo registró? | — (regla de permisos) | Quien lo registró y el coordinador | Riesgo de que nadie pueda completar un soporte faltante |
| **D-CP1** | ¿El responsable es obligatorio al crear la actividad o solo para aprobar la línea base? | CP3 | Obligatorio al crear: sin responsable nadie puede reportar avance (AJ-01) | Se sigue armando estructura que después no se puede ejecutar |
| **D-CP2** | ¿Se elimina «Tipo de medio exigido» del entregable? | CP5 | Sí: AJ-06 ya permite varios archivos y enlaces por soporte | Un campo que ya no aporta y confunde |
| **D-CP6** | ¿El código automático (1, 1.1, 1.2…) se puede editar a mano, por ejemplo para calzar con el documento del aliado? | CP1 | Editable, con aviso si se sale del patrón | Si el aliado exige sus códigos, se hace a mano por fuera |

## Bloque 2 · Gerencia (7)

| ID | Pregunta | Desbloquea | Recomendación | Si se posterga |
|---|---|---|---|---|
| **D-G8** | Reportes: ¿se aprueba el formato común de los 5 informes? ¿Las frases de «Lo esencial» las arma el sistema con reglas fijas? ¿Qué informes salen programados, a quién y con qué frecuencia? ¿Puede alguno ir a un cliente externo? ¿Se habilita la «Legalización de gastos» (gasto por gasto, con tercero y soporte)? | PR-R3 a PR-R7, R11, R13 | Aprobar el formato común; frases por reglas fijas; programados solo internos | Los informes siguen saliendo en 3 formatos distintos |
| **D-G9** | ¿Hace falta un «Informe de avance para el aliado» por proyecto, sin valores comerciales ni notas internas, para enviar a clientes externos? | R12 | Sí, y es el que más valor externo tiene | El aliado sigue recibiendo capturas de pantalla |
| **D-G10** | Reportes v2: ¿se pasa de 6 secciones a 4 informes (Mi semana, Equipo, Comercial, Semanal)? Si se aprueba, los PDF también son 4 | P1, PR-R3 a PR-R7 | Aprobar: menos informes, mejor usados | Se construyen 6 informes que después hay que rehacer |
| **D-G11** | Proyectos v2: ¿entra «Lo que te toca esta semana» en el portafolio, distinto por rol? | P3 | Sí para Coordinador y Colaborador; Gerencia ve el portafolio completo | El responsable sigue sin saber qué le toca sin abrir proyecto por proyecto |
| **D-G12** | Proyectos v2: ¿entra «Avisar a Gerencia» cuando un borrador queda listo y quien lo armó no puede aprobar? | P4 | Sí: hoy el aviso sale por fuera del Hub (correo o WhatsApp) | El paso de borrador a aprobado sigue dependiendo de un mensaje aparte |
| **D-CP3** | En el checklist de cierre, ¿qué **bloquea** el cierre y qué solo **avisa**? | CP11 | Bloquean: gastos sin validar y entregables sin soporte. Avisan: anulaciones pendientes | Se sigue cerrando proyectos con gastos sin validar |
| **D-CP5** | ¿Qué lleva el informe de cierre y a quién se envía? | CP12 | Resumen de cumplimiento, gasto por rubro y desviaciones; a Gerencia | El cierre queda sin evidencia formal |

## Bloque 3 · TI / negocio (3)

| ID | Pregunta | Desbloquea | Recomendación | Si se posterga |
|---|---|---|---|---|
| **D-M1** | Correo: ¿se mantiene **Resend** (gratis hasta ~3.000/mes y 100/día) o se usa Brevo, Amazon SES o SMTP de Microsoft 365? | PR-M1 en producción, PR-M2–M4 | Resend detrás del puerto `EmailSender`: cambiarlo después es una variable de entorno | El correo funciona en local (Mailpit) pero no puede salir a nadie |
| **D-E** | Acceso al DNS de `muttu.co` para verificar el dominio en Resend | A2, T6 | Pedirlo ahora: sin DNS no hay envío desde el dominio propio | Se enviaría desde un remitente genérico o no se envía |
| **D-F** ✔ | ¿Railway reemplaza solo a Vercel (Opción A) o también a Supabase (Opción B)? | E4, E5 | **Decidida: Opción A** — la app a Railway, Supabase sigue dando Auth, Storage y Postgres (un día). Opción B se revisa cuando haya requisito de datos propios | — |

## Bloque 4 · Internas (4)

| ID | Pregunta | Desbloquea | Recomendación | Si se posterga |
|---|---|---|---|---|
| **D-T5** ✔ | Sign-off del dueño de los datos sobre la lectura global de clientes y tareas | T5 | **Decidida: Adrián firma como dueño técnico** (administra el acceso a Supabase); se pide una línea de gerencia que avale la lectura global | — |
| **D-T5b** | **Nueva.** Si la lectura global se mantiene, ¿se ocultan `texto` y `próximo_paso` de la bitácora a los COLABORADOR y se pagina `/interactions` y `/contacts`? | T3 de deuda técnica | Sí: hoy la bitácora completa es visible para todo el equipo autenticado | La exposición de información de clientes sigue sin límite por rol |
| **D-CP4** | El cambio de meta de un entregable, ¿es un tipo de modificación existente o uno nuevo? ¿Quién lo aprueba? | CP10 | Tipo propio, aprobado por Gerencia como una modificación | Nadie puede pedir una meta realista a mitad de proyecto |
| **D-V3-1** ✔ | ¿La interfaz de U17–U21 se hace solo en Proyectos v3? | F4.7, B3–B7 | **Decidida: no se reserva.** Se construye en la sección viva; v3 la hereda cuando llegue | — |
| **D-V3-2** | ¿Cuándo se retira la sección actual cuando v3 esté lista? | B8 | ⚠️ **Reformulada:** el texto original decía «retirar v1», pero en el código **v2 es lo que está en producción**. Propuesta original: 2 semanas de piloto y paridad de reglas al 100 % | Conviven dos versiones sin fecha de corte |

---

## Cómo destrabar esto sin esperar una reunión

**Cerradas hoy, sin reunión:** **D-V3-1** (no se reserva la interfaz para v3), **D-F** (Opción A: app en
Railway, Supabase se queda) y **D-T5** (Adrián firma como dueño técnico; falta una línea de gerencia).

**Queda una tuya, reformulada:** **D-V3-2** — ¿cuándo se retira la sección **actual** cuando v3 esté lista?

**Una sola reunión de 45 minutos con la PO** cubre el Bloque 1 completo (12 decisiones) y desbloquea
PR-3, PR-4 parcial, PR-6, PR-9, PR-10, PR-12, U22 y las cuatro CP.

**Una reunión de 20 minutos con Gerencia** cubre el Bloque 2 y define de una vez el formato de todos
los informes.

**TI, en paralelo y sin reunión:** D-M1 y D-E. Son las que habilitan que el correo salga del local.

## Sugerencia de orden

1. **D-G1 y D-G8** primero: son las que más ítems desbloquean (PR-3 y los cinco informes).
2. **D-G10** después: define cuántos informes se construyen; si se responde tarde, se rehace trabajo.
3. **D-M1 y D-E** en paralelo: no dependen de nadie del equipo de producto.

---

*Este documento se actualiza a medida que se responden. Cada decisión cerrada se anota también en el
plan (`plan-trabajo-ux-crm.md` §4) con fecha y quién la tomó.*
