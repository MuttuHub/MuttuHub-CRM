# Fuente: Requerimientos Funcionales - Tablero de Seguimiento y Gestión Social.docx

> Extraído textualmente del .docx original (`C:\Users\Adrian\Downloads\Requerimientos Funcionales - Tablero de Seguimiento y Gestión Social.docx`) provisto por el negocio. Guardado aquí para trazabilidad — no estaba en el repo.

Documento de Requerimientos Funcionales: Tablero de Seguimiento y Gestión de Proyectos de Impacto Social
Fecha: 4 de Septiembre 2026
Dirigido a: Equipo de Desarrollo / Producto
Origen: Equipo de Ejecución

## 1. Objetivo del Sistema

Desarrollar un tablero web centralizado para la gestión y monitoreo integral de proyectos de impacto social. El sistema debe interconectar la planificación operativa (actividades, cronograma y metas), la ejecución técnica (avances, indicadores y medios de verificación) y el control financiero (presupuesto proyectado vs. ejecutado y legalización por rubros), permitiendo una toma de decisiones ágil a través de un Tablero de Control Gerencial con KPIs en tiempo real.

## 2. Roles y Permisos de Usuario

| Rol | Descripción del Perfil | Permisos Principales |
|---|---|---|
| Administrador | Gestor general de la plataforma y configuración maestra. | Creación de proyectos, gestión de usuarios, catálogos de rubros, control de parámetros y acceso total a reportes globales. |
| Gestor de Proyecto / Ejecutor | Coordinadores e integrantes de equipo en campo u oficinas. | Registro y vinculación de cronogramas, metas y presupuestos; carga de soportes de ejecución financiera; actualización de avances técnicos, metas y subida de medios de verificación (archivos o links de Drive). |
| Visualizador / Directivo | Directores, financiadores o aliados estratégicos. | Acceso de sólo lectura al Tablero de Control Gerencial, visualización de indicadores globales, reportes consolidados y semaforizaciones territoriales. |

## 3. Requerimientos Funcionales por Módulo

### 3.1. Módulo de Planificación y Estructuración de Proyectos (Base de Seguimiento)

- **RF-01: Estructura Integral del Proyecto**: El sistema debe permitir registrar proyectos asociando de forma relacional:
  - Información general (Nombre, Código del proyecto, Territorio/Municipio, Cliente, Línea estratégica (Empleabilidad, Emprendimiento, Productividad, Cultural, Social, Cívico-político, Metodo Muttu, Ambiental), Fechas de inicio y fin).
  - Cronograma de actividades vinculadas.
  - Presupuesto inicial proyectado desagregado por rubros (ej. Personal, Transporte, Material POP, Oper Logística, etc.).
  - Metas e indicadores de resultado asociados.

### 3.2. Módulo de Seguimiento Técnico y Avance Físico

- **RF-02: Relación de Actividades y Metas**: Cada actividad debe indicar claramente la meta asociada para verificar de forma objetiva si se realizó de manera completa.
- **RF-03: Porcentaje de Avance Técnico y Semaforización**: El tablero debe calcular automáticamente el porcentaje de avance técnico y reflejar una semaforización de cumplimiento basada en el cronograma y las metas:
  - Verde: Ejecución a tiempo y metas cumplidas conforme a lo planeado. (Parametrización: Pendiente por definir)
  - Amarillo: Desviación menor o retraso moderado en plazos/metas.
  - Rojo: Alerta crítica / retraso significativo que compromete el entregable. (Parametrización: Pendiente por definir)
- **RF-04: Medios de Verificación y Entregables**: El sistema debe permitir adjuntar documentos como soporte de cumplimiento de tareas o ingresar enlaces externos (URLs de carpetas o archivos en Google Drive) para validar los productos entregados.

### 3.3. Módulo de Seguimiento Financiero y Legalización de Gastos

- **RF-05: Proyectado vs. Ejecutado por Rubros**: El sistema debe comparar permanentemente el presupuesto proyectado frente al ejecutado, identificando obligatoriamente el tipo de rubro (ej. Personal, Transporte, Material POP, etc.) para mantener la trazabilidad contable.
- **RF-06: Cargue de Soportes de Legalización**: El sistema debe permitir registrar y adjuntar soportes financieros y de ejecución (facturas, cuentas de cobro, planillas) asociados directamente al gasto y al rubro correspondiente.
- **RF-07: Semaforización Financiera**: Indicador visual automático del estado de ejecución presupuestal para alertar sobre posibles subejecuciones o desviaciones de costos.

### 3.4. Módulo de Tablero de Control Gerencial (KPIs y Métricas Clave)

| Indicador Clave (KPI) | Descripción y Fórmula de Cálculo | Tipo de Visualización Sugerida |
|---|---|---|
| Avance Técnico (%) | Promedio ponderado del progreso de las actividades e hitos del proyecto. | Barra de progreso / Tacómetro |
| Avance Financiero (%) | Relación porcentual del presupuesto ejecutado frente al total asignado. | Gráfico de Líneas / Curva S o Barra |
| Cumplimiento de Indicadores (%) | Porcentaje de indicadores de resultado alcanzados frente a la meta proyectada. | Gráfico de Radar o Tarjeta de Métrica |
| Cumplimiento del Cronograma (%) | Actividades ejecutadas a tiempo frente al total programado en el periodo. | Diagrama de Gantt resumido o Semaforización |
| Productos Entregados / Programados | Conteo absoluto de entregables finalizados con soporte vs. total pactado. | Gráfico de Barras comparativo |
| Beneficiarios Atendidos / Meta | Número de personas impactadas efectivamente frente a la meta poblacional fijada. | Tarjeta de Resumen Ejecutivo |

## 4. Requerimientos No Funcionales

- **RNF-01: Usabilidad y Accesibilidad**: Interfaz intuitiva y adaptada para equipos de ejecución en campo y oficinas directivas.
- **RNF-02: Rendimiento y Carga**: Respuesta rápida en la visualización de los KPIs gerenciales (menor a 3 segundos).
- **RNF-03: Seguridad y Gestión de Archivos**: Resguardo seguro de soportes técnicos (Drive links y documentos adjuntos) y comprobantes financieros bajo control de roles estrictos.

## Arquitectura de Datos Base Relacional (sugerida por el documento original)

- Proyecto <-> Actividades <-> Cronograma <-> Metas
- Proyecto <-> Presupuesto Proyectado <-> Ejecución de Gastos (Rubros: Personal, Transporte, Material POP) + Soportes de Legalización
