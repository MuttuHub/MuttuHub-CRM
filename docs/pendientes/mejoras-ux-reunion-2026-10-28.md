# Mejoras UX/UI detectadas — reunión del 2026-10-28

> Pedido de gerencia: «Si logras encontrar algún otro fallo de ux o ui coméntamelo y
> lo guardamos como mejora futura». Esta lista recoge lo que se encontró al revisar
> los requerimientos de esa reunión. Son mejoras **futuras**: ninguna bloquea el uso
> diario y ninguna está en curso. Cada punto se verificó en el código el 2026-10-29.
> Al final están los hallazgos de la revisión de modales (Administración, Proyectos,
> Documentos y Clientes).

---

## Navegación y nombres

### 1. «Tablero» significa tres cosas distintas

- En el menú, **Tablero** es el Kanban de tareas (`/tablero`, `src/lib/nav.ts:33`).
- Dentro de un proyecto hay un **tablero de actividades**
  (`src/components/proyectos/ficha/actividades-tablero.tsx`).
- Las guías llaman **tablero gerencial** al portafolio de proyectos
  (`docs/guia-prueba-proyectos.md`, `docs/libreto-demo-proyectos-2026-10-14.md`).

Un usuario nuevo no sabe a cuál se refiere una instrucción como «revísalo en el tablero».

**Propuesta:** un nombre por concepto, por ejemplo **Tareas (Kanban)**,
**Portafolio** y **Actividades**, aplicado en el menú, en los títulos y en las guías.

### 2. El tablero gerencial no aparece en Inicio ni en Reportes

Para ver el portafolio hay que entrar a Proyectos. Ni la página de Inicio ni
Reportes lo enlazan, aunque es la vista que gerencia consulta cada semana.

**Propuesta:** una tarjeta de resumen en Inicio y un acceso directo en Reportes
(se cubre en parte con el reporte semanal, tarea 2.5).

## Reportes

### 3. Reportes › Gestión de tareas no se puede filtrar por responsable ni por cliente

Las demás pestañas de Reportes tienen filtros de responsable y tipo de cliente.
La pestaña de tareas los recibe vacíos siempre
(`src/components/reportes/reportes-page.tsx:85`: `responsable={undefined} cliente={undefined}`).

**Propuesta:** mostrar la misma barra de filtros que en las otras pestañas.

### 4. El PDF del portafolio no existe

La exportación del portafolio solo genera Excel. Si se pide en PDF responde con
error 400 (`src/app/api/v1/dashboard/portfolio/export/route.ts:4`).

**Propuesta:** generar el PDF con la misma vista de impresión que usa el resto
de reportes, o quitar la opción de PDF hasta que exista.

### 5. La barra de pestañas de Reportes depende de un parche

Las pestañas fuerzan su alto y alineación con clases `!important`
(`src/components/reportes/reportes-page.tsx:70`, `:76`) para corregir el
componente base. Funciona, pero cualquier cambio en el componente base puede
romperla sin aviso.

**Propuesta:** agregar una variante al componente de pestañas en lugar de forzarla.

## Proyectos y tareas

### 6. Las tareas del Kanban no se pueden vincular a un proyecto

Una tarea se puede vincular a un cliente, pero no a un proyecto: el modelo
`Tarea` no tiene `proyecto_id` (`prisma/schema.prisma`). Por eso el trabajo del
día a día de un proyecto no aparece en su ficha.

**Propuesta:** agregar el vínculo opcional y un filtro por proyecto en el Kanban.
Requiere un cambio de esquema (migración).

### 7. El formulario de nuevo proyecto usa el pie de un modal

`src/components/proyectos/project-create-form.tsx:588` usa `DialogFooter`,
pensado para modales, en una página completa. Los botones quedan con el estilo y
la posición de un modal.

**Propuesta:** usar el pie de formulario de página que usan las demás pantallas.

## Impresión

### 8. Las vistas de impresión no son consistentes

Clientes, tablero y reportes se imprimen desde rutas `/print/*`, sin menú.
La ficha de un proyecto se imprime desde `/proyectos/[id]/imprimir`, dentro del
diseño normal de la aplicación. Se ven y se comportan distinto.

**Propuesta:** mover todas las impresiones a `/print/*` con el mismo encabezado y
el botón «Volver» que se agrega en la tarea 2.4.

---

## Hallazgos de la revisión de modales

### Administración y Proyectos (tarea 2.7, 2026-10-29)

Se revisaron 13 diálogos. Ya se corrigieron en la misma tarea: borrar un elemento de la estructura pide
confirmación; «Cancelar» se desactiva mientras se sube o elimina un documento; «Solicitar modificación»
tiene «Cancelar»; las solicitudes de acceso con Google ya no prometen un correo que no se envía.

### 9. Esc, clic fuera o la X cierran el diálogo con la operación en curso

`presupuesto-import-dialog.tsx:146`, `import-dialog.tsx:136`, `gastos-import-dialog.tsx:205`,
`estructura-po-import-dialog.tsx:180`, `baseline-approval.tsx:58`, `estado-proyecto-acciones.tsx:72`,
`ficha/subir-documento-dialog.tsx:49`. «Cancelar» se desactiva mientras la petición corre, pero Esc, el
clic fuera y la X siguen cerrando: el diálogo se reinicia y el usuario no ve el resultado ni el error.

**Propuesta:** ignorar el cierre mientras la operación esté pendiente, con un helper compartido.

### 10. Los formularios largos pierden lo escrito al cerrarse, sin aviso

`ficha/editar-datos-generales.tsx:92` y `modificacion-form.tsx:58`. En «Solicitar modificación» pueden
perderse decenas de valores.

**Propuesta:** si hay cambios, pedir «¿Descartar los cambios?» antes de cerrar.

### 11. «Cancelar» no tiene el mismo estilo en todos los diálogos

Unos usan botón de texto (`ghost`: línea base, cambio de estado, importaciones, modificación) y otros
botón con borde (`outline`: documentos, datos generales, solicitudes, eliminar elemento).

**Propuesta:** fijar una convención y documentarla junto al componente `Dialog`.

### 12. El tamaño del título varía entre diálogos

`ficha/subir-documento-dialog.tsx:86` y `ficha/ficha-documentos.tsx:250` usan el título por defecto
(26 px); el resto de Proyectos usa 18 px y Solicitudes 17 px.

**Propuesta:** alinear todos al estilo de Proyectos o llevarlo al componente base.

### 13. «Cambiar estado» confirma con un botón genérico, incluso al cancelar el proyecto

`estado-proyecto-acciones.tsx:150`. El botón dice «Confirmar» aunque cancelar sea irreversible, sin
estilo destructivo, y el motivo es obligatorio sin indicarlo.

**Propuesta:** que el botón diga la acción («Cancelar proyecto»), con estilo destructivo, y
que el campo diga «Motivo (obligatorio)».

### 14. Los diálogos no limitan su altura

`src/components/ui/dialog.tsx` (`DialogContent`). Subir y eliminar documento y Solicitudes no añaden
altura máxima con desplazamiento y pueden quedar cortados en un teléfono en horizontal.

**Propuesta:** poner la altura máxima con desplazamiento por defecto en el componente base.

### 15. Aprobar una solicitud no muestra el resultado dentro del diálogo

`admin/solicitudes-section.tsx:375,443`. El diálogo se cierra de inmediato y, si falla, el error
aparece arriba de la página.

**Propuesta:** esperar la respuesta en el diálogo, con botón en carga y error en línea.

### 16. «Subir documento» no dice qué archivos acepta

`ficha/subir-documento-dialog.tsx:122`. No indica tipos ni tamaño; el usuario se entera cuando el
servidor rechaza el archivo.

**Propuesta:** mostrar tipos y tamaño máximo («.xlsx, máx. 4 MB») y validar antes de subir.

### Documentos (tarea 1.5, 2026-10-29)

Ya se corrigieron en la misma tarea: los avisos de título duplicado hablan de «tú»; una subida de varios
archivos muestra un solo aviso; arrastrar un documento a la carpeta abierta no hace nada; «Cancelar» se
desactiva mientras corre la petición; Enter dos veces ya no crea ni renombra la carpeta dos veces.

### 17. Soltar archivos siempre abre el diálogo de subida

Al soltar archivos sobre la lista o una carpeta se abre el diálogo porque la categoría es obligatoria.
Es una decisión de producto: subir directo con una categoría por defecto o con la última usada.

**Propuesta:** definir la categoría por defecto y subir sin diálogo cuando no haga falta preguntar.

### 18. «Carpeta de cliente» solo encuentra los primeros 100 clientes

`src/hooks/kanban.ts:278` pide `/api/v1/clients?page=1&limit=100` y el buscador filtra en el
navegador. La API ya acepta `q`.

**Propuesta:** buscar en el servidor con `q` mientras se escribe.

### 19. Soltar un documento en su propia carpeta sin carpeta abierta igual lo mueve

Con la vista «Todas», los elementos de la lista no traen `carpeta_id`, así que soltar un documento en la
carpeta donde ya está envía un PATCH y muestra «Documento movido.».

**Propuesta:** incluir `carpeta_id` en la lista y omitir el movimiento cuando no cambia.

### 20. El asa para arrastrar documentos es muy pequeña

Mide 16×28 px, por debajo del mínimo recomendado de 44×44 px en pantallas táctiles.

**Propuesta:** agrandar el área de toque sin cambiar el ícono.

### Clientes (tarea 2.7, 2026-10-29)

Ya se corrigieron en la misma tarea: «Cancelar» se desactiva mientras se guarda en los diálogos de
cliente, contacto, oportunidad, compromiso e interacción; Esc y «Cancelar» en un diálogo sobre la ficha
del cliente cierran solo ese diálogo.

### 21. Los diálogos largos del CRM no fijan el pie

`client-form.tsx`, `entity-dialogs.tsx`, `interaccion-form-dialog.tsx`, `task-dialogs.tsx`. Ocupan hasta
el 88 % de la pantalla y los botones quedan al final del desplazamiento.

**Propuesta:** decidirlo en el sistema de diseño (pie fijo en `DialogContent`) y aplicarlo a todos.

### 22. La confirmación se cierra antes de terminar la operación

`ConfirmDialog` (`entity-dialogs.tsx`) se cierra antes de la petición: el indicador de carga nunca se ve
y, si falla, el error solo aparece como aviso flotante.

**Propuesta:** esperar la respuesta dentro del diálogo, como en el punto 15.

### 23. El formulario de cliente siempre está montado

`ClientFormDialog` (`client-form.tsx`) se monta aunque esté cerrado y conserva estado entre aperturas.

**Propuesta:** montarlo solo al abrir o reiniciar su estado al cerrar.

### 24. El PDF y el Excel de clientes ignoran el filtro por etiqueta

La lista filtra por etiqueta (tarea 2.6), pero las exportaciones no reciben ese filtro. Decisión de
producto: ¿la exportación debe respetar el filtro activo?

### 25. Las etiquetas del cliente no se ven fuera del formulario

No aparecen en las tarjetas, las filas de la lista ni la ficha. Decisión de producto: dónde mostrarlas.
