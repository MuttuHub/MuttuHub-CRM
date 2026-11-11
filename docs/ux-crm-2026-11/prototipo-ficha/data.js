/* Demo data of PRY-2026-001 (seed «Demo CedeTextil», cut 05 nov 2026), taken from the canvas boards.
   Values marked DEMO-ONLY are illustrative fillers the boards did not specify. */
(function () {
  const MH = (window.MH = window.MH || {});

  MH.seed = function () {
    return {
      hoy: "2026-11-05",
      proyecto: {
        codigo: "PRY-2026-001",
        nombre: "Demo CedeTextil",
        estado: "En ejecución",
        cliente: "Instituto Andino de Innovación Productiva",
        responsable: "Laura Jiménez",
        origen: "Desde una oportunidad ganada",
        valorTotal: 177360000,
        frenteOportunidad: -32640000,
        lineas: "Productividad (principal), Emprendimiento",
        municipios: "Medellín, Barranquilla",
        beneficiarios: 500,
        inicio: "2026-10-05",
        fin: "2027-01-29",
        semana: 5,
        semanas: 17,
        avanceReal: 35.7,
        avanceProgramado: 77.3,
        semaforoTecnico: "rojo",
        semaforoFinanciero: "verde",
        topeAvance: 90,
      },
      equipo: [
        { nombre: "Laura Jiménez", rol: "Coordinadora · responsable del proyecto" },
        { nombre: "Andrés Torres", rol: "Colaborador · responsable de 1.3 y 1.4" },
        { nombre: "Mateo Salazar", rol: "Gerencia" },
        { nombre: "Camila Restrepo", rol: "Gerencia" },
      ],
      objetivos: [{ codigo: "1", texto: "Fortalecer las capacidades productivas de las unidades textiles del municipio." }],
      actividades: [
        {
          codigo: "1.1", nombre: "Caracterización de las unidades productivas", estado: "finalizada",
          responsable: "Laura Jiménez", avance: 90, programado: 100, fin: "2026-10-11",
          entregables: [
            { codigo: "1.1-E1", nombre: "Informe de caracterización", meta: 1, unidad: "informe", contado: 1, soportes: 1 },
            { codigo: "1.1-E2", nombre: "Memoria de la jornada de caracterización", meta: 1, unidad: "memoria", contado: 1, soportes: 1 },
          ],
          reportes: [
            { id: "r11b", pct: 90, fecha: "2026-10-11", quien: "Laura Jiménez", registrado: "2026-11-05T21:31", obs: "Caracterización ejecutada en las unidades; pendiente cargar el informe y la memoria.", soporte: true, anulado: false },
            { id: "r11a", pct: 30, fecha: "2026-11-02", quien: "Mateo Salazar", registrado: "2026-11-03T12:30", obs: "Avance del proyecto.", soporte: false, anulado: true, motivoAnulacion: "Reporte de prueba anterior; se reemplaza por el avance real al cierre de la actividad." },
          ],
        },
        {
          codigo: "1.2", nombre: "Formación en prácticas de confección", estado: "finalizada_retraso",
          responsable: "Laura Jiménez", avance: 100, programado: 100, fin: "2026-10-25",
          entregables: [
            { codigo: "1.2-E1", nombre: "Informe de la formación en confección", meta: 1, unidad: "informe", contado: 1, soportes: 1 },
          ],
          reportes: [
            { id: "r12a", pct: 100, fecha: "2026-10-28", quien: "Laura Jiménez", registrado: "2026-11-02T10:10", obs: "Formación terminada; informe cargado.", soporte: true, anulado: false }, // DEMO-ONLY
          ],
        },
        {
          codigo: "1.3", nombre: "Acompañamiento técnico a las unidades", estado: "vencida", semaforo: "rojo",
          responsable: "Andrés Torres", duracionDias: 7, avance: 50, programado: 100, fin: "2026-10-25",
          entregables: [
            { codigo: "1.3-E1", nombre: "Acta de acompañamiento", meta: 4, unidad: "actas", contado: 0, soportes: 2 },
            { codigo: "1.3-E2", nombre: "Plan de mejora de la unidad productiva", meta: 1, unidad: "plan", contado: 0, soportes: 0 },
          ],
          reportes: [
            { id: "r13a", pct: 50, fecha: "2026-11-05", quien: "Laura Jiménez", registrado: "2026-11-05T21:50", obs: "Se realizaron las visitas técnicas a las unidades.", soporte: false, anulado: false },
          ],
        },
        {
          codigo: "1.4", nombre: "Entrega de dotación y certificación", estado: "en_curso", semaforo: "rojo",
          responsable: "Andrés Torres", duracionDias: 28, diaActual: 19, avance: 0, programado: 67.9, fin: "2026-11-14",
          entregables: [
            { codigo: "1.4-E1", nombre: "Acta de entrega de dotación", meta: 30, unidad: "actas", contado: 0, soportes: 0 }, // DEMO-ONLY
            { codigo: "1.4-E2", nombre: "Certificados de participación", meta: 60, unidad: "certificados", contado: 0, soportes: 0 }, // DEMO-ONLY
          ],
          reportes: [],
        },
      ],
      indicadores: [
        { codigo: "IND-1", nombre: "Unidades productivas fortalecidas", valor: 9, meta: 30 },
        { codigo: "IND-2", nombre: "Personas formadas", valor: 12, meta: 60 },
      ],
      finanzas: { ejecutado: 22115000, programadoHoy: 88680000, pctProgramado: 24.9, pctTotal: 12.5 },
      rubros: [
        { codigo: "R01", nombre: "Personal", programadoHoy: 29750000, ejecutado: 12000000, asignado: 59500000 },
        { codigo: "R04", nombre: "Promoción y divulgación", programadoHoy: 17000000, ejecutado: 10115000, asignado: 34000000 },
        { codigo: "R06", nombre: "Caracterización", programadoHoy: 720000, ejecutado: 0, asignado: 1440000 },
        { codigo: "R08", nombre: "Formación", programadoHoy: 22500000, ejecutado: 0, asignado: 45000000 },
        { codigo: "R11", nombre: "Varios", programadoHoy: 150000, ejecutado: 0, asignado: 300000 },
        { codigo: "R12", nombre: "Transporte", programadoHoy: 12000000, ejecutado: 0, asignado: 24000000 },
        { codigo: "R13", nombre: "Suministros", programadoHoy: 6400000, ejecutado: 0, asignado: 12800000 },
        { codigo: "R15", nombre: "Dotación", programadoHoy: 160000, ejecutado: 0, asignado: 320000 },
      ],
      gastos: [
        { id: "CC-0001", tipo: "Cuenta de cobro", tercero: "Equipo técnico (demo)", nit: "—", rubro: "R01", total: 12000000, iva: 0, periodo: "2026-10", fecha: "2026-10-20", descripcion: "Honorarios del equipo técnico, primera quincena.", estado: "validado", registro: "Laura Jiménez", soporte: "Cuenta de cobro CC-0001" },
        { id: "FV-1001", tipo: "Factura de proveedor", tercero: "Formadores del Caribe (demo)", nit: "900000001", rubro: "R04", total: 10115000, iva: 0, periodo: "2026-10", fecha: "2026-10-24", descripcion: "Jornada de formación en prácticas de confección.", estado: "validado", registro: "Laura Jiménez", soporte: "Factura FV-1001" },
        { id: "FV-2040", tipo: "Factura de proveedor", tercero: "Dotaciones del Caribe S.A.S. (demo)", nit: "900000002", rubro: "R08", total: 11250000, iva: 0, periodo: "2026-10", fecha: "2026-11-02", descripcion: "Anticipo de dotación de máquinas y herramientas.", estado: "por_validar", registro: "Laura Jiménez", soporte: "Factura FV-2040" },
        { id: "FV-3002", tipo: "Factura de proveedor", tercero: "Logística Sinú S.A.S. (demo)", nit: "900000003", rubro: "R06", total: 450000, iva: 0, periodo: "2026-11", fecha: "2026-11-02", descripcion: "Transporte de participantes a la jornada.", estado: "por_validar", registro: "Laura Jiménez", soporte: "Factura FV-3002" },
        { id: "FV-4007", tipo: "Factura de proveedor", tercero: "Papelería y Suministros del Sinú (demo)", nit: "900000004", rubro: "R11", total: 450000, iva: 0, periodo: "2026-11", fecha: "2026-11-02", descripcion: "Material de oficina para las jornadas, por encima del rubro.", estado: "por_validar", registro: "Laura Jiménez", soporte: "Factura FV-4007" },
      ],
      documentos: [
        { id: "d1", nombre: "Acta de acompañamiento 2", origen: "entregable", ref: "1.3-E1", actividad: "1.3", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d2", nombre: "Acta de acompañamiento 1", origen: "entregable", ref: "1.3-E1", actividad: "1.3", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d3", nombre: "Informe de la formación", origen: "entregable", ref: "1.2-E1", actividad: "1.2", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d4", nombre: "Memoria de la jornada", origen: "entregable", ref: "1.1-E2", actividad: "1.1", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d5", nombre: "Informe de caracterización", origen: "entregable", ref: "1.1-E1", actividad: "1.1", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d6", nombre: "Factura FV-4007", origen: "gasto", ref: "FV-4007", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d7", nombre: "Factura FV-3002", origen: "gasto", ref: "FV-3002", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d8", nombre: "Factura FV-2040", origen: "gasto", ref: "FV-2040", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d9", nombre: "Factura FV-1001", origen: "gasto", ref: "FV-1001", quien: "Laura Jiménez", fecha: "2026-11-02" },
        { id: "d10", nombre: "Cuenta de cobro CC-0001", origen: "gasto", ref: "CC-0001", quien: "Laura Jiménez", fecha: "2026-11-02" },
      ],
      // Newest first. tipo: avance | anulacion | gasto | validacion | rechazo | modificacion | documento | plan
      registro: [
        { id: "a1", cuando: "2026-11-05T21:50", quien: "Laura Jiménez", tipo: "avance", actividad: "1.3", pct: 50, fecha: "2026-11-05", texto: "Se realizaron las visitas técnicas a las unidades." },
        { id: "a2", cuando: "2026-11-05T21:31", quien: "Laura Jiménez", tipo: "avance", actividad: "1.1", pct: 90, fecha: "2026-10-11", texto: "Caracterización ejecutada en las unidades; pendiente cargar el informe y la memoria." },
        { id: "a3", cuando: "2026-11-05T21:31", quien: "Laura Jiménez", tipo: "anulacion", actividad: "1.1", pct: 30, fecha: "2026-11-02", texto: "Reporte de prueba anterior; se reemplaza por el avance real al cierre de la actividad." },
        { id: "a4", cuando: "2026-11-05T19:53", quien: "Laura Jiménez", tipo: "anulacion", pct: 30, fecha: "2026-11-04", texto: "Reporte de prueba de la verificación AJ-01." },
        { id: "a5", cuando: "2026-11-05T19:52", quien: "Laura Jiménez", tipo: "avance", pct: 30, fecha: "2026-11-05", texto: "Prueba de verificación AJ-01: se registra como integrante no responsable." },
        { id: "a6", cuando: "2026-11-03T12:30", quien: "Mateo Salazar", tipo: "avance", pct: 30, fecha: "2026-11-03", texto: "Avance del proyecto." },
        { id: "a7", cuando: "2026-11-02T10:10", quien: "Laura Jiménez", tipo: "gasto", gasto: "FV-4007", texto: "Papelería y Suministros del Sinú · Material de oficina para las jornadas · Octubre 2026 · Sin IVA · 1 soporte." },
      ],
      registroOcultos: 9,
      versiones: [{ numero: 0, nombre: "Versión original", tipo: "Línea base", vigente: true, aprobo: "Camila Restrepo", fecha: "2026-11-02" }],
      solicitudes: [],
    };
  };
})();
