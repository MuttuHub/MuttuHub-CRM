/* Resumen tab (key figures, «Qué falta», Datos del proyecto, Equipo) and the Novedades page.
   Everything is derived live from MH.data, so rows disappear when other tabs resolve them. */
(function () {
  const MH = (window.MH = window.MH || {});
  MH.pages = MH.pages || {};
  MH.actions = MH.actions || {};

  const SEMAFORO = {
    rojo: { kind: "destructivo", largo: "Rojo · en riesgo", corto: "Rojo" },
    amarillo: { kind: "alerta", largo: "Amarillo · atención", corto: "Amarillo" },
    verde: { kind: "exito", largo: "Verde · al día", corto: "Verde" },
  };
  const num1 = (n) => n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function semaforo(color) {
    const s = SEMAFORO[color] || SEMAFORO.amarillo;
    return `<span class="pill pill--${s.kind} res-sem"><i aria-hidden="true"></i><span class="res-largo">${s.largo}</span><span class="res-corto">${s.corto}</span></span>`;
  }

  /* ---------- derived numbers ---------- */
  function cifras() {
    const d = MH.data, p = d.proyecto;
    const ejecutado = d.gastos.filter((g) => g.estado === "validado").reduce((s, g) => s + g.total, 0);
    const pctGasto = d.finanzas.programadoHoy ? (ejecutado / d.finanzas.programadoHoy) * 100 : 0;
    const desvio = p.avanceProgramado - p.avanceReal;
    return { p, ejecutado, pctGasto, desvio, posibleRetraso: desvio >= 10 && pctGasto < 50 };
  }

  /* «Qué falta» rows, computed from the current data. */
  function pendientes() {
    const d = MH.data, filas = [];
    d.actividades
      .filter((a) => a.fin < d.hoy && a.avance < 100 && !String(a.estado).startsWith("finalizada"))
      .forEach((a) => filas.push({ tipo: "vencida", a }));
    d.gastos
      .filter((g) => g.estado === "por_validar")
      .forEach((g) => {
        const r = d.rubros.find((x) => x.codigo === g.rubro);
        if (r && r.ejecutado + g.total > r.asignado) filas.push({ tipo: "gasto", g, r });
      });
    d.actividades.forEach((a) => (a.reportes || [])
      .filter((r) => !r.anulado && !r.soporte)
      .forEach((r) => filas.push({ tipo: "soporte", a, r })));
    const bajos = d.indicadores.filter((i) => i.valor < i.meta);
    if (bajos.length) filas.push({ tipo: "indicadores", bajos });
    return filas;
  }

  function fila(f) {
    let pill, titulo, texto, boton;
    const btn = (attrs, label) => `<button type="button" class="btn btn--sm res-row-btn" ${attrs}>${label}</button>`;
    if (f.tipo === "vencida") {
      pill = MH.pill("Actividad vencida", "destructivo");
      titulo = `<b class="res-row-title">${MH.esc(f.a.codigo)} ${MH.esc(f.a.nombre)}</b>`;
      texto = `Venció el ${MH.fecha(f.a.fin)} sin llegar a su meta. Le toca a ${MH.esc(f.a.responsable)}, responsable.`;
      boton = MH.can("registrarAvance")
        ? btn(`data-act="registrar-avance" data-actividad="${f.a.codigo}"`, `Registrar avance de ${f.a.codigo}`)
        : btn(`data-act="res-ir" data-destino="actividades" data-focus="act-${f.a.codigo}"`, "Ver actividad");
    } else if (f.tipo === "gasto") {
      pill = MH.pill("Gasto por revisar", "alerta");
      titulo = `<b class="res-row-title">${MH.money(f.g.total)} · ${MH.esc(f.g.tercero)}</b>`;
      const puede = MH.can("validarGasto") && MH.persona() !== f.g.registro;
      const quien = MH.can("validarGasto") && !puede ? "Lo registraste tú: debe validarlo otra persona de Gerencia." : "Le toca a Gerencia validarlo o rechazarlo.";
      texto = `Supera lo asignado al rubro ${f.r.codigo} · ${MH.esc(f.r.nombre)}. ${quien}`;
      boton = puede
        ? btn(`data-act="revisar-gasto" data-gasto="${f.g.id}"`, "Revisar gasto")
        : btn(`data-act="res-ir" data-destino="finanzas" data-focus="gasto-${f.g.id}"`, "Ver gasto");
    } else if (f.tipo === "soporte") {
      pill = MH.pill("Avance sin soporte", "info");
      titulo = `<b class="res-row-title">Avance del ${MH.fecha(f.r.fecha)} · ${MH.esc(f.a.codigo)} ${MH.esc(f.a.nombre)}</b>`;
      texto = "Registrado sin soporte adjunto. Adjunta el archivo o el enlace que lo respalda.";
      boton = MH.can("adjuntarSoporte")
        ? btn(`data-act="adjuntar-soporte" data-actividad="${f.a.codigo}" data-reporte="${f.r.id}"`, "Adjuntar soporte")
        : btn(`data-act="res-ir" data-destino="actividades" data-focus="act-${f.a.codigo}"`, "Ver avance");
    } else {
      const n = f.bajos.length;
      pill = MH.pill(n === 1 ? "1 indicador bajo la meta" : `${n} indicadores bajo la meta`, "alerta");
      titulo = f.bajos.map((i) => `<span class="res-row-ind"><b>${MH.esc(i.nombre)}:</b> ${i.valor} de ${i.meta}</span>`).join("");
      texto = "";
      boton = btn(`data-act="res-ir" data-destino="actividades" data-focus="act-indicadores"`, "Ver indicadores");
    }
    return `<li class="res-row"><div class="res-row-body">${pill}${titulo}${texto ? `<span class="res-row-text">${texto}</span>` : ""}</div>${boton}</li>`;
  }

  /* ---------- render ---------- */
  function render(el) {
    const c = cifras(), p = c.p, d = MH.data;
    const filas = pendientes();
    const corte = MH.fechaCorta(d.hoy);
    const desvioTxt = c.desvio >= 0
      ? `Va ${num1(c.desvio)} puntos por debajo de lo programado al ${corte}.`
      : `Va ${num1(-c.desvio)} puntos por encima de lo programado al ${corte}.`;
    const gestor = MH.can("editarDatos");

    el.innerHTML = `<div class="res-panel">
      <div class="res-kpis">
        <section class="card res-kpi" aria-label="Avance técnico">
          <div class="res-kpi-head"><span class="res-kpi-name">Avance técnico</span>
            <span class="res-kpi-tag">${semaforo(p.semaforoTecnico)}${MH.info("Avance técnico", "Compara el avance real de las actividades con el que deberían llevar a la fecha de corte. Gerencia aún no confirma los límites de cada color.")}</span></div>
          <div class="res-kpi-fig"><span class="res-big">${MH.pct(p.avanceReal)}</span>
            <span class="res-kpi-of"><span class="res-largo">real </span>de <b>${MH.pct(p.avanceProgramado)}</b> programado</span>
            ${MH.info("Avance programado", "Lo que el cronograma esperaba a la fecha de corte, según la duración de cada actividad.")}</div>
          <div class="res-meter" role="img" aria-label="${MH.pct(p.avanceReal)} real; programado ${MH.pct(p.avanceProgramado)}">
            <i class="${(SEMAFORO[p.semaforoTecnico] || SEMAFORO.amarillo).kind}" style="width:${Math.min(100, p.avanceReal)}%"></i>
            <b style="left:${Math.min(100, p.avanceProgramado)}%" title="Programado al corte"></b></div>
          <span class="res-kpi-note res-largo-blk">${desvioTxt}</span>
          <button type="button" class="link res-kpi-link" data-act="res-ir" data-destino="actividades">Ver actividades</button>
        </section>
        <section class="card res-kpi" aria-label="Gasto">
          <div class="res-kpi-head"><span class="res-kpi-name">Gasto</span>
            <span class="res-kpi-tag">${semaforo(p.semaforoFinanciero)}</span></div>
          <div class="res-kpi-fig"><span class="res-big">${MH.pct(c.pctGasto)}</span>
            <span class="res-kpi-of">de lo programado<span class="res-largo"> a hoy</span></span>
            ${MH.info("% de lo programado", "Lo gastado frente a lo que el presupuesto planeaba gastar hasta hoy. No es el porcentaje del valor total.")}</div>
          <div class="res-meter" role="img" aria-label="${MH.pct(c.pctGasto)} de lo programado a hoy">
            <i class="${(SEMAFORO[p.semaforoFinanciero] || SEMAFORO.amarillo).kind}" style="width:${Math.min(100, c.pctGasto)}%"></i></div>
          ${c.posibleRetraso ? `<span class="res-kpi-note res-alerta"><span class="res-largo">Gasta poco mientras el avance técnico está atrasado: posible retraso.</span><span class="res-corto">Gasta poco y el avance está atrasado: posible retraso.</span></span>` : ""}
          <button type="button" class="link res-kpi-link" data-act="res-ir" data-destino="finanzas">Ver finanzas</button>
        </section>
        <section class="card res-kpi" aria-label="Tiempo">
          <div class="res-kpi-head"><span class="res-kpi-name">Tiempo</span>
            <span class="res-kpi-dates res-largo">${p.inicio ? MH.fecha(p.inicio) : "—"} → ${p.fin ? MH.fecha(p.fin) : "—"}</span></div>
          <div class="res-kpi-fig"><span class="res-big">Semana ${p.semana}</span><span class="res-kpi-of">de ${p.semanas}</span></div>
          <div class="res-meter" role="img" aria-label="Semana ${p.semana} de ${p.semanas}"><i class="res-neutral" style="width:${Math.round((p.semana / p.semanas) * 100)}%"></i></div>
          <span class="res-kpi-note res-largo-blk">Valor total ${MH.money(p.valorTotal)}${p.beneficiarios ? ` · ${p.beneficiarios} beneficiarios` : ""}</span>
        </section>
      </div>

      <div class="res-cols">
        <section class="res-falta" aria-labelledby="res-falta-h">
          <div class="res-h"><h2 id="res-falta-h" class="label">Qué falta · ${filas.length}</h2>
            ${MH.info("Qué falta", "Lo que necesita una acción ahora. Cada fila te lleva al lugar exacto donde se resuelve.")}</div>
          ${filas.length ? `<ul class="res-rows">${filas.map(fila).join("")}</ul>` : MH.empty("Nada pendiente por ahora.", "Cuando algo necesite una acción aparecerá aquí, con el botón que lo resuelve.")}
        </section>

        <aside class="res-aside">
          <section class="card res-datos" aria-labelledby="res-datos-h">
            <div class="res-h res-h--split"><h2 id="res-datos-h" class="label">Datos del proyecto</h2>
              ${gestor ? `<button type="button" class="link res-h-link" data-act="res-editar">Editar</button>` : ""}</div>
            <dl class="res-dl">
              ${[["Cliente", MH.esc(p.cliente)], ["Origen", MH.esc(p.origen)], ["Valor total", `<span class="res-num">${MH.money(p.valorTotal)}</span>`],
                ["Frente a la oportunidad", `<span class="res-num">${MH.money(p.frenteOportunidad)}</span>`], ["Líneas", MH.esc(p.lineas)], ["Municipios", MH.esc(p.municipios)],
                ["Beneficiarios", p.beneficiarios ? String(p.beneficiarios) : "—"]]
                .map(([k, v]) => `<div><dt>${k}</dt><dd>${v || "—"}</dd></div>`).join("")}
            </dl>
          </section>
          <section class="card res-equipo" aria-labelledby="res-equipo-h">
            <div class="res-h res-h--split"><h2 id="res-equipo-h" class="label">Equipo · ${d.equipo.length}</h2>
              ${gestor ? `<button type="button" class="link res-h-link" data-act="res-agregar">Agregar integrante</button>` : ""}</div>
            <ul class="res-team">${d.equipo.map((m, i) => `<li>
                <span class="res-avatar" aria-hidden="true">${MH.iniciales(m.nombre)}</span>
                <span class="res-team-who"><b>${MH.esc(m.nombre)}</b><span>${MH.esc(m.rol)}</span></span>
                ${gestor && m.nombre !== p.responsable ? `<button type="button" class="icon-btn" data-act="res-quitar" data-i="${i}" aria-label="Quitar a ${MH.esc(m.nombre)}" title="Quitar a ${MH.esc(m.nombre)}">${MH.icon.cerrar}</button>` : ""}
              </li>`).join("")}</ul>
          </section>
        </aside>
      </div>
    </div>`;
  }

  MH.tabs.resumen = { render };

  /* ---------- actions ---------- */
  MH.actions["res-ir"] = (b) => MH.go(b.dataset.destino, b.dataset.focus ? { focus: b.dataset.focus } : {});

  MH.actions["res-editar"] = () => {
    if (!MH.can("editarDatos")) return MH.toast("Tu rol no puede editar los datos del proyecto.", "error");
    const p = MH.data.proyecto;
    const campo = (id, label, value, extra = "", hint = "") => `<label class="field" id="f-${id}"><span>${label}</span>
      <input id="${id}" value="${MH.esc(value)}" ${extra} aria-describedby="${id}-h">
      <small id="${id}-h" data-hint="${MH.esc(hint)}">${MH.esc(hint)}</small></label>`;
    MH.openSheet({
      title: "Editar datos generales",
      subtitle: "Cambia los datos descriptivos del proyecto. Fechas, presupuesto y actividades se cambian con una solicitud de modificación.",
      body: `<form class="res-form" id="res-form" novalidate>
        ${campo("res-cliente", "Cliente", p.cliente, "required")}
        ${campo("res-valor", "Valor total (COP)", String(p.valorTotal), 'inputmode="numeric" required', "Solo números, sin puntos. Se compara con el valor de la oportunidad.")}
        ${campo("res-lineas", "Líneas", p.lineas, "required", "Separa con comas; marca la principal con «(principal)».")}
        ${campo("res-municipios", "Municipios", p.municipios, "required")}
        ${campo("res-benef", "Beneficiarios", String(p.beneficiarios || ""), 'inputmode="numeric"', "Opcional. Número de personas que atiende el proyecto.")}
        <p class="res-form-note">¿Necesitas cambiar fechas, presupuesto o actividades? <button type="button" class="link" id="res-ir-mod">Solicitar modificación en Historial</button></p>
      </form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="res-form" class="btn btn--primary">Guardar cambios</button>`,
      onMount(el, close) {
        el.querySelector(".sheet-foot [data-close]").addEventListener("click", close);
        el.querySelector("#res-ir-mod").addEventListener("click", () => { close(); MH.go("historial"); });
        const setErr = (id, msg) => {
          const f = el.querySelector("#f-" + id), h = f.querySelector("small"), inp = f.querySelector("input");
          f.setAttribute("aria-invalid", msg ? "true" : "false"); inp.setAttribute("aria-invalid", msg ? "true" : "false");
          h.textContent = msg || h.dataset.hint; h.classList.toggle("err", !!msg);
        };
        el.querySelector("#res-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const v = (id) => el.querySelector("#" + id).value.trim();
          const errs = {
            "res-cliente": v("res-cliente") ? "" : "Escribe el nombre del cliente.",
            "res-valor": !v("res-valor") ? "Escribe el valor total." : !/^\d+$/.test(v("res-valor")) || +v("res-valor") <= 0 ? "Escribe un valor mayor que cero, solo con números." : "",
            "res-lineas": v("res-lineas") ? "" : "Escribe al menos una línea.",
            "res-municipios": v("res-municipios") ? "" : "Escribe al menos un municipio.",
            "res-benef": v("res-benef") && !/^\d+$/.test(v("res-benef")) ? "Escribe un número entero o deja el campo vacío." : "",
          };
          Object.entries(errs).forEach(([id, m]) => setErr(id, m));
          const primero = Object.keys(errs).find((k) => errs[k]);
          if (primero) { el.querySelector("#" + primero).focus(); return; }
          const oportunidad = p.valorTotal - p.frenteOportunidad;
          Object.assign(p, { cliente: v("res-cliente"), valorTotal: +v("res-valor"), lineas: v("res-lineas"), municipios: v("res-municipios"), beneficiarios: v("res-benef") ? +v("res-benef") : 0 });
          p.frenteOportunidad = p.valorTotal - oportunidad;
          close(); MH.render(); MH.toast("Datos del proyecto actualizados.");
        });
      },
    });
  };

  const CANDIDATOS = ["Sofía Ramírez", "Julián Pérez", "Valentina Gómez"]; // DEMO-ONLY people to add

  MH.actions["res-agregar"] = () => {
    if (!MH.can("editarDatos")) return MH.toast("Solo Gerencia agrega integrantes.", "error");
    const libres = CANDIDATOS.filter((n) => !MH.data.equipo.some((m) => m.nombre === n));
    if (!libres.length) return MH.toast("No quedan personas disponibles para agregar en este prototipo.", "info");
    MH.openSheet({
      title: "Agregar integrante",
      subtitle: "La persona podrá registrar avances, gastos y documentos de este proyecto.",
      body: `<form id="res-add" class="res-form" novalidate>
        <label class="field" id="f-res-persona"><span>Persona</span><select id="res-persona" aria-describedby="res-persona-h"><option value="">Elige una persona</option>${libres.map((n) => `<option>${n}</option>`).join("")}</select><small id="res-persona-h" class="err" hidden></small></label>
        <label class="field"><span>Rol en el proyecto</span><select id="res-rolp"><option>Colaborador</option><option>Coordinador</option></select></label>
      </form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="res-add" class="btn btn--primary">Agregar</button>`,
      onMount(el, close) {
        el.querySelector(".sheet-foot [data-close]").addEventListener("click", close);
        el.querySelector("#res-add").addEventListener("submit", (e) => {
          e.preventDefault();
          const n = el.querySelector("#res-persona").value, f = el.querySelector("#f-res-persona"), h = el.querySelector("#res-persona-h");
          if (!n) { f.setAttribute("aria-invalid", "true"); h.textContent = "Elige a la persona que vas a agregar."; h.hidden = false; el.querySelector("#res-persona").focus(); return; }
          MH.data.equipo.push({ nombre: n, rol: el.querySelector("#res-rolp").value });
          close(); MH.render(); MH.toast(`${n} ahora es integrante del equipo.`);
        });
      },
    });
  };

  MH.actions["res-quitar"] = (b) => {
    const m = MH.data.equipo[+b.dataset.i];
    if (!m) return;
    MH.confirm({
      title: `Quitar a ${MH.esc(m.nombre)}`,
      text: `${MH.esc(m.nombre)} dejará de ver el botón Registrar avance y no podrá registrar gastos ni documentos en este proyecto. Lo que ya registró se conserva.`,
      confirmLabel: "Quitar del equipo", danger: true,
      onConfirm() { MH.data.equipo = MH.data.equipo.filter((x) => x !== m); MH.render(); MH.toast(`${m.nombre} ya no es integrante del equipo.`); },
    });
  };

  /* ---------- Novedades page ---------- */
  const CAMBIOS = [
    ["Registrar avance", "solo la persona responsable de la actividad veía el botón.", "cualquier integrante del equipo lo registra, también desde la cabecera del proyecto."],
    ["Historial de avances", "mostraba un código en lugar de la persona.", "muestra el nombre de quien registró cada avance."],
    ["Actividades finalizadas", "seguían ofreciendo «Registrar avance».", "explican que ya no reciben avances y cómo corregir un error."],
    ["Finanzas", "«E/P 40,3 %» y barras sin color.", "«40,3 % de lo programado» y cada barra con el color de su semáforo."],
    ["Lista de gastos", "«IVA $ 0» y sin periodo.", "el periodo bajo la fecha y «Sin IVA» o el subtotal más IVA bajo el total."],
    ["Adjuntar archivos", "el botón del navegador decía «Choose File».", "«Elegir archivo» y el nombre del archivo elegido."],
    ["Contadores", "había que abrir cada sección para saber si tenía datos.", "«Gastos · 5», «Modificaciones · N» y «Versiones · N»."],
  ];
  const GUIA = [
    ["coordinacion", "Coordinación", "Mira «Qué falta» en el Resumen cada semana; cada fila abre la acción que lo resuelve."],
    ["gerencia", "Gerencia", "Valida los gastos desde Finanzas: el soporte y lo que queda del rubro se ven en el mismo panel."],
    ["colaborador", "Integrantes", "Registra avance y gastos con el botón de la cabecera; adjunta el soporte para que cuente."],
  ];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  MH.pages.novedades = function (el) {
    const rol = MH.state.role;
    el.innerHTML = `<div class="res-nov">
      <button type="button" class="link res-nov-back" data-act="res-volver">← Volver al proyecto</button>
      <header class="res-nov-head">
        <span class="label">Novedades · ${MH.fecha(MH.data.hoy)}</span>
        <h1>Qué cambió en Proyectos</h1>
        <p>Estos cambios responden a los ajustes AJ-01 a AJ-06 que pidió Coordinación. Ya están en la app.</p>
      </header>
      <ul class="res-nov-list">${CAMBIOS.map(([t, a, b]) => `<li class="res-nov-item">
        <b class="res-nov-t">${t}</b>
        <span class="res-nov-antes"><b class="res-largo">Antes:</b><b class="res-corto">Antes</b> <span class="res-largo">${a}</span><span class="res-corto">${cap(a)}</span></span>
        <span class="res-nov-ahora"><b class="res-largo">Ahora:</b><b class="res-corto">Ahora</b> <span class="res-largo">${b}</span><span class="res-corto">${cap(b)}</span></span>
      </li>`).join("")}</ul>
      <section class="res-guia" aria-labelledby="res-guia-h">
        <h2 id="res-guia-h" class="label">Tu guía rápida</h2>
        <div class="res-guia-grid">${GUIA.map(([k, t, x]) => `<article class="res-guia-card${k === rol ? " is-mine" : ""}"${k === rol ? ' aria-current="true"' : ""}>
          <div class="res-guia-top"><b>${t}</b>${k === rol ? MH.pill("Tu rol", "info") : ""}</div><span>${x}</span></article>`).join("")}</div>
        <p class="res-guia-note">La guía por rol es una propuesta: describe el flujo de los diseños, no el actual.</p>
      </section>
    </div>`;
  };

  MH.actions["res-volver"] = () => {
    MH.state.pagina = "ficha"; MH.state.tab = "resumen";
    MH.render();
    document.querySelector(".app-scroll")?.scrollTo({ top: 0 });
    document.querySelector('.tabs [data-tab="resumen"]')?.focus();
  };
})();
