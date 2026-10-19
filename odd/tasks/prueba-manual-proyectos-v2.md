# Guía de prueba manual: sección Proyectos v2

Guía para recorrer en el navegador, en `http://localhost:3000`, antes del lanzamiento del domingo 2026-10-18. Cada ítem
dice qué hacer y qué se espera. Los ítems marcados con «(nuevo hoy)» se corrigieron o se agregaron el 2026-10-16 y son
los que más conviene mirar. Complementa la lista corta de `odd/tasks/lanzamiento-v2-pendientes-viernes.md` (§2).

## 0. Antes de empezar

- [ ] Levanta la app con `npm run dev` y abre `http://localhost:3000`.
- [ ] Comprueba que ves datos **demo** (por ejemplo «Demo CedeTextil · En ejecución»). **Esperado:** si aparecen nombres
  de clientes reales, detente: la app está apuntando a la base remota y no a la local.
- [ ] Usa una ventana de incógnito por usuario, o cierra sesión entre usuarios.

### Usuarios demo

Contraseña de todos: `MuttuDemo2026!` (salvo que hayas definido `SEED_DEMO_PASSWORD`).

| Usuario | Rol | Para qué sirve |
|---|---|---|
| `admin@demo.muttuhub.local` | Administrador | Todo: crear, editar, validar, aprobar y `/administracion`. Responsable de PRY-2026-003 y PRY-2026-004 |
| `gerencia@demo.muttuhub.local` | Gerencia | Igual que administración en proyectos; recibe las notificaciones de sobregasto |
| `coordinador@demo.muttuhub.local` | Coordinador | Integrante y responsable de PRY-2026-001 y PRY-2026-002; **no** es integrante de 003 ni 004 |
| `colaborador@demo.muttuhub.local` | Colaborador | No debe ver proyectos. Responsable de tres clientes (ver §9) |

### Proyectos demo

| Código | Nombre | Estado | Uso en la prueba |
|---|---|---|---|
| PRY-2026-001 | Demo CedeTextil · En ejecución | En ejecución | Casi todo: ficha, gastos, avances, historial. Tiene 2 gastos validados y 3 registrados (uno con sobregasto) |
| PRY-2026-002 | Demo CedeTextil · Ruta de fortalecimiento | Borrador | Editar datos generales y presupuesto, próximos pasos, carga por Excel |
| PRY-2026-003 | Proyecto AgroSur | Borrador | Proyecto al que el coordinador no pertenece |
| PRY-2026-004 | Proyecto XYZ | Borrador | Igual que el anterior |

No hay ningún proyecto **Suspendido** en los datos demo, así que ese estado solo se ve en el filtro (no se puede
recorrer a mano).

Clientes con oportunidades: **Universidad Central del Valle** (tiene «Demo · Programa de formación técnica (ganada,
lista para convertir)» y un proyecto) y **Agencia de Cooperación Delta Verde** (2 oportunidades, sin proyectos).

### Cómo anotar un problema

Captura de pantalla, ruta (URL), usuario con el que estabas, pasos exactos y qué esperabas. Si la pantalla se pone
negra o en blanco, abre F12 y copia el error rojo de la pestaña Console. Anota todo en la tabla del final.

## 1. Portafolio `/proyectos` (administración o gerencia)

- [ ] **KPIs:** arriba hay cuatro tarjetas: «Proyectos», «Presupuesto activo», «Beneficiarios» y «Actividades
  atrasadas». **Esperado:** «Proyectos» muestra 4 con «1 en ejecución»; «Presupuesto activo» suma solo lo que está en
  ejecución.
- [ ] **Pestañas:** con administración, gerencia o coordinador aparecen «Portafolio» y «Tablero». **Esperado:** el
  Tablero carga sin error. El colaborador no las ve.
- [ ] **Filtros (nuevo hoy):** hay listas desplegables «Todos los estados», «Todos los clientes», «Todas las líneas»,
  «Todos los municipios» y «Todos los responsables». **Esperado:** cada una reduce la tabla; combinar dos reduce más.
- [ ] **Estados:** filtra por «Borrador» y por «En ejecución». **Esperado:** la tabla muestra solo esos proyectos.
- [ ] **«Limpiar filtros» (nuevo hoy):** aparece solo cuando hay un filtro activo. **Esperado:** al pulsarlo vuelven los
  4 proyectos. Con un filtro sin resultados dice «No encontramos proyectos con estos filtros».
- [ ] **Tabla:** columnas Proyecto, Responsable, Estado, Fechas, Territorio · línea, Valor total, Avance técnico,
  Avance financiero y Acciones. **Esperado:** los borradores muestran «Sin medir» en los avances.
- [ ] **Cola de validación (nuevo hoy):** debajo de la tabla, «Gastos por validar · N». **Esperado:** aparecen los 3
  gastos registrados de PRY-2026-001; uno trae la etiqueta «Supera el asignado». Solo se listan gastos de proyectos en
  ejecución o suspendidos.
- [ ] **Vista angosta:** reduce la ventana a unos 390 px. **Esperado:** los filtros se pliegan detrás de un botón
  «Filtros» y la tabla no se sale de la pantalla.

## 2. Crear proyecto `/proyectos/nuevo` (administración o gerencia)

- [ ] Pulsa «Nuevo proyecto» en el portafolio. **Esperado:** abre el asistente con los pasos General, Metas,
  Cronograma, Presupuesto y Revisión.
- [ ] **Empieza por el cliente:** el primer campo es «Cliente» (buscador «Buscar cliente por nombre»). **Esperado:** el
  campo «Oportunidad» dice «Selecciona primero el cliente» hasta que eliges uno.
- [ ] **Tarjeta del cliente:** elige «Universidad Central del Valle». **Esperado:** aparece una tarjeta de solo lectura
  con tipo de cliente, ubicación, contacto principal y conteo de oportunidades.
- [ ] **Oportunidad opcional:** abre «Oportunidad». **Esperado:** puedes elegir «Sin oportunidad (proyecto
  independiente)» o la oportunidad ganada del cliente. Si eliges esta última, el proyecto toma su nombre y su valor.
- [ ] **Ayudas ⓘ:** pasa el cursor o pulsa los botones «Ayuda: …» de Cliente, Oportunidad, Descripción, Valor total,
  Fecha de fin y Beneficiarios. **Esperado:** cada uno muestra un texto breve y claro.
- [ ] **Valor total (nuevo hoy):** escribe `250.000`. **Esperado:** se acepta. Con `0` o vacío dice «El valor total debe
  ser mayor que cero.»; con texto o más de dos decimales muestra el aviso del formato `1.500,50`.
- [ ] **Fechas:** pon inicio igual al fin, y luego inicio posterior al fin. **Esperado:** ambos casos dan «La fecha de
  fin debe ser posterior a la fecha de inicio.» (no se permiten proyectos de un día).
- [ ] **Descripción:** déjala vacía. **Esperado:** no bloquea; el campo es opcional, igual que Beneficiarios.
- [ ] **Otras validaciones:** envía sin líneas estratégicas, sin línea principal o sin municipios. **Esperado:** un
  mensaje claro por cada caso, por ejemplo «Selecciona al menos un municipio.»
- [ ] Completa todo y pulsa «Crear proyecto y continuar». **Esperado:** el proyecto nace en Borrador y pasa al paso
  Metas.
- [ ] **Pasos siguientes:** recorre Metas (con «Descargar plantilla» e «Importar plantilla»), Cronograma, Presupuesto
  y Revisión («Guardar borrador», «Aprobar línea base»). **Esperado:** no se pierde lo capturado al avanzar.
- [ ] **Desde un cliente:** abre `/clientes`, entra a la ficha de un cliente y pulsa «Crear proyecto» (solo con
  administración o gerencia). **Esperado:** el asistente abre con ese cliente ya elegido.
- [ ] **Sin permiso:** con el coordinador abre `/proyectos/nuevo`. **Esperado:** «No tienes acceso para crear
  proyectos» y el aviso de que lo pueden hacer Administración y Gerencia.

## 3. Ficha: encabezado (abre PRY-2026-001 desde la tabla)

- [ ] **Encabezado:** código, nombre, chip de estado y dos semáforos, «Semáforo técnico» y «Semáforo financiero».
  **Esperado:** en un proyecto en Borrador (002) no hay semáforos.
- [ ] **Semáforos clicables:** pulsa cada uno. **Esperado:** el técnico lleva a Actividades y el financiero a
  Finanzas.
- [ ] **«Registrar avance» y «Registrar gasto»:** **Esperado:** el primero lleva a Actividades y el segundo a
  Finanzas, donde está el formulario. Solo aparecen con el proyecto en ejecución y para quien puede ejecutarlo.
- [ ] **Menú «Más acciones»:** abre «Exportar a Excel» (diálogo «Elige el corte y la base, y descarga la ficha.») y
  «Imprimir / PDF».
- [ ] **Imprimir / PDF:** se abre una pestaña nueva con el botón «Imprimir / Guardar PDF». Pulsa Ctrl+P.
  **Esperado:** la vista previa muestra solo la hoja de la ficha, sin menú lateral ni barra.

## 4. Ficha: Resumen

Las pestañas de la ficha son Resumen, Actividades, Finanzas, Documentos e Historial; abre en Resumen.

- [ ] **Estado del proyecto:** bloques «Técnico» y «Financiero». **Esperado:** cada uno con su color y una frase que
  explica la causa («Al día», «En riesgo» o «Atención»), con enlaces «Ver actividades» y «Ver finanzas».
- [ ] **«Requiere atención»:** **Esperado:** lista lo pendiente con enlaces, o dice «Nada pendiente por ahora.»
- [ ] **Datos generales:** Cliente, Origen, Responsable, Fecha de inicio, Fecha de fin, Duración, Valor total,
  Beneficiarios, Líneas estratégicas y Municipios. **Esperado:** Beneficiarios es un solo número; no hay sección ni
  historial de atendidos.
- [ ] **Equipo:** **Esperado:** lista los integrantes (en 001, el coordinador).
- [ ] **Editar en borrador (002, como administración):** pulsa «Editar datos generales». **Esperado:** se pueden
  cambiar nombre, descripción, fechas, valor total, responsable, beneficiarios, líneas y municipios. «Guardar
  cambios» deja el cambio en el historial.
- [ ] **Editar en ejecución (001):** **Esperado:** el aviso dice «En ejecución puedes cambiar la descripción y los
  beneficiarios.» Fechas y valor no se editan; hay un botón «Solicitar modificación» («Cambian la línea base:
  solicítalo como modificación.»).
- [ ] **Próximos pasos (002, en borrador):** **Esperado:** una lista con cada paso pendiente («Objetivos y actividades
  cargados», «Fechas y valor definidos», «Presupuesto asignado») y el aviso de usar «Aprobar línea base» al final.

## 5. Actividades

- [ ] **Vistas:** en 001 el selector «Vista de actividades» ofrece Lista, Gantt y Tablero. **Esperado:** las tres
  cargan. En un borrador no hay Tablero.
- [ ] **Tablero:** columnas «Por iniciar», «En curso», «Terminada» y «Atrasada». **Esperado:** pulsar una tarjeta te
  lleva a esa actividad en la Lista.
- [ ] **«Opciones avanzadas»:** en la Lista, plegable. **Esperado:** permite cambiar la línea base y el corte, y muestra
  la curva S.
- [ ] **Registrar avance:** en una actividad pulsa «Registrar avance». **Esperado:** pide cantidad, fecha y medio de
  verificación. Con fecha futura dice «La fecha del avance no puede ser posterior a hoy.»
- [ ] **Borrador (002):** **Esperado:** la Lista es la estructura editable y, si está vacía, ofrece «Cargar desde
  Excel» y «Crear a mano».

## 6. Finanzas (PRY-2026-001)

- [ ] **Segmentos:** «Resumen», «Gastos» y «Presupuesto». **Esperado:** en Resumen, la ficha financiera con barra de
  ejecución, Programado, Ejecutado y la tabla por rubro.
- [ ] **Presupuesto sin cambios solos:** en 002 (borrador, como administración) abre Presupuesto, escribe un monto y
  luego bórralo dígito por dígito. **Esperado:** el campo no cambia solo ni se rellena. En un proyecto en ejecución
  dice que el presupuesto solo se edita en borrador.
- [ ] **Filtros de gastos:** Todos, Registrado, Validado, Rechazado, Anulado y «Pendiente por revisión» (nuevo nombre).
  **Esperado:** «Pendiente por revisión» muestra el gasto con sobregasto.
- [ ] **Registrar gasto (nuevo hoy):** pulsa «Registrar gasto». Elige un rubro, tipo de soporte, fecha, tercero,
  número de documento, descripción y valor `1.500.000,50`, y adjunta un soporte tipo «Enlace» (`https://…`).
  **Esperado:** el valor se acepta con ese formato y el gasto queda «Registrado». Con `1500000.50` o texto, el
  formulario avisa del formato.
- [ ] **Sobregasto:** registra un gasto mayor que lo disponible en el rubro. **Esperado:** queda con alerta y entra en
  «Pendiente por revisión»; en la cola del portafolio aparece «Supera el asignado».
- [ ] **Validar:** como gerencia o administración, en un gasto que no registraste, pulsa «Validar». **Esperado:**
  pasa a «Validado» y sale de la cola.
- [ ] **Rechazar:** pulsa «Rechazar», escribe un motivo en «Motivo del rechazo» y «Confirmar rechazo».
  **Esperado:** el botón de confirmar está desactivado sin motivo; el gasto queda «Rechazado» (ver §11).
- [ ] **Anular:** en un gasto validado pulsa «Anular» y escribe el motivo. **Esperado:** pasa a «Anulado», y queda en
  la auditoría.
- [ ] **Gasto propio:** como administración, registra un gasto y míralo en la lista. **Esperado:** dice «Tú lo
  registraste» y no tiene «Validar» ni «Rechazar».
- [ ] **Estado del proyecto (nuevo hoy):** validar o rechazar solo funciona con el proyecto en ejecución o suspendido.
  **Esperado:** si la API lo rechaza, el mensaje es «Solo se pueden validar o rechazar gastos de proyectos en ejecución
  o suspendido.» Con los datos demo no hay un gasto registrado en otro estado, así que este caso lo cubren las
  pruebas automáticas; anular sí funciona en cualquier estado.

## 7. Documentos

- [ ] **Agrupación:** **Esperado:** los documentos aparecen agrupados por origen: Actividades, Indicadores, Gastos y
  Proyecto.
- [ ] **Filtro y buscador:** usa «Filtrar documentos» y «Buscar por nombre». **Esperado:** la lista se reduce; sin
  coincidencias dice «No hay documentos con este filtro.»
- [ ] **Abrir uno:** pulsa un soporte (por ejemplo uno de un gasto). **Esperado:** se abre el archivo o el enlace
  mediante una URL firmada, sin error.

## 8. Historial

- [ ] **Pestañas:** «Modificaciones», «Versiones» y «Auditoría».
- [ ] **Solicitar una modificación (001, con administración o gerencia):** en Modificaciones pulsa «Solicitar
  modificación», elige «Adición de recursos» o «Reprogramación de periodos», indica el valor o las fechas nuevas y el
  motivo. **Esperado:** la solicitud queda «Pendiente».
- [ ] **Aprobar y rechazar:** pulsa «Aprobar» en la solicitud. **Esperado:** pasa a «Aprobada» y en Versiones aparece
  una versión nueva con la diferencia. Repite con otra solicitud y «Rechazar» (pide un comentario): queda «Rechazada».
- [ ] **Auditoría:** **Esperado:** cada paso anterior aparece con usuario y hora.

## 9. Permisos por rol

Para el coordinador y el colaborador, abre las fichas por URL (los identificadores son los de la base demo local):

- 001: `/proyectos/ad060dca-de1c-4c74-a2ac-4b2493ef852e`
- 003: `/proyectos/e15511fb-bebd-4924-8a21-387178212fb2`

| Rol | Acción | Esperado |
|---|---|---|
| Gerencia | Ver `/proyectos`, abrir cualquier ficha, validar y rechazar gastos, aprobar modificaciones | Todo permitido; ve los 4 proyectos |
| Gerencia | «Nuevo proyecto» | Permitido |
| Coordinador (miembro de 001 y 002) | `/proyectos` | Ve solo PRY-2026-001 y PRY-2026-002 |
| Coordinador miembro | «Registrar gasto» y «Registrar avance» en 001 | Permitido (el proyecto está en ejecución) |
| Coordinador miembro | «Validar» o «Rechazar» un gasto, «Aprobar» una modificación | No aparecen los botones |
| Coordinador **no** miembro | Abrir la ficha 003 por URL | «No tienes acceso a este proyecto» |
| Coordinador | `/proyectos/nuevo` | «No tienes acceso para crear proyectos» |
| Colaborador | `/proyectos` | Lista vacía: «Aún no tienes proyectos visibles» (sin pestañas Portafolio/Tablero) |
| Colaborador | Abrir la ficha 001 por URL | «No tienes acceso a este proyecto» |
| Colaborador | Registrar un gasto | No hay forma de llegar al formulario |
| Quien registró un gasto | Validar su propio gasto | Bloqueado: «Tú lo registraste», sin botones (incluso administración) |

- [ ] **Feeds de contactos (P1, nuevo hoy):** con cada usuario abre, ya con la sesión iniciada,
  `http://localhost:3000/api/v1/contacts` y `http://localhost:3000/api/v1/interactions`. **Esperado:** administración,
  gerencia y coordinador ven los contactos e interacciones de todos los clientes; el colaborador solo los de sus
  clientes (Alcaldía de Puerto Esperanza, Constructora Río Claro S.A.S. y Universidad Central del Valle).
- [ ] **Salud de clientes (P2, nuevo hoy):** con el colaborador abre `http://localhost:3000/api/v1/clients/health` y la
  pantalla `/clientes/salud`. **Esperado:** el sub-puntaje de proyectos no aparece (`proyectos: null`) y el puntaje
  total sigue calculándose sin él. Con administración o gerencia sí aparece.

## 10. Clientes (lo que cambió)

- [ ] **Subnavegación:** en `/clientes` las secciones son «Aliados», «Interacciones», «Relaciones», «Salud» y
  «Automatizaciones» (nuevo hoy). **Esperado:** no hay pestañas «Oportunidades» ni «Mapa».
- [ ] **Rutas viejas (nuevo hoy):** abre `/clientes/oportunidades` y `/clientes/mapa`. **Esperado:** ambas redirigen a
  `/clientes`.
- [ ] **Ficha del cliente, pestaña General en solo lectura (nuevo hoy):** abre un cliente con el colaborador (en un
  cliente que no es suyo) o sin pulsar «Editar». **Esperado:** se ven los valores (tipo, prioridad, estado,
  responsable, fecha); ningún campo sale vacío.
- [ ] **Fecha de primer contacto (nuevo hoy):** **Esperado:** se lee en formato legible (día y mes abreviado, por
  ejemplo «12 mar 2026»), no como fecha ISO.
- [ ] **«Crear proyecto»:** en la ficha del cliente, con administración o gerencia. **Esperado:** abre el asistente con
  el cliente elegido; el coordinador y el colaborador no ven el botón.
- [ ] **Conversión:** en «Universidad Central del Valle», crea el proyecto desde la oportunidad «Demo · Programa de
  formación técnica». **Esperado:** el proyecto toma su nombre y valor; la oportunidad ya no se ofrece para otro
  proyecto.

## 11. Notificaciones y extras

- [ ] **Gasto rechazado (M7):** como gerencia, rechaza un gasto de 001 con un motivo (los gastos demo los registró el
  coordinador). Entra como coordinador y abre la campana «Notificaciones». **Esperado:** hay una notificación «Gasto
  rechazado» con tercero, documento, monto y «Motivo: …», que lleva al gasto. Al anular no se notifica.
- [ ] **`/administracion` (nuevo hoy):** con administración y con F12 abierta, entra a `/administracion` («Usuarios y
  permisos»). **Esperado:** carga la tabla de usuarios y las secciones de catálogos, umbrales, accesos y auditoría.
  Hoy se reportó una pantalla negra: si ocurre, copia el error rojo de la consola y anótalo en la tabla.

## 12. Ventana angosta (390 px)

- [ ] **Portafolio:** **Esperado:** los filtros se pliegan en «Filtros» y la tabla no se sale.
- [ ] **Ficha de PRY-2026-001:** recorre las cinco pestañas. **Esperado:** ninguna muestra scroll horizontal de la
  página.
- [ ] **Asistente `/proyectos/nuevo`:** recorre los cinco pasos. **Esperado:** sin desbordes y con botones alcanzables.

## Hallazgos

| # | Pantalla | Usuario | Qué pasó | Esperado | Captura |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
