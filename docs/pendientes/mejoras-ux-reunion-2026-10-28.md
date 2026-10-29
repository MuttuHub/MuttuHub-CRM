# Mejoras UX/UI detectadas — reunión del 2026-10-28

> Pedido de gerencia: «Si logras encontrar algún otro fallo de ux o ui coméntamelo y
> lo guardamos como mejora futura». Esta lista recoge lo que se encontró al revisar
> los requerimientos de esa reunión. Son mejoras **futuras**: ninguna bloquea el uso
> diario y ninguna está en curso. Cada punto se verificó en el código el 2026-10-29.
> Los hallazgos de la revisión de modales (Documentos y Clientes/Tareas/Proyectos/Admin)
> se agregan al final cuando esa revisión termine.

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

*Pendiente: se agrega al terminar las tareas 1.5 (Documentos) y 2.7 (Clientes,
Tareas, Proyectos y Administración).*
