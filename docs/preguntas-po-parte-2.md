# Cinco definiciones antes de estimar la Parte 2

Documento para la PO. No hace falta saber nada técnico para contestarlo: cada pregunta tiene opciones y dice qué
cambia en el producto según lo que se elija. Viene de la revisión del documento del 10 de noviembre (EV-01 a EV-08).

Lo que ya está decidido y no se pregunta: la Parte 2 entra sin tocar el histórico, así que los presupuestos, las
versiones aprobadas y los gastos que ya existen en CedeTextil y en los demás proyectos quedan como están.

---

## 1. ¿Una actividad puede tener más de un rubro?

**El caso:** una actividad «Capacitación a docentes» que gasta en Transporte y también en Materiales.

- **Opción A — Sí.** Cada actividad puede tener varios rubros, y el presupuesto tiene un renglón por cada
  combinación (Capacitación × Transporte, Capacitación × Materiales). Es lo más parecido a la realidad cuando una
  actividad gasta en varias cosas.
- **Opción B — No, un rubro por actividad.** Si una actividad necesita dos rubros, se parte en dos actividades (una
  de transporte y una de materiales).

**Qué cambia:** con A la pantalla de presupuesto muestra la actividad con sus rubros adentro y el total por rubro se
calcula sumando. Con B todo queda más plano y más simple de leer, pero obliga a partir actividades.

**Mi recomendación:** si hoy en la práctica ya parten las actividades por rubro cuando hay dos tipos de gasto, **B**
alcanza y es notablemente más barato. Si han tenido actividades con dos rubros a la vez, **A**.

## 2. El monto asignado, ¿se controla por actividad o por rubro?

**El caso:** hoy, para cada rubro, el monto asignado tiene que ser igual a la suma de su programación mes a mes; si no
cuadra, el sistema no deja aprobar. Con varios renglones del mismo rubro (uno por actividad) hay que decidir dónde se
hace ese control.

- **Opción A — Por renglón.** Cada combinación actividad × rubro cuadra con su propia programación mensual. El control
  por rubro pasa a ser la suma de sus renglones. Es la misma regla de hoy, un nivel más abajo.
- **Opción B — Sólo por rubro.** El monto se lleva por actividad, pero la programación mensual se sigue cuadrando
  contra el total del rubro.

**Mi recomendación:** **A**. Conserva la regla que ya existe y evita que un error de programación en una actividad
aparezca escondido dentro del total del rubro.

## 3. Una factura, ¿puede repartirse entre varias actividades?

**El caso:** una factura de transporte que cubre tres actividades del mismo mes.

- **Opción A — Sí, se reparte.** El gasto se registra una vez y se distribuye entre varias actividades. Es lo que
  sugiere «facturas distribuidas» en el documento.
- **Opción B — No, una factura va a una sola actividad.** Si hay que repartirla, se registra una fila por actividad.

**Qué cambia:** A agrega una tabla de reparto, complica la importación de Excel y la edición de gastos. B es una
columna más, y el reparto se hace a mano partiendo el gasto.

**Mi recomendación:** **B** para arrancar, salvo que hoy ya repartan facturas a mano con frecuencia. Si es frecuente,
**A** desde el principio, porque agregarlo después obliga a tocar la importación dos veces.

## 4. Los gastos que ya están cargados, ¿qué hacemos con ellos?

Cuando se active el presupuesto por actividad, los gastos anteriores no tienen actividad asignada.

- **Opción A — Quedan como «Sin actividad».** Se muestran en una fila aparte del cuadro y no se tocan. Es lo que ya
  pasa hoy con los gastos sin rubro.
- **Opción B — Hay que asignarles actividad antes de activar.** Es trabajo de datos, proyecto por proyecto.

**Mi recomendación:** **A**. No frena el arranque y deja la información histórica intacta; si un proyecto necesita
depurar, se hace después con calma.

## 5. La programación mensual que propone el sistema, ¿cómo la reparte?

El documento pide que el sistema proponga el reparto mensual del presupuesto (EV-03). Hay dos formas razonables.

- **Opción A — Parejo entre los meses que toca la actividad.** Una actividad de marzo a junio recibe un cuarto del
  monto cada mes, sin importar que marzo tenga más semanas.
- **Opción B — Proporcional a las semanas de cada mes.** Los meses con más semanas de la actividad reciben más.

**Qué cambia:** A es más fácil de explicar y de revisar a ojo. B se parece más al esfuerzo real y es coherente con la
forma en que ya se pondera el avance técnico.

**Mi recomendación:** **B**, y que el Gestor pueda corregir el reparto propuesto antes de guardarlo — así la propuesta
es un punto de partida y no una imposición.

---

## Qué pasa con cada respuesta

- La **1** es la que más pesa: decide si el trabajo de base es grande o mediano.
- La **3** decide si hace falta una tabla nueva y si la importación de Excel cambia una vez o dos.
- La **2**, la **4** y la **5** no cambian el tamaño del trabajo, sólo su comportamiento.

Ninguna de estas preguntas frena la Parte 1: los ajustes ya están implementados.
