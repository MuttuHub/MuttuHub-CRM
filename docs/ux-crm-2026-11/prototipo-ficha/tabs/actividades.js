/* Actividades tab: Lista / Cronograma / Tablero, activity cards, entregables, historial de avances,
   indicadores, and the global "registrar-avance" / "adjuntar-soporte" actions. */
(function () {
  const MH = (window.MH = window.MH || {});
  MH.tabs = MH.tabs || {};
  MH.actions = MH.actions || {};

  const FORMATOS = /\.(pdf|docx|xlsx|pptx|jpe?g|png)$/i;
  const MSG_FORMATO = "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";
  const MSG_URL = "El enlace debe ser una URL https válida (máximo 2000 caracteres).";
  const AYUDA_TOPE = (t) => `Una actividad llega como máximo al ${t} % con avances; el ${100 - t} % restante se completa cuando se cuentan sus entregables.`;
  const AYUDA_PROG = "Real es lo registrado; programado es lo que debería llevar a hoy según el cronograma.";
  const AYUDA_ENT = "Un entregable cuenta para la meta cuando tiene su soporte adjunto.";
  const SOLO_CONSULTA = "Estás viendo este proyecto en modo consulta: no formas parte de su equipo. Para registrar avances o gastos, pide que te agreguen al equipo del proyecto.";
  const FINALIZADA_TXT = "Ya no recibe avances. Para corregir, anula el último avance o solicita una modificación.";
  /* DEMO-ONLY: activity durations the seed does not give (needed to draw the Cronograma). */
  const DURACION_DEMO = { "1.1": 7, "1.2": 14 };

  /* ---------- derived values ---------- */
  const ui = () => (MH.state.ui.actividades = MH.state.ui.actividades || { vista: "lista", filtro: "porhacer", abiertas: {}, entAbiertos: {} });
  const acts = () => MH.data.actividades;
  const act = (c) => acts().find((a) => a.codigo === c);
  const finalizada = (a) => a.estado === "finalizada" || a.estado === "finalizada_retraso";
  const tope = () => MH.data.proyecto.topeAvance || 90;
  const entCompletos = (a) => a.entregables.filter((e) => e.contado >= e.meta).length;
  const topeDe = (a) => (a.entregables.length && entCompletos(a) === a.entregables.length ? 100 : tope());
  /* Order: by fecha; same fecha → most recently registered. Reports created in this visit carry seq (always newer). */
  let seq = 0;
  const clave = (r) => r.fecha + "|" + (r.seq ? "z" + String(r.seq).padStart(6, "0") : r.registrado);
  const porReciente = (x, y) => clave(y).localeCompare(clave(x));
  const vigentes = (a) => a.reportes.filter((r) => !r.anulado).sort(porReciente);
  const ultimoVigente = (a) => vigentes(a)[0];
  const aceptaAvances = (a) => !finalizada(a);
  const semaforo = (a) => {
    if (finalizada(a)) return null;
    const ratio = a.programado > 0 ? a.avance / a.programado : 1;
    return ratio >= 0.95 ? "verde" : ratio >= 0.8 ? "amarillo" : "rojo";
  };
  const SEM = { verde: ["Verde", "exito"], amarillo: ["Amarillo", "alerta"], rojo: ["Rojo", "destructivo"] };
  const ahora = () => MH.ahora();
  const nid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const sumaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const duracion = (a) => a.duracionDias || DURACION_DEMO[a.codigo] || 7;
  const inicioAct = (a) => sumaDias(a.fin, -(duracion(a) - 1));
  const grupoFiltro = (a) => (finalizada(a) ? "finalizadas" : "porhacer");
  const num = (n) => Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 });
  const archivosDe = (ref) => MH.data.documentos.filter((d) => d.ref === ref);

  /* Re-derive estado after the avance changes (save or anulación). */
  function recalcular(a, fechaUltimo) {
    const u = ultimoVigente(a);
    a.avance = u ? u.pct : 0;
    if (a.avance >= 100) a.estado = (fechaUltimo || (u && u.fecha) || MH.data.hoy) > a.fin ? "finalizada_retraso" : "finalizada";
    else a.estado = a.fin < MH.data.hoy ? "vencida" : a.diaActual || a.programado > 0 ? "en_curso" : "no_iniciada";
  }

  function registro(e) { MH.data.registro.unshift(Object.assign({ id: nid("reg-"), cuando: ahora(), quien: MH.persona() }, e)); }

  /* ---------- pieces ---------- */
  function estadoHtml(a) {
    if (a.estado === "finalizada") return MH.pill("Finalizada", "exito");
    if (a.estado === "finalizada_retraso") return MH.pill("Finalizada con retraso", "alerta");
    if (a.estado === "vencida") return MH.pill("Vencida el " + MH.fechaCorta(a.fin), "destructivo");
    if (a.estado === "en_curso") return `<span>En curso</span>`;
    return `<span>No iniciada</span>`;
  }
  function semHtml(a) {
    const s = semaforo(a); if (!s) return "";
    return `<span class="pill pill--${SEM[s][1]} act-sem"><i aria-hidden="true"></i>${SEM[s][0]}</span>`;
  }
  function plazoTxt(a) {
    const d = duracion(a);
    return a.estado === "en_curso" && a.diaActual ? `${d} días, día ${a.diaActual}` : `${d} días`;
  }

  function barra(a) {
    const s = semaforo(a) || "exito";
    const cls = { verde: "exito", amarillo: "alerta", rojo: "destructivo" }[s] || "exito";
    const usaTope = a.estado === "vencida" || finalizada(a); // Por definir con la PO: vencida/finalizada → tope; en curso → programado.
    const marca = usaTope ? topeDe(a) : a.programado;
    const txt = usaTope ? `<b>${num(a.avance)} %</b> registrado · tope ${topeDe(a)} %` : `<b>${num(a.avance)} %</b> registrado · debería ir en ${MH.pct(a.programado)}`;
    const ayuda = usaTope ? MH.info("Tope del avance", AYUDA_TOPE(tope())) : MH.info("Real y programado", AYUDA_PROG);
    return `<div class="act-progreso">
      <div class="act-barra" role="img" aria-label="${MH.esc(txt.replace(/<[^>]+>/g, ""))}"><i class="${cls}" style="width:${Math.min(a.avance, 100)}%"></i><span class="act-marca" style="left:${marca}%"></span></div>
      <span class="act-progreso-txt">${txt} ${ayuda}</span></div>`;
  }

  function entregablesHtml(a) {
    const puede = MH.can("registrarCantidad") && !finalizada(a);
    const titulo = `<div class="act-sec-head"><p class="label">Entregables · ${entCompletos(a)} de ${a.entregables.length} completos</p>${MH.info("Entregables", AYUDA_ENT)}</div>`;
    const falta = (e) => Math.max(e.meta - e.contado, 0);
    const extra = (e) => (e.contado > e.meta ? `<small class="act-sub">+${num(e.contado - e.meta)} sobre la meta</small>` : "");
    const pend = (e) => { const p = (e.cantidades || []).filter((c) => !c.anulado && !c.soporte).reduce((s, c) => s + c.cantidad, 0); return p ? `<small class="act-sub">${num(p)} pendientes de soporte</small>` : ""; };
    const archivos = (e) => { const n = archivosDe(e.codigo).length; return `<button type="button" class="link act-link" data-act="act-soportes" data-ent="${e.codigo}">${n} ${n === 1 ? "archivo" : "archivos"}</button>`; };
    const btn = (e) => (puede ? `<button type="button" class="btn btn--sm" data-act="act-cantidad" data-ent="${e.codigo}" aria-label="Registrar cantidad ${e.codigo}">Registrar cantidad</button>` : "");
    if (MH.isMobile()) {
      return `${titulo}<div class="act-ent-lista">${a.entregables.map((e) => `<div class="act-ent" id="ent-${e.codigo}">
        <div><span class="mono">${e.codigo}</span> <b>${MH.esc(e.nombre)}</b></div>
        <dl><div><dt>Meta</dt><dd>${num(e.meta)} ${MH.esc(e.unidad)}</dd></div><div><dt>Contado</dt><dd>${num(e.contado)}${extra(e)}${pend(e)}</dd></div><div><dt>Falta</dt><dd><b>${num(falta(e))}</b></dd></div></dl>
        <div class="act-ent-acc">${archivos(e)}${btn(e)}</div></div>`).join("")}</div>`;
    }
    return `${titulo}<div class="table-wrap"><table class="act-tabla"><thead><tr><th>Entregable</th><th class="num">Meta</th><th class="num">Contado</th><th class="num">Falta</th><th>Soportes</th><th><span class="sr">Acción</span></th></tr></thead><tbody>
      ${a.entregables.map((e) => `<tr id="ent-${e.codigo}"><td><span class="mono">${e.codigo}</span> ${MH.esc(e.nombre)}</td><td class="num">${num(e.meta)} ${MH.esc(e.unidad)}</td><td class="num">${num(e.contado)}${extra(e)}${pend(e)}</td><td class="num"><b>${num(falta(e))}</b></td><td>${archivos(e)}</td><td class="num">${btn(e)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function historialHtml(a) {
    if (!a.reportes.length) return "";
    const u = ultimoVigente(a);
    const orden = a.reportes.slice().sort(porReciente);
    const escribe = MH.can("anularAvance");
    return `<div class="act-hist"><p class="label">Historial de avances</p><ol>${orden.map((r) => {
      const acc = [];
      if (r.anulado) acc.push("Anulado");
      else {
        acc.push(r.soporte ? "Con soporte" : "Sin soporte");
        if (!r.soporte && MH.can("adjuntarSoporte")) acc.push(`<button type="button" class="link act-link" data-act="adjuntar-soporte" data-actividad="${a.codigo}" data-reporte="${r.id}">Adjuntar soporte</button>`);
        if (r === u && escribe) acc.push(`<button type="button" class="link act-link" data-act="act-anular" data-actividad="${a.codigo}" data-reporte="${r.id}" aria-label="Anular el avance de ${num(r.pct)} % de la ${a.codigo}">Anular</button>`);
      }
      return `<li class="act-hist-item${r.anulado ? " is-anulado" : ""}" id="reg-${r.id}"><span class="act-dot" aria-hidden="true"></span><div>
        <span class="act-hist-l1"><b>${num(r.pct)} %</b> · ${MH.esc(r.quien)}${r.anulado ? "" : " · " + MH.fecha(r.fecha)}${r.nuevo ? " " + MH.pill("Nuevo", "info") : ""}</span>
        ${r.obs && !r.anulado ? `<span class="act-hist-obs">${MH.esc(r.obs)}</span>` : ""}
        ${r.anulado && r.motivoAnulacion ? `<span class="act-hist-obs">Motivo: ${MH.esc(r.motivoAnulacion)}</span>` : ""}
        <span class="act-hist-l2">${acc.join(" · ")}</span></div></li>`;
    }).join("")}</ol></div>`;
  }

  function tarjeta(a) {
    const st = ui();
    const fin = finalizada(a);
    const puedeAvance = MH.can("registrarAvance") && aceptaAvances(a);
    // Por definir con la PO: finalizadas al 100 % se muestran compactas; las que cerraron por debajo, abiertas.
    const abierta = st.abiertas[a.codigo] ?? !(fin && a.avance >= 100);
    // Por definir con la PO: entregables desplegados si la actividad está vencida; plegados si está en curso.
    const entAbierto = st.entAbiertos[a.codigo] ?? a.estado === "vencida";
    const resp = `Responsable: ${MH.esc(a.responsable)} · ${plazoTxt(a)}`;
    if (fin && !abierta) {
      return `<article class="act-card act-card--compacta" id="act-${a.codigo}" tabindex="-1">
        <span class="mono">${a.codigo}</span><h3>${MH.esc(a.nombre)}</h3>${estadoHtml(a)}
        <button type="button" class="link act-link act-push" data-act="act-toggle" data-actividad="${a.codigo}" aria-expanded="false">Ver historial</button></article>`;
    }
    const btnAvance = puedeAvance ? `<button type="button" class="btn btn--primary act-btn-avance" data-act="registrar-avance" data-actividad="${a.codigo}" aria-label="Registrar avance ${a.codigo}">Registrar avance</button>` : "";
    const solicitar = fin && MH.can("solicitarModificacion") ? `<button type="button" class="link act-link act-solicitar" data-act="act-solicitar" data-actividad="${a.codigo}">Solicitar modificación</button>` : "";
    const finTxt = fin && (MH.can("registrarAvance")) ? `<span>${FINALIZADA_TXT}</span>` : "";
    const ents = a.entregables.length
      ? `<button type="button" class="link act-link act-ent-toggle" data-act="act-ent-toggle" data-actividad="${a.codigo}" aria-expanded="${entAbierto}" aria-controls="act-ents-${a.codigo}">${entAbierto ? "Ocultar entregables" : `Ver ${a.entregables.length} ${a.entregables.length === 1 ? "entregable" : "entregables"}`}</button>
         <div class="act-ents" id="act-ents-${a.codigo}"${entAbierto ? "" : " hidden"}>${entAbierto ? entregablesHtml(a) : ""}</div>` : "";
    return `<article class="act-card${fin ? " act-card--fin" : ""}" id="act-${a.codigo}" tabindex="-1">
      <div class="act-card-head">
        <div class="act-card-id">
          <div class="act-titulo"><span class="mono">${a.codigo}</span><h3>${MH.esc(a.nombre)}</h3></div>
          <div class="act-meta">${semHtml(a)}${estadoHtml(a)}${fin ? finTxt : `<span>${resp}</span>`}</div>
        </div>
        <div class="act-card-acc">${btnAvance}${solicitar}${fin ? `<button type="button" class="link act-link" data-act="act-toggle" data-actividad="${a.codigo}" aria-expanded="true">Ocultar historial</button>` : ""}</div>
      </div>
      ${fin ? "" : barra(a)}
      ${ents}
      ${historialHtml(a)}
      ${btnAvance ? `<div class="act-card-pie">${btnAvance}</div>` : ""}
      ${solicitar ? `<div class="act-card-pie">${solicitar.replace("link act-link act-solicitar", "btn act-solicitar")}</div>` : ""}
    </article>`;
  }

  function indicadoresHtml() {
    const puede = MH.can("registrarAvance");
    return `<section class="card act-ind" id="act-indicadores" tabindex="-1" aria-labelledby="act-ind-t">
      <div class="act-sec-head"><h2 id="act-ind-t">Indicadores</h2>${MH.info("Indicadores", "Miden el resultado del proyecto, no el avance de las actividades. Registra una medición cuando tengas el dato y su soporte.")}</div>
      <ul class="act-ind-lista">${MH.data.indicadores.map((i) => {
        const p = i.meta ? Math.min((i.valor / i.meta) * 100, 100) : 0;
        return `<li><div class="act-ind-txt"><span class="mono">${i.codigo}</span> <b>${MH.esc(i.nombre)}</b><span>${num(i.valor)} de ${num(i.meta)} · ${MH.pct(p)}${i.ultima ? ` · última medición ${MH.fecha(i.ultima)}` : ""}</span></div>
          <div class="bar act-ind-bar"><i class="${p >= 100 ? "exito" : "alerta"}" style="width:${p}%"></i></div>
          ${puede ? `<button type="button" class="btn btn--sm" data-act="act-medicion" data-ind="${i.codigo}" aria-label="Registrar medición ${i.codigo}">Registrar medición</button>` : ""}</li>`;
      }).join("")}</ul></section>`;
  }

  /* ---------- views ---------- */
  function vistaLista() {
    const st = ui();
    const c = { porhacer: acts().filter((a) => grupoFiltro(a) === "porhacer").length, finalizadas: acts().filter((a) => grupoFiltro(a) === "finalizadas").length };
    const chips = [["porhacer", "Por hacer", c.porhacer], ["finalizadas", "Finalizadas", c.finalizadas], ["todas", "Todas", acts().length]];
    const visibles = acts().filter((a) => st.filtro === "todas" || grupoFiltro(a) === st.filtro)
      .sort((x, y) => (st.filtro === "todas" ? grupoFiltro(y).localeCompare(grupoFiltro(x)) : 0)); // Por hacer primero
    const objetivos = MH.data.objetivos || [];
    let cuerpo = "";
    if (!acts().length) cuerpo = MH.empty("Sin actividades", "Este proyecto todavía no tiene actividades.");
    else if (!visibles.length) cuerpo = MH.empty(st.filtro === "finalizadas" ? "Aún no hay actividades finalizadas" : "No hay actividades por hacer", "Cambia el filtro a «Todas» para ver el resto.", `<button type="button" class="btn btn--sm" data-act="act-filtro" data-filtro="todas">Ver todas</button>`);
    else if (!objetivos.length) cuerpo = visibles.map(tarjeta).join("");
    else cuerpo = objetivos.map((o) => {
      const del = visibles.filter((a) => a.codigo.split(".")[0] === o.codigo);
      return del.length ? `<section class="act-obj"><p class="act-obj-t"><b>Objetivo ${o.codigo}.</b> ${MH.esc(o.texto)}</p>${del.map(tarjeta).join("")}</section>` : "";
    }).join("");
    return `<div class="act-barra-sup">
        <div class="act-chips" role="group" aria-label="Filtrar actividades"><span class="act-mostrar">Mostrar:</span>
        ${chips.map(([k, l, n]) => `<button type="button" class="chip" aria-pressed="${st.filtro === k}" data-act="act-filtro" data-filtro="${k}">${l} · ${n}</button>`).join("")}</div>
      </div>
      <div class="act-lista">${cuerpo}</div>
      ${indicadoresHtml()}`;
  }

  function vistaCronograma() {
    const p = MH.data.proyecto;
    const total = dias(p.inicio, p.fin) + 1;
    const pos = (iso) => (dias(p.inicio, iso) / total) * 100;
    const semanas = Math.ceil(total / 7);
    const hoyPos = pos(MH.data.hoy) + (100 / total) / 2;
    const cols = Array.from({ length: semanas }, (_, i) => `<span class="act-cr-sem${i + 1 === p.semana ? " is-hoy" : ""}">S${i + 1}<small>${MH.fechaCorta(sumaDias(p.inicio, i * 7))}</small></span>`).join("");
    const filas = acts().map((a) => {
      const ini = inicioAct(a); const izq = Math.max(pos(ini), 0); const fin = pos(a.fin) + 100 / total;
      const fuera = ini < p.inicio || a.fin > p.fin;
      const cls = finalizada(a) ? "exito" : { verde: "exito", amarillo: "alerta", rojo: "destructivo" }[semaforo(a)];
      return `<div class="act-cr-fila"><button type="button" class="act-cr-nom" data-act="act-ir" data-actividad="${a.codigo}"><span class="mono">${a.codigo}</span> ${MH.esc(a.nombre)}</button>
        <div class="act-cr-pista"><span class="act-cr-bar${fuera ? " is-fuera" : ""}" style="left:${izq}%;width:${Math.max(fin - izq, 1)}%" title="${MH.fechaCorta(ini)} – ${MH.fechaCorta(a.fin)} · ${num(a.avance)} %"><i class="${cls}" style="width:${Math.min(a.avance, 100)}%"></i></span>
        <span class="act-cr-hoy" style="left:${hoyPos}%" aria-hidden="true"></span><span class="act-cr-dato" style="left:${Math.min(izq, 70)}%">${MH.fechaCorta(ini)} – ${MH.fechaCorta(a.fin)} · ${num(a.avance)} %</span></div></div>`;
    }).join("");
    return `<section class="card act-cr" aria-label="Cronograma de actividades">
      <div class="act-sec-head"><h2>Cronograma</h2><span class="act-cr-ley"><span class="act-cr-hoyley" aria-hidden="true"></span>Hoy, ${MH.fecha(MH.data.hoy)} · semana ${p.semana} de ${p.semanas}</span>
      <span class="act-cr-ley"><span class="act-cr-fueraley" aria-hidden="true"></span>Fuera de la duración del proyecto</span></div>
      <p class="act-nota">Solo lectura. Toca una actividad para verla en la Lista. La barra rellena muestra el avance registrado.</p>
      <div class="act-cr-scroll"><div class="act-cr-grid">
        <div class="act-cr-fila act-cr-cab"><span class="act-cr-nom"></span><div class="act-cr-pista act-cr-sems" style="--n:${semanas}">${cols}<span class="act-cr-hoy" style="left:${hoyPos}%" aria-hidden="true"></span></div></div>
        <div class="act-cr-cuerpo">${filas}</div>
      </div></div></section>`;
  }

  function vistaTablero() {
    if (!acts().length) return MH.empty("Sin actividades", "Este proyecto todavía no tiene actividades.");
    const COL = [["no_iniciada", "Por iniciar"], ["en_curso", "En curso"], ["vencida", "Atrasada"], ["fin", "Terminada"]];
    const de = (k) => acts().filter((a) => (k === "fin" ? finalizada(a) : a.estado === k));
    return `<div class="act-tablero">${COL.map(([k, l]) => {
      const items = de(k);
      return `<section class="act-col" aria-label="${l}"><h2>${l} <span class="act-col-n">${items.length}</span></h2>
        ${items.length ? items.map((a) => `<button type="button" class="act-tcard" data-act="act-ir" data-actividad="${a.codigo}">
          <span class="act-titulo"><span class="mono">${a.codigo}</span><b>${MH.esc(a.nombre)}</b></span>
          <span class="act-meta">${semHtml(a)}${finalizada(a) ? estadoHtml(a) : ""}</span>
          <span class="bar"><i class="${finalizada(a) ? "exito" : { verde: "exito", amarillo: "alerta", rojo: "destructivo" }[semaforo(a)]}" style="width:${Math.min(a.avance, 100)}%"></i></span>
          <span class="act-sub">${num(a.avance)} % · ${MH.esc(a.responsable)}</span></button>`).join("") : `<p class="act-col-vacia">Sin actividades.</p>`}
      </section>`;
    }).join("")}</div>`;
  }

  /* ---------- render ---------- */
  MH.tabs.actividades = {
    render(el, ctx) {
      const st = ui();
      // Arrival via MH.go(…, {focus}): make the target visible once (Lista, matching filter, expanded).
      const nav = ctx.nav || {};
      if (nav.focus && !nav._actDone && /^(act|ent|reg)-/.test(nav.focus)) {
        nav._actDone = true;
        st.vista = "lista";
        let a = null;
        if (nav.focus.startsWith("act-") && nav.focus !== "act-indicadores") a = act(nav.focus.slice(4));
        if (nav.focus.startsWith("ent-")) { a = acts().find((x) => x.entregables.some((e) => "ent-" + e.codigo === nav.focus)); if (a) st.entAbiertos[a.codigo] = true; }
        if (nav.focus.startsWith("reg-")) a = acts().find((x) => x.reportes.some((r) => "reg-" + r.id === nav.focus));
        if (a) { if (st.filtro !== "todas" && grupoFiltro(a) !== st.filtro) st.filtro = "todas"; if (finalizada(a)) st.abiertas[a.codigo] = true; }
      }
      const aviso = MH.can("registrarAvance") ? "" : `<div class="act-aviso" role="note">${SOLO_CONSULTA}</div>`;
      const V = [["lista", "Lista"], ["cronograma", "Cronograma"], ["tablero", "Tablero"]];
      el.innerHTML = `${aviso}<div class="act-top">
          <div class="subtabs" role="tablist" aria-label="Vista de actividades">${V.map(([k, l]) => `<button type="button" role="tab" id="act-v-${k}" aria-selected="${st.vista === k}" tabindex="${st.vista === k ? 0 : -1}" data-act="act-vista" data-vista="${k}">${l}</button>`).join("")}</div>
        </div>
        <div class="act-vista" role="tabpanel" aria-labelledby="act-v-${st.vista}">${st.vista === "cronograma" ? vistaCronograma() : st.vista === "tablero" ? vistaTablero() : vistaLista()}</div>`;
      // Lista: move the chips into the top bar next to the subtabs (desktop: one row).
      const sup = el.querySelector(".act-barra-sup");
      if (sup) el.querySelector(".act-top").appendChild(sup.firstElementChild), sup.remove();
      el.querySelector(".subtabs").addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        const i = V.findIndex(([k]) => k === st.vista) + (e.key === "ArrowRight" ? 1 : -1);
        st.vista = V[(i + V.length) % V.length][0]; MH.render(); document.getElementById("act-v-" + st.vista)?.focus();
      });
      // In this tab the avance is registered per activity: the sticky bar keeps only «Registrar gasto».
      MH.state.mobileBar = MH.can("registrarGasto") ? `<button type="button" class="btn" data-act="registrar-gasto">Registrar gasto</button>` : "";
    },
  };

  /* ---------- tab-local actions ---------- */
  Object.assign(MH.actions, {
    "act-vista": (b) => { ui().vista = b.dataset.vista; MH.render(); document.getElementById("act-v-" + ui().vista)?.focus(); },
    "act-filtro": (b) => { ui().filtro = b.dataset.filtro; MH.render(); document.querySelector(`.act-chips [data-filtro="${b.dataset.filtro}"]`)?.focus(); },
    "act-toggle": (b) => { const c = b.dataset.actividad; const st = ui(); const a = act(c); const ab = st.abiertas[c] ?? !(finalizada(a) && a.avance >= 100); st.abiertas[c] = !ab; MH.render(); document.querySelector(`#act-${CSS.escape(c)} [data-act=act-toggle]`)?.focus(); },
    "act-ent-toggle": (b) => { const c = b.dataset.actividad; const st = ui(); st.entAbiertos[c] = b.getAttribute("aria-expanded") !== "true"; MH.render(); document.querySelector(`#act-${CSS.escape(c)} [data-act=act-ent-toggle]`)?.focus(); },
    "act-ir": (b) => MH.go("actividades", { focus: "act-" + b.dataset.actividad }),
    "act-solicitar": (b) => {
      const a = act(b.dataset.actividad);
      MH.openSheet({
        title: "Solicitar modificación",
        subtitle: `${a.codigo} · ${MH.esc(a.nombre)}`,
        body: `<p class="lead">La ${a.codigo} ya está finalizada y no recibe avances. Para cambiar su avance, sus fechas o sus entregables, pide una modificación del plan: gerencia la revisa y, si la aprueba, queda como una nueva versión.</p>
          <p class="lead">En la app, este enlace te lleva a <b>Historial › Modificaciones</b> con el formulario «Solicitar modificación» abierto.</p>`,
        footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn btn--primary" id="act-ir-hist">Ir a Historial</button>`,
        onMount(el, close) { el.querySelector("#act-ir-hist").addEventListener("click", () => { close(); MH.state.ui.historial = Object.assign(MH.state.ui.historial || { filtro: "todo", persona: "", expandido: {}, desde: 0, hasta: null }, { sub: "solicitudes" }); MH.go("historial"); }); },
      });
    },
    "act-anular": (b) => {
      const a = act(b.dataset.actividad); const r = a.reportes.find((x) => x.id === b.dataset.reporte);
      if (r.anulado) return MH.toast("El reporte ya está anulado.", "error");
      if (ultimoVigente(a) !== r) return MH.toast("Solo se puede anular el último reporte registrado de la actividad.", "error");
      const prev = vigentes(a)[1];
      MH.confirm({
        title: `Anular el avance de ${num(r.pct)} %`,
        text: `La ${a.codigo} vuelve a ${prev ? num(prev.pct) + " %" : "0 %"}${finalizada(a) ? " y vuelve a recibir avances" : ""}. El avance queda en el historial como «Anulado».`,
        confirmLabel: "Confirmar anulación", danger: true,
        field: { label: "Motivo de anulación", required: true, error: "El motivo no puede estar vacío." },
        onConfirm(motivo) {
          if (motivo.length > 500) return MH.toast("El motivo es demasiado largo.", "error");
          r.anulado = true; r.motivoAnulacion = motivo; r.nuevo = false;
          recalcular(a);
          registro({ tipo: "anulacion", actividad: a.codigo, pct: r.pct, fecha: r.fecha, texto: motivo, motivo });
          if (!finalizada(a)) ui().abiertas[a.codigo] = true;
          if (ui().filtro !== "todas" && grupoFiltro(a) !== ui().filtro) ui().filtro = "todas";
          MH.render();
          MH.toast(`Avance anulado: la ${a.codigo} queda en ${num(a.avance)} %.`);
          document.getElementById("act-" + a.codigo)?.focus();
        },
      });
    },
    "act-soportes": (b) => {
      const e = acts().flatMap((a) => a.entregables).find((x) => x.codigo === b.dataset.ent);
      const docs = archivosDe(e.codigo);
      const cant = (e.cantidades || []).slice().reverse();
      MH.openSheet({
        title: `Soportes de ${e.codigo}`, subtitle: MH.esc(e.nombre),
        body: `${docs.length ? `<ul class="act-docs">${docs.map((d) => `<li>${MH.icon.doc}<span><b>${MH.esc(d.nombre)}</b><small>${MH.esc(d.quien)} · ${MH.fecha(d.fecha)}</small></span><button type="button" class="btn btn--sm" data-ir-doc="${d.id}">Abrir</button></li>`).join("")}</ul>`
          : MH.empty("Sin archivos", "Este entregable aún no tiene soportes. Adjúntalos al registrar una cantidad.")}
          ${cant.length ? `<p class="label">Cantidades registradas en esta visita</p><ul class="act-docs">${cant.map((c) => `<li><span><b>${num(c.cantidad)} ${MH.esc(e.unidad)}</b><small>${MH.fecha(c.fecha)} · ${MH.esc(c.quien)}</small></span>${MH.pill(c.soporte ? "Cuenta" : "Pendiente de soporte", c.soporte ? "exito" : "alerta")}</li>`).join("")}</ul>` : ""}`,
        footer: `<button type="button" class="btn" data-close>Cerrar</button>`,
        onMount(el, close) { el.querySelectorAll("[data-ir-doc]").forEach((x) => x.addEventListener("click", () => { close(); MH.go("documentos", { focus: "doc-" + x.dataset.irDoc }); })); },
      });
    },
    "act-cantidad": (b) => abrirCantidad(b.dataset.ent),
    "act-medicion": (b) => abrirMedicion(b.dataset.ind),
  });

  /* ---------- shared form helpers ---------- */
  function setErr(el, name, msg) {
    const f = el.querySelector(`[data-f="${name}"]`); if (!f) return;
    const e = f.querySelector(".err");
    f.setAttribute("aria-invalid", msg ? "true" : "false");
    e.textContent = msg || ""; e.hidden = !msg;
  }
  const campo = (name, label, control, extra = "") => `<div class="field" data-f="${name}"><label for="f-${name}">${label}</label>${control}${extra}<small class="err" id="e-${name}" hidden></small></div>`;
  const soporteCampo = (opcional) => `<div class="field act-soporte" data-f="soporte"><span class="act-flabel">Soporte${opcional ? " <small>(opcional)</small>" : ""}</span>
      <div class="act-file"><label class="btn btn--sm act-file-btn">${MH.icon.subir}Elegir archivo<input type="file" id="f-archivo" class="act-file-in" accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"></label>
      <span class="act-file-nom" id="f-archivo-nom">Ningún archivo elegido</span> · <button type="button" class="link act-link" id="f-enlace-btn" aria-expanded="false">o pega un enlace</button></div>
      <div class="act-enlace" hidden><label class="field"><span>URL del enlace</span><input id="f-url" type="url" inputmode="url" placeholder="https://"></label>
      <label class="field"><span>Nombre del enlace</span><input id="f-urlnom" type="text"></label></div>
      <small class="err" id="e-soporte" hidden></small></div>`;
  function bindSoporte(el) {
    const inp = el.querySelector("#f-archivo"), nom = el.querySelector("#f-archivo-nom");
    inp.addEventListener("change", () => { nom.textContent = inp.files[0] ? inp.files[0].name : "Ningún archivo elegido"; setErr(el, "soporte", ""); });
    el.querySelector("#f-enlace-btn").addEventListener("click", (e) => {
      const box = el.querySelector(".act-enlace"); box.hidden = !box.hidden; e.currentTarget.setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) el.querySelector("#f-url").focus();
    });
  }
  /* → { tipo: null|"archivo"|"enlace", nombre } or { error } */
  function leerSoporte(el) {
    const f = el.querySelector("#f-archivo").files[0];
    const box = el.querySelector(".act-enlace");
    const url = el.querySelector("#f-url").value.trim(), un = el.querySelector("#f-urlnom").value.trim();
    if (f) return FORMATOS.test(f.name) ? { tipo: "archivo", nombre: f.name.replace(/\.[^.]+$/, "") } : { error: MSG_FORMATO };
    if (!box.hidden && (url || un)) {
      if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url) || url.length > 2000) return { error: MSG_URL };
      if (!un) return { error: "Completa el enlace y su nombre." };
      return { tipo: "enlace", nombre: un };
    }
    return { tipo: null };
  }
  function enviando(el, on) { el.closest(".sheet").querySelectorAll(".sheet-foot .btn").forEach((x) => (x.disabled = on)); }

  /* ---------- Registrar avance (global action) ---------- */
  MH.actions["registrar-avance"] = function (btn) {
    if (!MH.can("registrarAvance")) return MH.toast("No tienes permisos sobre este proyecto.", "error");
    const opciones = acts().filter(aceptaAvances);
    if (!opciones.length) return MH.toast("No hay actividades que reciban avances.", "info");
    const pre = (btn && btn.dataset && btn.dataset.actividad && act(btn.dataset.actividad)) || opciones[0];
    let sel = aceptaAvances(pre) ? pre : opciones[0];
    const hoy = MH.data.hoy;
    MH.openSheet({
      title: "Registrar avance",
      subtitle: `<span id="f-sub">${sel.codigo} · ${MH.esc(sel.nombre)}</span>`,
      body: `<form id="f-avance" novalidate class="act-form">
        ${campo("actividad", "Actividad", `<select id="f-actividad">${opciones.map((a) => `<option value="${a.codigo}"${a === sel ? " selected" : ""}>${a.codigo} · ${MH.esc(a.nombre)}</option>`).join("")}</select>`)}
        <div class="act-mini" id="f-mini"></div>
        ${campo("fecha", "Fecha del avance", `<input id="f-fecha" type="date" value="${hoy}" max="${hoy}" aria-describedby="e-fecha">`)}
        <div class="field" data-f="pct"><span class="act-flabel"><label for="f-pct">Avance total de la actividad (%)</label> ${MH.info("Avance total", "Escribe el total al que llega la actividad, no lo que sumas con este avance. " + AYUDA_TOPE(tope()))}</span>
          <input id="f-pct" type="number" inputmode="decimal" min="0" max="100" step="0.1" aria-describedby="f-pct-hint e-pct">
          <small id="f-pct-hint"></small><small class="err" id="e-pct" hidden></small>
          <div class="act-alerta" id="f-tope" role="alert" hidden></div></div>
        ${campo("obs", "Qué se hizo", `<textarea id="f-obs" rows="3" placeholder="Ejemplo: segunda visita de acompañamiento a dos unidades." aria-describedby="e-obs"></textarea>`)}
        ${soporteCampo(true)}
        <small class="act-nota">Puedes guardarlo sin soporte y adjuntarlo después; quedará en «Qué falta».</small>
      </form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="f-avance" class="btn btn--primary" id="f-guardar">Guardar avance</button>`,
      onMount(el, close) {
        const pct = el.querySelector("#f-pct"), guardar = el.querySelector("#f-guardar");
        const sync = () => {
          const t = topeDe(sel);
          el.querySelector("#f-sub").textContent = `${sel.codigo} · ${sel.nombre}`;
          el.querySelector("#f-pct-hint").textContent = t < 100
            ? `Hoy va en ${num(sel.avance)} %. Escribe hasta dónde llega con este avance; con avances se llega como máximo al ${t} %.`
            : `Hoy va en ${num(sel.avance)} %. Sus entregables están completos: puede llegar hasta 100 %.`;
          el.querySelector("#f-mini").innerHTML = `<span><b>${num(sel.avance)} %</b> registrado · ${sel.estado === "vencida" ? `tope ${t} %` : `debería ir en ${MH.pct(sel.programado)}`}</span><span class="act-sub">Responsable: ${MH.esc(sel.responsable)}</span>`;
          live();
        };
        const live = () => {
          const v = parseFloat(pct.value); const t = topeDe(sel); const sobre = !isNaN(v) && v > t && v <= 100;
          const al = el.querySelector("#f-tope");
          al.hidden = !sobre; al.textContent = sobre ? `El avance llega como máximo al ${t} %. El ${100 - t} % restante se completa cuando se cuentan los entregables de la actividad.` : "";
          el.querySelector('[data-f="pct"]').setAttribute("aria-invalid", sobre ? "true" : el.querySelector("#e-pct").hidden ? "false" : "true");
          guardar.disabled = sobre;
        };
        el.querySelector("#f-actividad").addEventListener("change", (e) => { sel = act(e.target.value); setErr(el, "pct", ""); sync(); });
        pct.addEventListener("input", () => { setErr(el, "pct", ""); live(); });
        el.querySelector("#f-obs").addEventListener("input", () => setErr(el, "obs", ""));
        el.querySelector("#f-fecha").addEventListener("input", () => setErr(el, "fecha", ""));
        bindSoporte(el);
        sync();
        el.querySelector("#f-avance").addEventListener("submit", (ev) => {
          ev.preventDefault();
          const fecha = el.querySelector("#f-fecha").value, v = parseFloat(pct.value), obs = el.querySelector("#f-obs").value.trim();
          const last = ultimoVigente(sel); const t = topeDe(sel);
          ["fecha", "pct", "obs", "soporte"].forEach((n) => setErr(el, n, ""));
          const errs = [];
          if (!fecha) errs.push(["fecha", "La fecha es obligatoria.", "#f-fecha"]);
          else if (fecha > hoy) errs.push(["fecha", "La fecha del avance no puede ser posterior a hoy.", "#f-fecha"]);
          if (isNaN(v) || v <= 0 || v > 100) errs.push(["pct", "El porcentaje debe ser mayor que 0 y menor o igual a 100.", "#f-pct"]);
          else if (last && v <= last.pct) errs.push(["pct", `El avance debe ser mayor que el último reportado (${num(last.pct)} %).`, "#f-pct"]);
          else if (v > t) errs.push(["pct", `El avance máximo sin entregables completos es ${t} %.`, "#f-pct"]);
          if (!obs) errs.push(["obs", "La observación es obligatoria.", "#f-obs"]);
          const sop = leerSoporte(el);
          if (sop.error) errs.push(["soporte", sop.error, "#f-archivo"]);
          if (errs.length) { errs.forEach(([n, m]) => setErr(el, n, m)); live(); el.querySelector(errs[0][2]).focus(); return; }
          enviando(el, true);
          const r = { id: nid("r"), pct: v, fecha, quien: MH.persona(), registrado: ahora(), seq: ++seq, obs, soporte: !!sop.tipo, soporteNombre: sop.nombre, anulado: false, nuevo: true };
          sel.reportes.unshift(r);
          recalcular(sel, fecha);
          registro({ tipo: "avance", actividad: sel.codigo, pct: v, fecha, texto: obs + (sop.tipo ? ` · Soporte: ${sop.nombre}` : " · Sin soporte") });
          const st = ui();
          if (st.filtro !== "todas" && grupoFiltro(sel) !== st.filtro) st.filtro = "todas";
          st.abiertas[sel.codigo] = true;
          close();
          MH.render();
          MH.toast(`Avance registrado: la ${sel.codigo} queda en ${num(sel.avance)} %.`);
          const card = document.getElementById("act-" + sel.codigo);
          if (card) { card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1600); card.querySelector("[data-act=registrar-avance]")?.focus(); }
        });
      },
    });
  };

  /* ---------- Adjuntar soporte to an avance (global action) ---------- */
  MH.actions["adjuntar-soporte"] = function (btn) {
    if (!MH.can("adjuntarSoporte")) return MH.toast("No tienes permisos sobre este proyecto.", "error");
    const a = act(btn.dataset.actividad);
    const r = a && (btn.dataset.reporte ? a.reportes.find((x) => x.id === btn.dataset.reporte) : a.reportes.find((x) => !x.anulado && !x.soporte));
    if (!r) return MH.toast("Ese avance ya tiene soporte o no existe.", "info");
    MH.openSheet({
      title: "Adjuntar soporte",
      subtitle: `${a.codigo} · avance de ${num(r.pct)} % del ${MH.fecha(r.fecha)}`,
      body: `<form id="f-adj" novalidate class="act-form">${soporteCampo(false)}</form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="f-adj" class="btn btn--primary">Adjuntar</button>`,
      onMount(el, close) {
        bindSoporte(el);
        el.querySelector("#f-adj").addEventListener("submit", (ev) => {
          ev.preventDefault();
          const sop = leerSoporte(el);
          if (sop.error || !sop.tipo) { setErr(el, "soporte", sop.error || "Adjunta al menos un soporte (archivo o enlace)."); el.querySelector("#f-archivo").focus(); return; }
          r.soporte = true; r.soporteNombre = sop.nombre;
          registro({ tipo: "documento", actividad: a.codigo, texto: `Soporte «${sop.nombre}» adjuntado al avance de ${num(r.pct)} % de la ${a.codigo}.` });
          close(); MH.render(); MH.toast(`Soporte adjuntado: el avance de ${num(r.pct)} % de la ${a.codigo} queda con soporte.`);
        });
      },
    });
  };

  /* ---------- Registrar cantidad de un entregable ---------- */
  function abrirCantidad(codigo) {
    const a = acts().find((x) => x.entregables.some((e) => e.codigo === codigo));
    const e = a.entregables.find((x) => x.codigo === codigo);
    if (!MH.can("registrarCantidad") || finalizada(a)) return MH.toast("Esta actividad ya no recibe cantidades.", "info");
    const hoy = MH.data.hoy;
    const acumulado = () => e.contado + (e.cantidades || []).filter((c) => !c.anulado && !c.soporte).reduce((s, c) => s + c.cantidad, 0);
    MH.openSheet({
      title: "Registrar cantidad", subtitle: `${e.codigo} · ${MH.esc(e.nombre)} · Meta ${num(e.meta)} ${MH.esc(e.unidad)}, falta ${num(Math.max(e.meta - e.contado, 0))}`,
      body: `<form id="f-cant" novalidate class="act-form">
        <div class="act-fila2">${campo("fecha", "Fecha", `<input id="f-fecha" type="date" value="${hoy}" max="${hoy}">`)}
        ${campo("cantidad", `Cantidad (${MH.esc(e.unidad)})`, `<input id="f-cantidad" type="number" inputmode="decimal" min="0" step="1">`)}</div>
        <div id="f-just-box" hidden>${campo("just", "Justificación del exceso", `<textarea id="f-just" rows="2"></textarea>`, `<small>Lo registrado supera la meta de ${num(e.meta)} ${MH.esc(e.unidad)}.</small>`)}</div>
        ${campo("obs", "Observación <small>(opcional)</small>", `<textarea id="f-obs" rows="2"></textarea>`)}
        <fieldset class="act-medio"><legend>Medio de verificación</legend>
          ${[["no", "Sin medio"], ["si", "Archivo o enlace"]].map(([v, l], i) => `<label><input type="radio" name="medio" value="${v}"${i ? " checked" : ""}> ${l}</label>`).join("")}</fieldset>
        <div id="f-medio-box">${soporteCampo(false)}</div>
        <small class="act-nota">Sin medio, la cantidad queda «Pendiente de soporte» y no cuenta para la meta.</small>
      </form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="f-cant" class="btn btn--primary">Registrar cantidad</button>`,
      onMount(el, close) {
        bindSoporte(el);
        const cant = el.querySelector("#f-cantidad");
        const exceso = () => { const v = parseFloat(cant.value); el.querySelector("#f-just-box").hidden = !(v > 0 && acumulado() + v > e.meta); };
        cant.addEventListener("input", () => { setErr(el, "cantidad", ""); exceso(); });
        el.querySelectorAll("[name=medio]").forEach((r) => r.addEventListener("change", () => { el.querySelector("#f-medio-box").hidden = el.querySelector("[name=medio]:checked").value === "no"; setErr(el, "soporte", ""); }));
        el.querySelector("#f-cant").addEventListener("submit", (ev) => {
          ev.preventDefault();
          ["fecha", "cantidad", "just", "soporte"].forEach((n) => setErr(el, n, ""));
          const fecha = el.querySelector("#f-fecha").value, v = parseFloat(cant.value), just = el.querySelector("#f-just").value.trim();
          const conMedio = el.querySelector("[name=medio]:checked").value === "si";
          const errs = [];
          if (!fecha) errs.push(["fecha", "La fecha es obligatoria.", "#f-fecha"]);
          else if (fecha > hoy) errs.push(["fecha", "La fecha del avance no puede ser posterior a hoy.", "#f-fecha"]);
          if (isNaN(v) || v <= 0) errs.push(["cantidad", "Ingresa un número válido.", "#f-cantidad"]);
          else if (acumulado() + v > e.meta && !just) errs.push(["just", "Indica una justificación del exceso.", "#f-just"]);
          let sop = { tipo: null };
          if (conMedio) { sop = leerSoporte(el); if (sop.error) errs.push(["soporte", sop.error, "#f-archivo"]); else if (!sop.tipo) errs.push(["soporte", el.querySelector(".act-enlace").hidden ? "Adjunta el archivo del medio." : "Completa el enlace y su nombre.", "#f-archivo"]); }
          if (errs.length) { errs.forEach(([n, m]) => setErr(el, n, m)); el.querySelector(errs[0][2]).focus(); return; }
          e.cantidades = e.cantidades || [];
          e.cantidades.push({ id: nid("c"), cantidad: v, fecha, quien: MH.persona(), soporte: !!sop.tipo, anulado: false, justificacion: just || undefined });
          if (sop.tipo) {
            e.contado += v; e.soportes = (e.soportes || 0) + 1;
            MH.data.documentos.unshift({ id: nid("d"), nombre: sop.nombre, origen: "entregable", ref: e.codigo, actividad: a.codigo, quien: MH.persona(), fecha: hoy });
          }
          registro({ tipo: "cantidad", actividad: a.codigo, fecha, texto: `${e.codigo} · ${num(v)} ${e.unidad}${sop.tipo ? ` · Soporte: ${sop.nombre}` : " · Pendiente de soporte"}.` });
          ui().entAbiertos[a.codigo] = true;
          close(); MH.render();
          MH.toast(sop.tipo ? `Cantidad registrada: ${e.codigo} lleva ${num(e.contado)} de ${num(e.meta)}.` : `Cantidad registrada sin soporte: no cuenta para la meta hasta que adjuntes el medio.`, sop.tipo ? "exito" : "info");
          document.getElementById("ent-" + e.codigo)?.querySelector("[data-act=act-cantidad]")?.focus();
        });
      },
    });
  }

  /* ---------- Registrar medición de un indicador ---------- */
  function abrirMedicion(codigo) {
    const i = MH.data.indicadores.find((x) => x.codigo === codigo); const hoy = MH.data.hoy;
    MH.openSheet({
      title: "Registrar medición", subtitle: `${i.codigo} · ${MH.esc(i.nombre)} · hoy ${num(i.valor)} de ${num(i.meta)}`,
      body: `<form id="f-med" novalidate class="act-form"><div class="act-fila2">
        ${campo("fecha", "Fecha de la medición", `<input id="f-fecha" type="date" value="${hoy}" max="${hoy}">`)}
        ${campo("valor", "Valor medido (total)", `<input id="f-valor" type="number" inputmode="decimal" min="0" step="1">`)}</div>
        ${soporteCampo(true)}</form>`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="f-med" class="btn btn--primary">Registrar medición</button>`,
      onMount(el, close) {
        bindSoporte(el);
        el.querySelector("#f-med").addEventListener("submit", (ev) => {
          ev.preventDefault(); ["fecha", "valor", "soporte"].forEach((n) => setErr(el, n, ""));
          const fecha = el.querySelector("#f-fecha").value, v = parseFloat(el.querySelector("#f-valor").value);
          const errs = [];
          if (!fecha) errs.push(["fecha", "La fecha es obligatoria.", "#f-fecha"]);
          else if (fecha > hoy) errs.push(["fecha", "La fecha de la medición no puede ser posterior a hoy.", "#f-fecha"]);
          if (isNaN(v) || v < 0) errs.push(["valor", "Ingresa un número válido.", "#f-valor"]);
          const sop = leerSoporte(el); if (sop.error) errs.push(["soporte", sop.error, "#f-archivo"]);
          if (errs.length) { errs.forEach(([n, m]) => setErr(el, n, m)); el.querySelector(errs[0][2]).focus(); return; }
          i.valor = v; i.ultima = fecha;
          if (sop.tipo) MH.data.documentos.unshift({ id: nid("d"), nombre: sop.nombre, origen: "indicador", ref: i.codigo, quien: MH.persona(), fecha: hoy });
          registro({ tipo: "cantidad", indicador: i.codigo, fecha, texto: `Medición ${i.codigo} · ${i.nombre}: ${num(v)} de ${num(i.meta)}${sop.tipo ? ` · Soporte: ${sop.nombre}` : ""}.` });
          close(); MH.render(); MH.toast(`Medición registrada: ${i.codigo} queda en ${num(v)} de ${num(i.meta)}.`);
        });
      },
    });
  }
})();
MH.tabs.actividades && (MH.tabs.actividades.headerActions = ["registrar-gasto"]);
