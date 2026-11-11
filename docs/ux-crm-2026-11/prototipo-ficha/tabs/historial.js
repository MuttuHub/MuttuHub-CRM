/* Historial tab: Registro de cambios (sentences grouped by day), Solicitudes de modificación
   (request → approve/reject) and Versiones del plan (cards, read-only plan, comparator). */
(function () {
  const MH = (window.MH = window.MH || {});
  MH.tabs = MH.tabs || {};
  MH.actions = MH.actions || {};

  const SUBS = [["registro", "Registro de cambios", "Registro de cambios"], ["solicitudes", "Solicitudes de modificación", "Solicitudes"], ["versiones", "Versiones del plan", "Versiones"]];
  const FILTROS = [["todo", "Todo"], ["avances", "Avances"], ["gastos", "Gastos"], ["anulaciones", "Anulaciones"], ["plan", "Cambios del plan"]];
  const TIPOS_FILTRO = { avances: ["avance", "cantidad"], gastos: ["gasto", "validacion", "rechazo"], anulaciones: ["anulacion"], plan: ["modificacion", "plan"] };
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const TIPOS_MOD = [
    ["traslado", "Traslado entre rubros", "presupuesto"], ["adicion", "Adición de recursos", "presupuesto"], ["reduccion", "Reducción de recursos", "presupuesto"],
    ["reprogramacion", "Reprogramación de periodos", "presupuesto"], ["cronograma", "Cronograma", "cronograma"], ["entregables", "Entregables e indicadores", "entregables"],
  ];
  const tipoMod = (id) => TIPOS_MOD.find((t) => t[0] === id) || TIPOS_MOD[0];

  const ui = () => (MH.state.ui.historial = MH.state.ui.historial || { sub: "registro", filtro: "todo", persona: "", expandido: {}, desde: 0, hasta: null });
  const esc = (s) => MH.esc(s);
  const ahora = () => MH.ahora();
  const diaTitulo = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()]} ${MH.fecha(iso)}`; };
  const actividad = (cod) => MH.data.actividades.find((a) => a.codigo === cod);
  const gasto = (id) => MH.data.gastos.find((g) => g.id === id);
  const enEjecucion = () => MH.data.proyecto.estado === "En ejecución";
  const puedeSolicitar = () => MH.can("solicitarModificacion") && enEjecucion();

  /* ---------- Registro de cambios ---------- */

  /* Returns { pred, pill, extra, link } — pred is the sentence without the subject (lower-case start). */
  function frase(e) {
    const act = e.actividad ? ` en la actividad <b>${esc(e.actividad)}</b>` : "";
    const cita = (t) => (t ? `<q class="his-cita">${esc(t)}</q>` : "");
    const g = e.gasto && gasto(e.gasto);
    switch (e.tipo) {
      case "avance":
        return { pred: `registró <b>${e.pct ?? "—"} %</b>${act}${e.fecha ? `, con fecha ${MH.fechaCorta(e.fecha)}` : ""}.`, pill: MH.pill("Avance", "info"), extra: cita(e.texto) };
      case "cantidad":
        return { pred: `registró ${e.cantidad != null ? `<b>${esc(e.cantidad)}</b> ` : "una cantidad "}${e.entregable ? `del entregable ${esc(e.entregable)}` : ""}${act}.`, pill: MH.pill("Avance", "info"), extra: cita(e.texto) };
      case "anulacion":
        return {
          pred: `anuló el reporte de <b>${e.pct ?? "—"} %</b>${e.fecha ? ` del ${MH.fechaCorta(e.fecha)}` : ""}${e.actividad ? ` (actividad ${esc(e.actividad)})` : ""}.`, pill: MH.pill("Anulación", "destructivo"),
          extra: `<span class="his-nota">Motivo: <q class="his-cita">${esc(e.motivo || e.texto || "Sin motivo")}</q> Ya no cuenta para el avance. ${MH.info("Reporte anulado", "Un reporte anulado deja de contar para el avance, pero queda en el registro con su motivo.")}</span>`,
        };
      case "gasto": {
        const r = g && MH.data.rubros.find((x) => x.codigo === g.rubro);
        return { pred: `registró el gasto <b>${esc(e.gasto || "")}</b>${g ? ` por ${MH.money(g.total)}` : ""}${r ? ` en el rubro ${esc(r.nombre)} (${r.codigo})` : ""}.`, pill: MH.pill("Gasto", "muted"), extra: e.texto ? `<span class="his-nota">${esc(e.texto)}</span>` : "" };
      }
      case "validacion":
        return { pred: `validó el gasto <b>${esc(e.gasto || "")}</b>${g ? ` por ${MH.money(g.total)}` : ""}.`, pill: MH.pill("Validación", "exito"), extra: cita(e.texto) };
      case "rechazo":
        return { pred: `rechazó el gasto <b>${esc(e.gasto || "")}</b>${g ? ` por ${MH.money(g.total)}` : ""}.`, pill: MH.pill("Gasto rechazado", "destructivo"), extra: (e.motivo || e.texto) ? `<span class="his-nota">Motivo: <q class="his-cita">${esc(e.motivo || e.texto)}</q></span>` : "" };
      case "modificacion": {
        const t = e.tipoMod ? tipoMod(e.tipoMod)[1].toLowerCase() : "";
        if (e.accion === "solicitud") return { pred: `solicitó una modificación${t ? ` (${t})` : ""}.`, pill: MH.pill("Solicitud", "alerta"), extra: cita(e.texto), sub: "solicitudes" };
        if (e.accion === "aprobacion") return { pred: `aprobó la modificación${t ? ` (${t})` : ""} y nació la <b>Versión ${e.version}</b> del plan.`, pill: MH.pill("Cambio del plan", "exito"), extra: cita(e.texto), sub: "versiones" };
        if (e.accion === "rechazo") return { pred: `rechazó la solicitud de modificación${t ? ` (${t})` : ""}. El plan no cambia.`, pill: MH.pill("Solicitud rechazada", "destructivo"), extra: "", sub: "solicitudes" };
        return { pred: "registró un cambio del plan.", pill: MH.pill("Cambio del plan", "muted"), extra: cita(e.texto) };
      }
      case "plan":
        return { pred: esc(e.texto || "registró un cambio del plan."), pill: MH.pill("Cambio del plan", "muted"), extra: "" };
      case "documento":
        if (e.accion === "eliminar") return { pred: `eliminó el documento <b>${esc(e.texto || "")}</b> de la lista.`, pill: MH.pill("Documento", "muted"), extra: "" };
        return { pred: `subió el documento <b>${esc(e.texto || "")}</b>${act}.`, pill: MH.pill(e.cargaInicial ? "Carga inicial" : "Documento", "muted"), extra: "" };
      default:
        return { pred: e.texto ? esc(e.texto) : "registró un movimiento.", pill: MH.pill("Movimiento", "muted"), extra: "" };
    }
  }

  function enlaces(e, f) {
    const out = [];
    if (e.actividad && actividad(e.actividad)) out.push(`<button type="button" class="link" data-act="his-ir-actividad" data-actividad="${esc(e.actividad)}">Ver actividad ${esc(e.actividad)}</button>`);
    if (e.gasto && gasto(e.gasto)) out.push(`<button type="button" class="link" data-act="his-ir-gasto" data-gasto="${esc(e.gasto)}">Ver gasto</button>`);
    if (e.documento && MH.data.documentos.some((d) => d.id === e.documento)) out.push(`<button type="button" class="link" data-act="his-ir-doc" data-doc="${esc(e.documento)}">Ver documento</button>`);
    if (f.sub) out.push(`<button type="button" class="link" data-act="his-sub" data-sub="${f.sub}">${f.sub === "versiones" ? "Ver versiones" : "Ver solicitudes"}</button>`);
    return out.length ? `<div class="his-links">${out.join("")}</div>` : "";
  }

  function entrada(e, movil) {
    const f = frase(e);
    const quien = e.quien || "Usuario no disponible";
    const avatar = `<span class="his-avatar" aria-hidden="true">${esc(MH.iniciales(quien))}</span>`;
    const hora = `<time class="his-hora" datetime="${esc(e.cuando)}">${MH.hora(e.cuando)}</time>`;
    if (movil) {
      const pred = f.pred.charAt(0).toUpperCase() + f.pred.slice(1);
      return `<li class="his-entrada${e.cargaInicial ? " his-entrada--oculta" : ""}" id="reg-${esc(e.id)}" tabindex="-1">
        <div class="his-e-top">${avatar}<b class="his-quien">${esc(quien)}</b>${hora}</div>
        <p class="his-frase">${pred}</p><div class="his-pill">${f.pill}</div>${f.extra ? `<div class="his-extra">${f.extra}</div>` : ""}${enlaces(e, f)}</li>`;
    }
    return `<li class="his-entrada${e.cargaInicial ? " his-entrada--oculta" : ""}" id="reg-${esc(e.id)}" tabindex="-1">${hora}${avatar}
      <div class="his-cuerpo"><p class="his-frase"><b class="his-quien">${esc(quien)}</b> ${f.pred} ${f.pill}</p>${f.extra ? `<div class="his-extra">${f.extra}</div>` : ""}${enlaces(e, f)}</div></li>`;
  }

  /* Placeholder rows for the entries the API returns beyond the visible ones (MH.data.registroOcultos):
     the initial load of supports on the oldest day. Marked as «Carga inicial». */
  function ocultos() {
    const n = MH.data.registroOcultos || 0;
    if (!n || !MH.data.registro.length) return { dia: null, filas: [] };
    const dia = [...MH.data.registro].sort((a, b) => a.cuando.localeCompare(b.cuando))[0].cuando.slice(0, 10);
    const docs = MH.data.documentos.filter((d) => d.fecha === dia && !MH.data.registro.some((r) => r.gasto && r.gasto === d.ref));
    const filas = [];
    for (let i = 0; i < n; i++) {
      const d = docs[i];
      filas.push({ id: "ini-" + (i + 1), cuando: `${dia}T09:${String(59 - i).padStart(2, "0")}`, quien: d ? d.quien : "Laura Jiménez", tipo: "documento", cargaInicial: true, texto: d ? d.nombre : `Soporte ${i + 1} de la carga inicial`, actividad: d && d.actividad });
    }
    return { dia, filas };
  }

  function coincide(e, s) {
    if (s.persona && e.quien !== s.persona) return false;
    if (s.filtro === "todo") return true;
    return (TIPOS_FILTRO[s.filtro] || []).includes(e.tipo);
  }

  function vistaRegistro(s, movil) {
    const personas = [...new Set(MH.data.registro.map((e) => e.quien).filter(Boolean))].sort();
    if (s.persona && !personas.includes(s.persona)) personas.push(s.persona);
    const filtros = `<div class="his-filtros">
      <div class="his-mostrar"><span class="label" id="his-mostrar-l">Mostrar${movil ? "" : ":"}</span>
        <div class="chips" role="group" aria-labelledby="his-mostrar-l">${FILTROS.map(([id, l]) => `<button type="button" class="chip" aria-pressed="${s.filtro === id}" data-act="his-filtro" data-filtro="${id}">${l}</button>`).join("")}</div></div>
      <label class="his-persona"><span>Persona:</span><select id="his-persona" aria-label="Filtrar por persona"><option value="">todas</option>${personas.map((p) => `<option value="${esc(p)}"${p === s.persona ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></label></div>`;
    if (!MH.data.registro.length) return filtros + MH.empty("Sin movimientos registrados.", "Aquí aparecerá cada avance, gasto y cambio del plan.");
    const oc = ocultos();
    const lista = [...MH.data.registro].sort((a, b) => b.cuando.slice(0, 16).localeCompare(a.cuando.slice(0, 16)));
    const dias = [];
    for (const e of lista) { const k = e.cuando.slice(0, 10); let d = dias.find((x) => x.k === k); if (!d) dias.push((d = { k, items: [] })); d.items.push(e); }
    if (oc.dia && !dias.some((d) => d.k === oc.dia)) dias.push({ k: oc.dia, items: [] });
    const html = dias.map((d) => {
      const vis = d.items.filter((e) => coincide(e, s));
      const extra = d.k === oc.dia ? oc.filas.filter((e) => coincide(e, s)) : [];
      if (!vis.length && !extra.length) return "";
      const abierto = !!s.expandido[d.k];
      const mas = extra.length ? `<button type="button" class="link his-mas" data-act="his-expandir" data-dia="${d.k}" aria-expanded="${abierto}" aria-controls="his-dia-${d.k}">${abierto ? "Ver menos" : `Ver ${extra.length} cambio${extra.length === 1 ? "" : "s"} más de este día`}</button>` : "";
      const filas = vis.concat(abierto ? extra : []);
      return `<section class="his-dia" aria-labelledby="his-dh-${d.k}"><h3 class="his-dia-t" id="his-dh-${d.k}">${diaTitulo(d.k)}</h3>
        <div class="his-dia-card"><ol class="his-entradas" id="his-dia-${d.k}">${filas.map((e) => entrada(e, movil)).join("")}</ol>${mas}</div></section>`;
    }).join("");
    return filtros + (html || MH.empty("No hay movimientos con estos filtros.", "Prueba con otro tipo de movimiento u otra persona.", '<button type="button" class="btn btn--sm" data-act="his-quitar-filtros">Quitar filtros</button>'));
  }

  /* ---------- plan snapshots (used by versions and approvals) ---------- */
  function fotoPlan() {
    const p = MH.data.proyecto;
    return JSON.parse(JSON.stringify({
      inicio: p.inicio, fin: p.fin,
      actividades: MH.data.actividades.map((a) => ({ codigo: a.codigo, nombre: a.nombre, responsable: a.responsable, fin: a.fin, entregables: (a.entregables || []).map((e) => ({ codigo: e.codigo, nombre: e.nombre, meta: e.meta, unidad: e.unidad })) })),
      rubros: MH.data.rubros.map((r) => ({ codigo: r.codigo, nombre: r.nombre, asignado: r.asignado, programadoHoy: r.programadoHoy })),
      indicadores: MH.data.indicadores.map((i) => ({ codigo: i.codigo, nombre: i.nombre, meta: i.meta })),
    }));
  }
  const planDe = (v) => v.plan || fotoPlan();

  /* Fields a request can change: [grupo, key, label, kind, get, set] */
  function campos(grupo) {
    const D = MH.data;
    if (grupo === "presupuesto") return D.rubros.flatMap((r) => [
      { key: `rubro:${r.codigo}:asignado`, label: `${r.codigo} · ${r.nombre} — asignado`, kind: "money", get: () => r.asignado, set: (v) => (r.asignado = v), rubro: r, col: "asignado" },
      { key: `rubro:${r.codigo}:programadoHoy`, label: `${r.codigo} · ${r.nombre} — programado a hoy`, kind: "money", get: () => r.programadoHoy, set: (v) => (r.programadoHoy = v), rubro: r, col: "programado" },
    ]);
    if (grupo === "cronograma") return [
      { key: "proyecto:inicio", label: "Inicio del proyecto", kind: "date", get: () => D.proyecto.inicio, set: (v) => (D.proyecto.inicio = v) },
      { key: "proyecto:fin", label: "Fin del proyecto", kind: "date", get: () => D.proyecto.fin, set: (v) => (D.proyecto.fin = v) },
      ...D.actividades.map((a) => ({ key: `actividad:${a.codigo}:fin`, label: `Actividad ${a.codigo} · ${a.nombre} — fin`, kind: "date", get: () => a.fin, set: (v) => (a.fin = v) })),
    ];
    return [
      ...D.actividades.flatMap((a) => (a.entregables || []).map((e) => ({ key: `entregable:${e.codigo}:meta`, label: `${e.codigo} · ${e.nombre} — meta (${e.unidad})`, kind: "num", get: () => e.meta, set: (v) => (e.meta = v) }))),
      ...D.indicadores.map((i) => ({ key: `indicador:${i.codigo}:meta`, label: `${i.codigo} · ${i.nombre} — meta`, kind: "num", get: () => i.meta, set: (v) => (i.meta = v) })),
    ];
  }
  const fmt = (kind, v) => (kind === "money" ? MH.money(v) : kind === "date" ? MH.fecha(v) : String(v));

  /* ---------- Solicitudes ---------- */
  function tarjetaSolicitud(q, s) {
    const estado = { pendiente: MH.pill("Pendiente", "alerta"), aprobada: MH.pill("Aprobada", "exito"), rechazada: MH.pill("Rechazada", "destructivo") }[q.estado];
    const decision = q.estado === "aprobada" ? `<p class="his-decision">Aprobada por ${esc(q.decidio)} · ${MH.fecha(q.decidido)} · Versión ${q.version}</p>`
      : q.estado === "rechazada" ? `<p class="his-decision">Rechazada por ${esc(q.decidio)} · ${MH.fecha(q.decidido)} — <q class="his-cita">${esc(q.comentario)}</q></p>` : "";
    let acciones = "";
    if (q.estado === "pendiente" && MH.can("aprobarModificacion") && enEjecucion()) {
      acciones = s.rechazando === q.id
        ? `<div class="his-rechazo"><label class="field"><span>Comentario del rechazo</span><textarea id="his-rech-txt" rows="3" maxlength="1000" placeholder="Explica por qué no se aprueba"></textarea><small class="err" hidden></small></label>
            <div class="his-botones"><button type="button" class="btn" data-act="his-rechazar-cancelar">Cancelar</button><button type="button" class="btn btn--danger" id="his-rech-ok" data-act="his-rechazar-ok" data-sol="${q.id}" disabled>Confirmar rechazo</button></div></div>`
        : `<div class="his-botones"><button type="button" class="btn" data-act="his-rechazar" data-sol="${q.id}">Rechazar</button><button type="button" class="btn btn--primary" data-act="his-aprobar" data-sol="${q.id}">Aprobar</button></div>`;
    } else if (q.estado === "pendiente") acciones = `<p class="his-espera">Gerencia la revisa y la aprueba o la rechaza.</p>`;
    return `<article class="card his-sol" id="sol-${q.id}">
      <div class="his-sol-head">${estado}<b>${esc(tipoMod(q.tipo)[1])}</b><span class="mono">${q.id}</span></div>
      <p class="his-meta">Pedida por ${esc(q.quien || "Usuario no disponible")} · ${MH.fecha(q.cuando)}, ${MH.hora(q.cuando)}</p>
      <p class="his-motivo"><span class="label">Motivo</span><q class="his-cita">${esc(q.motivo)}</q></p>
      <ul class="his-cambios">${q.cambios.map((c) => `<li><span>${esc(c.label)}</span><span class="his-ad"><s aria-label="antes">${fmt(c.kind, c.antes)}</s> → <b>${fmt(c.kind, c.despues)}</b></span></li>`).join("")}</ul>
      ${decision}${acciones}</article>`;
  }

  function vistaSolicitudes(s) {
    const sol = MH.data.solicitudes || [];
    const boton = puedeSolicitar() ? `<button type="button" class="btn btn--primary" data-act="his-solicitar">Solicitar modificación</button>` : "";
    if (!sol.length) {
      const extra = MH.can("solicitarModificacion") && !enEjecucion() ? "<span>Solo se pueden solicitar modificaciones de un proyecto en ejecución.</span>" : "";
      return MH.empty("Aún no hay solicitudes de modificación", "Aquí aparecen los cambios de presupuesto, cronograma o entregables que pide el equipo.", extra + boton);
    }
    const pend = sol.filter((q) => q.estado === "pendiente").sort((a, b) => a.cuando.localeCompare(b.cuando));
    const dec = sol.filter((q) => q.estado !== "pendiente").sort((a, b) => b.decidido.localeCompare(a.decidido));
    return `<div class="his-sol-top"><p class="his-sub-intro">Pendientes primero; luego las decididas, la más reciente arriba.</p>${boton}</div>
      <div class="his-sol-lista">${pend.concat(dec).map((q) => tarjetaSolicitud(q, s)).join("")}</div>`;
  }

  function abrirSolicitar() {
    if (!MH.can("solicitarModificacion")) { MH.toast("No tienes permisos sobre este proyecto.", "error"); return; }
    if (!enEjecucion()) { MH.toast("Solo se pueden solicitar modificaciones de un proyecto en ejecución.", "error"); return; }
    MH.openSheet({
      title: "Solicitar modificación", size: "panel",
      subtitle: "Cambia solo lo necesario y explica el motivo. Gerencia la revisa y, si la aprueba, se crea una nueva versión del proyecto.",
      body: `<label class="field"><span>Tipo de modificación</span><select id="his-tipo">${TIPOS_MOD.map(([id, l]) => `<option value="${id}">${l}</option>`).join("")}</select></label>
        <div id="his-campos"></div>
        <label class="field"><span>Motivo</span><textarea id="his-motivo" rows="4" maxlength="1000" placeholder="Explica por qué se necesita el cambio"></textarea><small><span id="his-motivo-n">0</span> / 1000</small></label>
        <div class="his-errores" role="alert" hidden></div>`,
      footer: `<small class="his-ayuda" id="his-ayuda">Cambia al menos un valor y escribe el motivo para enviar.</small><button type="button" class="btn" id="his-cancelar">Cancelar</button><button type="button" class="btn btn--primary" id="his-enviar" disabled aria-describedby="his-ayuda">Enviar solicitud</button>`,
      onMount(el, close) {
        const tipoSel = el.querySelector("#his-tipo"), host = el.querySelector("#his-campos"), motivo = el.querySelector("#his-motivo");
        const errores = el.querySelector(".his-errores"), enviar = el.querySelector("#his-enviar");
        let lista = [];
        const pintar = () => {
          const t = tipoMod(tipoSel.value); lista = campos(t[2]);
          errores.hidden = true;
          if (t[2] === "presupuesto") {
            const rep = t[0] === "reprogramacion";
            host.innerHTML = `<div class="table-wrap"><table class="his-grilla"><caption class="his-sr">Presupuesto por rubro</caption><thead><tr><th>Rubro</th><th class="num">Asignado</th><th class="num">Programado a hoy</th></tr></thead><tbody>${MH.data.rubros.map((r) => `<tr><td>${r.codigo} · ${esc(r.nombre)}</td>
              <td class="num"><input type="number" min="0" step="10000" inputmode="numeric" data-key="rubro:${r.codigo}:asignado" value="${r.asignado}" aria-label="Asignado ${esc(r.nombre)}"${rep ? " readonly" : ""}></td>
              <td class="num"><input type="number" min="0" step="10000" inputmode="numeric" data-key="rubro:${r.codigo}:programadoHoy" value="${r.programadoHoy}" aria-label="Programado a hoy ${esc(r.nombre)}"${rep ? "" : " readonly"}></td></tr>`).join("")}</tbody></table></div>
              <small class="his-nota">${rep ? "En la reprogramación el asignado se muestra pero no se edita." : "Escribe el nuevo asignado de cada rubro que cambia."}</small>`;
          } else {
            host.innerHTML = `<div class="his-campos-lista">${lista.map((c) => `<label class="field his-campo"><span>${esc(c.label)}</span><input type="${c.kind === "date" ? "date" : "number"}" ${c.kind === "num" ? 'min="0" step="1"' : ""} data-key="${c.key}" value="${c.get()}"></label>`).join("")}</div>`;
          }
          revisar();
        };
        const cambios = () => [...host.querySelectorAll("input[data-key]")].map((i) => {
          const c = lista.find((x) => x.key === i.dataset.key); if (!c) return null;
          const v = c.kind === "date" ? i.value : Number(i.value);
          return i.value !== "" && v !== c.get() ? { key: c.key, label: c.label, kind: c.kind, antes: c.get(), despues: v } : null;
        }).filter(Boolean);
        const revisar = () => { el.querySelector("#his-motivo-n").textContent = motivo.value.length; enviar.disabled = !motivo.value.trim() || !cambios().length; el.querySelector("#his-ayuda").hidden = !enviar.disabled; };
        tipoSel.addEventListener("change", pintar);
        host.addEventListener("input", revisar);
        motivo.addEventListener("input", revisar);
        el.querySelector("#his-cancelar").addEventListener("click", close);
        enviar.addEventListener("click", () => {
          const cs = cambios(), t = tipoSel.value, errs = [];
          if (!cs.length) errs.push("La solicitud debe incluir al menos un cambio.");
          if (!motivo.value.trim()) errs.push("El motivo es obligatorio.");
          const delta = cs.filter((c) => c.key.endsWith(":asignado")).reduce((n, c) => n + c.despues - c.antes, 0);
          if (t === "traslado" && delta !== 0) errs.push(`En un traslado entre rubros el total asignado no cambia: hoy la diferencia es ${MH.money(delta)}.`);
          if (t === "adicion" && delta <= 0) errs.push("Una adición de recursos debe aumentar el total asignado.");
          if (t === "reduccion" && delta >= 0) errs.push("Una reducción de recursos debe disminuir el total asignado.");
          if (cs.some((c) => c.kind !== "date" && c.despues < 0)) errs.push("Los valores no pueden ser negativos.");
          if (t === "cronograma") {
            const v = (k) => (cs.find((c) => c.key === k) || {}).despues || lista.find((c) => c.key === k).get();
            if (v("proyecto:fin") < v("proyecto:inicio")) errs.push("El fin del proyecto no puede ser anterior a su inicio.");
          }
          if (errs.length) { errores.innerHTML = `<b>No se puede enviar:</b><ul>${errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`; errores.hidden = false; return; }
          const n = (MH.data.solicitudes || []).length + 1;
          const q = { id: "SM-" + String(n).padStart(3, "0"), tipo: t, quien: MH.persona(), cuando: ahora(), motivo: motivo.value.trim(), cambios: cs, estado: "pendiente" };
          (MH.data.solicitudes = MH.data.solicitudes || []).push(q);
          MH.data.registro.unshift({ id: "r" + Date.now(), cuando: q.cuando, quien: q.quien, tipo: "modificacion", accion: "solicitud", tipoMod: t, solicitud: q.id, texto: q.motivo });
          close();
          ui().sub = "solicitudes";
          MH.go("historial", { focus: "sol-" + q.id });
        });
        pintar();
      },
    });
  }

  function aprobar(id) {
    const q = MH.data.solicitudes.find((x) => x.id === id);
    if (!q || q.estado !== "pendiente") { MH.toast("La solicitud ya fue decidida.", "error"); return; }
    const vs = MH.data.versiones;
    const vig = vs.find((v) => v.vigente) || vs[vs.length - 1];
    if (!vig.plan) vig.plan = fotoPlan();
    const lista = campos(tipoMod(q.tipo)[2]);
    if (q.cambios.some((c) => { const f = lista.find((x) => x.key === c.key); return !f || f.get() !== c.antes; })) { MH.toast("La solicitud se basa en una versión anterior; vuelve a crearla.", "error"); return; }
    q.cambios.forEach((c) => lista.find((x) => x.key === c.key).set(c.despues));
    MH.data.proyecto.valorTotal = MH.data.proyecto.valorTotal + q.cambios.filter((c) => c.key.endsWith(":asignado")).reduce((n, c) => n + c.despues - c.antes, 0);
    const numero = Math.max(...vs.map((v) => v.numero)) + 1;
    vs.forEach((v) => (v.vigente = false));
    vs.push({ numero, nombre: `Versión ${numero}`, tipo: "Modificación", vigente: true, aprobo: MH.persona(), fecha: MH.data.hoy, motivo: q.motivo, solicitud: q.id, plan: fotoPlan() });
    Object.assign(q, { estado: "aprobada", decidio: MH.persona(), decidido: ahora(), version: numero });
    MH.data.registro.unshift({ id: "r" + Date.now(), cuando: q.decidido, quien: MH.persona(), tipo: "modificacion", accion: "aprobacion", tipoMod: q.tipo, solicitud: q.id, version: numero, texto: q.motivo });
    MH.render();
    MH.toast(`Solicitud aprobada. Nació la versión ${numero} del plan.`);
  }

  /* ---------- Versiones ---------- */
  function diferencias(a, b) {
    const grupos = { Proyecto: [], Presupuesto: [], Actividades: [], "Entregables e indicadores": [] };
    if (a.inicio !== b.inicio) grupos.Proyecto.push(["Inicio del proyecto", MH.fecha(a.inicio), MH.fecha(b.inicio)]);
    if (a.fin !== b.fin) grupos.Proyecto.push(["Fin del proyecto", MH.fecha(a.fin), MH.fecha(b.fin)]);
    b.rubros.forEach((r) => { const o = a.rubros.find((x) => x.codigo === r.codigo); if (!o) return;
      if (o.asignado !== r.asignado) grupos.Presupuesto.push([`${r.codigo} · ${r.nombre} — asignado`, MH.money(o.asignado), MH.money(r.asignado)]);
      if (o.programadoHoy !== r.programadoHoy) grupos.Presupuesto.push([`${r.codigo} · ${r.nombre} — programado a hoy`, MH.money(o.programadoHoy), MH.money(r.programadoHoy)]); });
    b.actividades.forEach((x) => { const o = a.actividades.find((y) => y.codigo === x.codigo); if (!o) return;
      if (o.fin !== x.fin) grupos.Actividades.push([`${x.codigo} · ${x.nombre} — fin`, MH.fecha(o.fin), MH.fecha(x.fin)]);
      x.entregables.forEach((e) => { const oe = o.entregables.find((z) => z.codigo === e.codigo); if (oe && oe.meta !== e.meta) grupos["Entregables e indicadores"].push([`${e.codigo} · ${e.nombre} — meta`, `${oe.meta} ${e.unidad}`, `${e.meta} ${e.unidad}`]); }); });
    b.indicadores.forEach((i) => { const o = a.indicadores.find((x) => x.codigo === i.codigo); if (o && o.meta !== i.meta) grupos["Entregables e indicadores"].push([`${i.codigo} · ${i.nombre} — meta`, String(o.meta), String(i.meta)]); });
    return Object.entries(grupos).filter(([, l]) => l.length);
  }

  const nombreV = (v) => (v.numero === 0 ? "Versión original" : `Versión ${v.numero}`) + (v.vigente ? " (vigente)" : "");

  function vistaVersiones(s) {
    const vs = [...MH.data.versiones].sort((a, b) => b.numero - a.numero);
    if (!vs.length) return MH.empty("La línea base aún no está aprobada.", "Cuando Gerencia apruebe la línea base, aquí verás la versión original del plan.");
    const cards = vs.map((v) => `<article class="card his-version" id="ver-${v.numero}">
      <div class="his-v-head"><h3>${v.numero === 0 ? "Versión original" : `Versión ${v.numero}`}</h3>${MH.pill(v.numero === 0 ? "Línea base" : "Modificación", v.numero === 0 ? "muted" : "info")}${v.vigente ? MH.pill("Vigente", "exito") : ""}</div>
      <p class="his-v-txt">${v.numero === 0 ? `Aprobada por ${esc(v.aprobo)} el ${MH.fecha(v.fecha)}. Es el plan contra el que se mide el avance programado.` : `Aprobada por ${esc(v.aprobo)} el ${MH.fecha(v.fecha)}${v.solicitud ? ` (solicitud ${esc(v.solicitud)})` : ""}. Motivo: <q class="his-cita">${esc(v.motivo || "")}</q>`}</p>
      <div class="his-botones his-botones--start"><button type="button" class="btn" data-act="his-ver-plan" data-version="${v.numero}">Ver el plan</button>
        ${v.numero !== 0 && vs.length >= 2 ? `<button type="button" class="btn" data-act="his-comparar" data-version="${v.numero}">Comparar con la original</button>` : ""}</div></article>`).join("");
    let comp;
    if (vs.length < 2) comp = `<p class="his-aviso">Cuando Gerencia apruebe una solicitud de modificación, aquí aparecerá la versión 1 y podrás compararla con la original.</p>`;
    else {
      const asc = [...vs].reverse();
      const hasta = s.hasta == null ? vs[0].numero : s.hasta;
      const A = MH.data.versiones.find((v) => v.numero === s.desde) || asc[0], B = MH.data.versiones.find((v) => v.numero === hasta) || vs[0];
      const difs = diferencias(planDe(A), planDe(B));
      const opts = (sel) => asc.map((v) => `<option value="${v.numero}"${v.numero === sel ? " selected" : ""}>${nombreV(v)}</option>`).join("");
      comp = `<section class="card his-comp" id="his-comparador" aria-labelledby="his-comp-t"><h3 id="his-comp-t">Comparar versiones</h3>
        <div class="his-comp-sel"><label class="field"><span>Desde</span><select id="his-desde">${opts(A.numero)}</select></label><label class="field"><span>Hasta</span><select id="his-hasta">${opts(B.numero)}</select></label></div>
        ${difs.length ? difs.map(([g, l]) => `<div class="his-dif"><span class="label">${g}</span><ul class="his-cambios">${l.map(([k, x, y]) => `<li><span>${esc(k)}</span><span class="his-ad"><s aria-label="antes">${esc(x)}</s> → <b>${esc(y)}</b></span></li>`).join("")}</ul></div>`).join("") : `<p class="his-aviso">Las dos versiones son iguales.</p>`}</section>`;
    }
    const pasos = `<section class="his-pasos" aria-labelledby="his-pasos-t"><h3 id="his-pasos-t">Cómo cambia el plan</h3><ol>
      <li><span class="his-n" aria-hidden="true">1</span><span>El equipo pide el cambio (presupuesto, cronograma o entregables) en <button type="button" class="link" data-act="his-sub" data-sub="solicitudes">«Solicitudes de modificación»</button>.</span></li>
      <li><span class="his-n" aria-hidden="true">2</span><span>Gerencia la aprueba o la rechaza, con su motivo.</span></li>
      <li><span class="his-n" aria-hidden="true">3</span><span>Si se aprueba, nace una versión nueva del plan; la original queda guardada.</span></li></ol></section>`;
    const sol = MH.data.solicitudes || [];
    const vacio = sol.length ? `<p class="his-aviso">Hay ${sol.length} solicitud${sol.length === 1 ? "" : "es"} de modificación. <button type="button" class="link" data-act="his-sub" data-sub="solicitudes">Ver solicitudes</button></p>`
      : MH.empty("Aún no hay solicitudes de modificación", "Aquí aparecen los cambios de presupuesto, cronograma o entregables que pide el equipo.", puedeSolicitar() ? '<button type="button" class="btn btn--primary" data-act="his-solicitar">Solicitar modificación</button>' : "");
    return `<h2 class="his-h2">Versiones del plan ${MH.info("Qué es una versión del plan", "El plan aprobado de actividades, cronograma y presupuesto. Cada modificación aprobada crea una versión nueva; la original queda guardada para comparar.")}</h2>
      <div class="his-versiones">${cards}</div>${comp}${pasos}${vacio}`;
  }

  function verPlan(numero) {
    const v = MH.data.versiones.find((x) => x.numero === numero); if (!v) return;
    const p = planDe(v);
    const total = p.rubros.reduce((n, r) => n + r.asignado, 0);
    MH.openSheet({
      title: `${v.numero === 0 ? "Versión original" : "Versión " + v.numero} · plan`, size: "panel",
      subtitle: `Solo lectura. Aprobada por ${esc(v.aprobo)} el ${MH.fecha(v.fecha)}${v.vigente ? " · vigente" : ""}.`,
      body: `<section class="his-plan"><h3 class="label">Cronograma</h3><p class="lead">Del ${MH.fecha(p.inicio)} al ${MH.fecha(p.fin)}.</p></section>
        <section class="his-plan"><h3 class="label">Actividades y entregables</h3><div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Responsable</th><th>Fin</th><th>Entregables (meta)</th></tr></thead><tbody>
          ${p.actividades.map((a) => `<tr><td><b>${a.codigo}</b> ${esc(a.nombre)}</td><td>${esc(a.responsable || "")}</td><td>${MH.fecha(a.fin)}</td><td>${a.entregables.map((e) => `${esc(e.nombre)}: ${e.meta} ${esc(e.unidad)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></section>
        <section class="his-plan"><h3 class="label">Presupuesto</h3><div class="table-wrap"><table><thead><tr><th>Rubro</th><th class="num">Asignado</th></tr></thead><tbody>
          ${p.rubros.map((r) => `<tr><td>${r.codigo} · ${esc(r.nombre)}</td><td class="num">${MH.money(r.asignado)}</td></tr>`).join("")}<tr><td><b>Total de los rubros</b></td><td class="num"><b>${MH.money(total)}</b></td></tr></tbody></table></div></section>
        <section class="his-plan"><h3 class="label">Indicadores</h3><ul class="his-cambios">${p.indicadores.map((i) => `<li><span>${i.codigo} · ${esc(i.nombre)}</span><b>Meta ${i.meta}</b></li>`).join("")}</ul></section>`,
      footer: `<button type="button" class="btn" data-close>Cerrar</button>`,
      onMount(el, close) { el.querySelector(".sheet-foot [data-close]").addEventListener("click", close); },
    });
  }

  /* ---------- render ---------- */
  MH.tabs.historial = {
    render(el) {
      const s = ui(), movil = MH.isMobile();
      const nSol = (MH.data.solicitudes || []).length, nVer = MH.data.versiones.length;
      const subs = SUBS.map(([id, largo, corto]) => {
        const n = id === "solicitudes" ? ` · ${nSol}` : id === "versiones" ? ` · ${nVer}` : "";
        return `<button type="button" role="tab" id="his-tab-${id}" aria-controls="his-panel" aria-selected="${s.sub === id}" tabindex="${s.sub === id ? 0 : -1}" data-act="his-sub" data-sub="${id}">${movil ? corto : largo}${n}</button>`;
      }).join("");
      const cuerpo = s.sub === "solicitudes" ? vistaSolicitudes(s) : s.sub === "versiones" ? vistaVersiones(s) : vistaRegistro(s, movil);
      el.innerHTML = `<div class="his"><div class="subtabs his-subtabs" role="tablist" aria-label="Secciones del historial">${subs}</div>
        <div class="his-panel his-panel--${s.sub}" id="his-panel" role="tabpanel" aria-labelledby="his-tab-${s.sub}">${cuerpo}</div></div>`;
      el.querySelector(".his-subtabs").addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const i = SUBS.findIndex(([id]) => id === s.sub) + (e.key === "ArrowRight" ? 1 : -1);
        s.sub = SUBS[(i + SUBS.length) % SUBS.length][0]; MH.render();
        document.getElementById("his-tab-" + s.sub)?.focus();
      });
      el.querySelector("#his-persona")?.addEventListener("change", (e) => { s.persona = e.target.value; MH.render(); document.getElementById("his-persona")?.focus(); });
      const rt = el.querySelector("#his-rech-txt");
      if (rt) { rt.addEventListener("input", () => { el.querySelector("#his-rech-ok").disabled = !rt.value.trim(); }); rt.focus(); }
      el.querySelector("#his-desde")?.addEventListener("change", (e) => { s.desde = Number(e.target.value); MH.render(); document.getElementById("his-desde")?.focus(); });
      el.querySelector("#his-hasta")?.addEventListener("change", (e) => { s.hasta = Number(e.target.value); MH.render(); document.getElementById("his-hasta")?.focus(); });
      // Mobile bar: default «Registrar gasto / avance» (leave MH.state.mobileBar unset).
    },
  };

  Object.assign(MH.actions, {
    "his-sub": (b) => { const s = ui(); s.sub = b.dataset.sub; s.rechazando = null; if (MH.state.tab !== "historial") MH.go("historial"); else { MH.render(); document.getElementById("his-tab-" + s.sub)?.focus(); } },
    "his-filtro": (b) => { ui().filtro = b.dataset.filtro; MH.render(); document.querySelector(`[data-act=his-filtro][data-filtro="${b.dataset.filtro}"]`)?.focus(); },
    "his-quitar-filtros": () => { const s = ui(); s.filtro = "todo"; s.persona = ""; MH.render(); },
    "his-expandir": (b) => {
      const s = ui(), k = b.dataset.dia, abrir = !s.expandido[k];
      s.expandido[k] = abrir; MH.render();
      if (abrir) document.querySelector(`#his-dia-${k} .his-entrada--oculta`)?.focus();
      else document.querySelector(`[data-act=his-expandir][data-dia="${k}"]`)?.focus();
    },
    "his-ir-actividad": (b) => MH.go("actividades", { focus: "act-" + b.dataset.actividad }),
    "his-ir-gasto": (b) => MH.go("finanzas", { focus: "gasto-" + b.dataset.gasto }),
    "his-ir-doc": (b) => MH.go("documentos", { focus: "doc-" + b.dataset.doc }),
    "his-solicitar": () => abrirSolicitar(),
    "his-aprobar": (b) => aprobar(b.dataset.sol),
    "his-rechazar": (b) => { ui().rechazando = b.dataset.sol; MH.render(); },
    "his-rechazar-cancelar": () => { const s = ui(), id = s.rechazando; s.rechazando = null; MH.render(); document.querySelector(`[data-act=his-rechazar][data-sol="${id}"]`)?.focus(); },
    "his-rechazar-ok": (b) => {
      const t = document.getElementById("his-rech-txt"), v = t ? t.value.trim() : "";
      if (!v) { const e = t.parentElement.querySelector(".err"); e.textContent = "El comentario es obligatorio al rechazar."; e.hidden = false; return; }
      const q = MH.data.solicitudes.find((x) => x.id === b.dataset.sol);
      if (!q || q.estado !== "pendiente") { MH.toast("La solicitud ya fue decidida.", "error"); return; }
      Object.assign(q, { estado: "rechazada", decidio: MH.persona(), decidido: ahora(), comentario: v });
      MH.data.registro.unshift({ id: "r" + Date.now(), cuando: q.decidido, quien: MH.persona(), tipo: "modificacion", accion: "rechazo", tipoMod: q.tipo, solicitud: q.id });
      ui().rechazando = null; MH.render(); MH.toast("Solicitud rechazada. El plan no cambia.", "info");
    },
    "his-ver-plan": (b) => verPlan(Number(b.dataset.version)),
    "his-comparar": (b) => { const s = ui(); s.desde = 0; s.hasta = Number(b.dataset.version); MH.go("historial", { focus: "his-comparador" }); },
  });
})();
