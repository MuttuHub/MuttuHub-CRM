/* Finanzas tab: Resumen / Gastos / Presupuesto, plus the global actions «registrar-gasto» (form)
   and «revisar-gasto» (Validar gasto panel). All figures are computed live from MH.data. */
(function () {
  const MH = window.MH;
  const esc = (s) => MH.esc(s);
  const ui = () => (MH.state.ui.finanzas = MH.state.ui.finanzas || { sub: "resumen", filtro: "todos", detalle: false });

  /* ---------- derived data ---------- */
  const rubroDe = (c) => MH.data.rubros.find((r) => r.codigo === c) || { codigo: c, nombre: "", asignado: 0, programadoHoy: 0 };
  const rubroTxt = (c) => `${c} · ${rubroDe(c).nombre}`;
  const lista = () => MH.data.gastos.slice().reverse(); // newest first
  const pendientes = () => lista().filter((g) => g.estado === "por_validar");
  const ejecRubro = (c) => MH.data.gastos.filter((g) => g.rubro === c && g.estado === "validado").reduce((s, g) => s + g.total, 0);
  const porValidarRubro = (c) => MH.data.gastos.filter((g) => g.rubro === c && g.estado === "por_validar").reduce((s, g) => s + g.total, 0);
  const supera = (g) => ejecRubro(g.rubro) + g.total > rubroDe(g.rubro).asignado;
  const cuentaEn = (g) => g.periodo !== g.fecha.slice(0, 7);
  const subtotalDe = (g) => (g.subtotal != null ? g.subtotal : g.total - (g.iva || 0));
  const tieneId = (g) => !!g.nit && g.nit !== "—";
  const idTxt = (g) => (tieneId(g) ? `${g.tipoId || "NIT"} ${g.nit}` : "");
  const dinero = (n) => (n < 0 ? "−" : "") + "$ " + Math.abs(n).toLocaleString("es-CO", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const ivaTxt = (g) => (g.iva ? `IVA ${dinero(g.iva)}` : "Sin IVA");
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const mesTxt = (p) => `${MESES[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
  function mesesProyecto() {
    const p = MH.data.proyecto; const out = [];
    let [y, m] = p.inicio.slice(0, 7).split("-").map(Number); const [fy, fm] = p.fin.slice(0, 7).split("-").map(Number);
    while (y < fy || (y === fy && m <= fm)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  function totales() {
    const f = MH.data.finanzas, p = MH.data.proyecto;
    const val = MH.data.gastos.filter((g) => g.estado === "validado");
    const ejecutado = val.reduce((s, g) => s + g.total, 0);
    return { ejecutado, n: val.length, prog: f.programadoHoy, pctProg: f.programadoHoy ? (ejecutado / f.programadoHoy) * 100 : 0,
      pctTotal: p.valorTotal ? (ejecutado / p.valorTotal) * 100 : 0, quedan: p.valorTotal - ejecutado };
  }
  /* Keep the stored aggregates in sync so other tabs read the same numbers. */
  function sync() {
    MH.data.rubros.forEach((r) => { r.ejecutado = ejecRubro(r.codigo); });
    const t = totales();
    Object.assign(MH.data.finanzas, { ejecutado: t.ejecutado, pctProgramado: +t.pctProg.toFixed(1), pctTotal: +t.pctTotal.toFixed(1) });
  }
  const semaforoRubro = (r) => (ejecRubro(r.codigo) > r.asignado ? "destructivo" : ejecRubro(r.codigo) > r.programadoHoy ? "alerta" : "exito");
  const SEM = { verde: ["Verde", "exito"], amarillo: ["Amarillo", "alerta"], rojo: ["Rojo", "destructivo"] };
  const ESTADO = { por_validar: ["Por validar", "info"], validado: ["Validado", "exito"], rechazado: ["Rechazado", "destructivo"] };
  function ahora() { return MH.ahora(); }
  function registrar(e) { MH.data.registro.unshift(Object.assign({ id: "f" + Date.now() + Math.floor(Math.random() * 1000), cuando: ahora(), quien: MH.persona() }, e)); }

  /* ---------- small pieces ---------- */
  const INFO_SUPERA = "Este gasto deja el rubro por encima de su presupuesto. Puedes validarlo, pero queda registrado.";
  const INFO_CUENTA = "El gasto cuenta en un mes distinto al de la fecha de su documento.";
  const INFO_DISP = "Lo asignado al rubro menos lo ya ejecutado y validado.";
  const avisos = (g) => {
    const a = [];
    if (g.estado === "por_validar" && supera(g)) a.push(`<span class="fin-tag">${MH.pill("Supera lo asignado", "destructivo")}${MH.info("Supera lo asignado", INFO_SUPERA)}</span>`);
    if (cuentaEn(g)) a.push(`<span class="fin-tag">${MH.pill("Cuenta en " + g.periodo, "info")}${MH.info("Cuenta en " + g.periodo, INFO_CUENTA)}</span>`);
    if (g.estado === "por_validar" && !tieneId(g)) a.push(MH.pill("Datos incompletos", "alerta"));
    return a;
  };
  function soporteHtml(g) {
    if (MH.state.role === "visualizador") return `<span class="fin-dim" aria-label="Sin acceso al soporte">—</span>`;
    if (!g.soporte) return MH.pill("Sin soporte", "alerta");
    return `<button type="button" class="link fin-soporte" data-act="fin-abrir-soporte" data-gasto="${esc(g.id)}">${MH.icon.doc}<span>${esc(g.soporte)}</span></button>`;
  }
  function accionHtml(g) {
    if (g.estado !== "por_validar") return g.estado === "rechazado" && g.motivo ? `<span class="fin-dim fin-motivo-txt">Motivo: ${esc(g.motivo)}</span>` : "";
    if (MH.can("validarGasto")) {
      if (g.registro === MH.persona()) return `<span class="fin-dim">Tú lo registraste</span>`;
      return `<button type="button" class="btn btn--sm fin-revisar" data-act="revisar-gasto" data-gasto="${esc(g.id)}">Revisar</button>`;
    }
    return `<button type="button" class="btn btn--sm fin-revisar" data-act="revisar-gasto" data-gasto="${esc(g.id)}" aria-label="Ver el gasto ${esc(g.id)}">Ver</button>`;
  }
  const quienTxt = (g) => `${esc(g.id)} · ${MH.fecha(g.fecha)} · registró ${esc(g.registro)}`;

  /* ---------- Resumen ---------- */
  function vResumen() {
    const t = totales(), p = MH.data.proyecto;
    const [semT, semK] = SEM[p.semaforoFinanciero] || SEM.verde;
    const figuras = `<div class="fin-figs">
      <div class="card fin-fig"><p class="label">Ejecutado (gastos validados)</p><b class="fin-big">${MH.money(t.ejecutado)}</b>
        <span>${t.n ? `${t.n} ${t.n === 1 ? "gasto validado" : "gastos validados"}` : "Ejecución disponible cuando se registren gastos"}</span></div>
      <div class="card fin-fig"><p class="label">Programado a hoy ${MH.info("Programado a hoy", `Lo que el plan financiero dice que deberías llevar ejecutado al ${MH.fecha(MH.data.hoy)}. El porcentaje compara lo validado con esa cifra.`)}</p>
        <b class="fin-big">${MH.money(t.prog)}</b><span>${MH.pct(t.pctProg)} de lo programado ejecutado ${MH.pill(semT, semK)}</span></div>
      <div class="card fin-fig"><p class="label">Valor total del proyecto</p><b class="fin-big">${MH.money(p.valorTotal)}</b>
        <span>${MH.pct(t.pctTotal)} del total ejecutado · quedan ${MH.money(t.quedan)}</span></div></div>`;
    const retraso = t.pctProg < 50 && p.avanceReal < p.avanceProgramado
      ? `<div class="fin-alert" role="note"><span>Posible retraso: se ha gastado poco frente a lo programado y el avance técnico también va atrasado (${MH.pct(p.avanceReal)} de ${MH.pct(p.avanceProgramado)}).</span>
          <button type="button" class="link" data-act="fin-ver-actividades">Ver actividades</button></div>` : "";
    const pend = pendientes();
    const sumPend = pend.reduce((s, g) => s + g.total, 0);
    const porValidar = pend.length ? `<section class="fin-sec" id="fin-pendientes" tabindex="-1" aria-labelledby="fin-pend-h">
        <div class="fin-sec-head"><h3 id="fin-pend-h">Gastos por validar · ${pend.length} · ${dinero(sumPend)}</h3>
          <button type="button" class="link fin-only-desk" data-act="fin-ver-gastos">Ver todos los gastos</button></div>
        <div class="fin-grid fin-pend" role="list">
          <div class="fin-row fin-head" aria-hidden="true"><span>Gasto</span><span>Rubro</span><span class="num">Total</span><span>Aviso</span><span>Soporte</span><span>Acción</span></div>
          ${pend.map((g) => `<div class="fin-row" role="listitem" id="gasto-${esc(g.id)}">
            <span class="fin-c-gasto"><b>${esc(g.tercero)}</b><small>${quienTxt(g)}</small></span>
            <span class="fin-c-rubro"><span class="fin-m">Rubro: </span>${esc(rubroTxt(g.rubro))}</span>
            <span class="fin-c-total num"><b>${dinero(g.total)}</b><small>${ivaTxt(g)}</small></span>
            <span class="fin-c-aviso">${avisos(g).join("") || '<span class="fin-dim fin-only-desk">—</span>'}</span>
            <span class="fin-c-soporte">${soporteHtml(g)}</span>
            <span class="fin-c-accion">${accionHtml(g)}</span></div>`).join("")}
        </div>
        <button type="button" class="link fin-only-mob" data-act="fin-ver-gastos">Ver todos los gastos</button>
      </section>` : "";
    const rubros = MH.data.rubros.filter((r) => r.asignado > 0);
    const porRubro = `<section class="fin-sec" aria-labelledby="fin-rub-h">
        <div class="fin-sec-head"><h3 id="fin-rub-h">Por rubro<span class="fin-only-mob"> · % de lo programado</span></h3></div>
        ${rubros.length ? `<div class="fin-grid fin-rub" role="list">
          <div class="fin-row fin-head" aria-hidden="true"><span>Rubro</span><span class="num">Programado a hoy</span><span class="num">Ejecutado</span><span>% de lo programado</span><span class="num">Disponible del rubro ${MH.info("Disponible del rubro", INFO_DISP)}</span></div>
          ${rubros.map((r) => {
            const ej = ejecRubro(r.codigo), pct = r.programadoHoy ? (ej / r.programadoHoy) * 100 : 0;
            const n = pend.filter((g) => g.rubro === r.codigo && supera(g)).length;
            return `<div class="fin-row" role="listitem" id="rubro-${r.codigo}">
              <span class="fin-c-rubro"><b>${esc(rubroTxt(r.codigo))}</b>${n ? `<small class="fin-warn">${n} ${n === 1 ? "gasto por validar lo supera" : "gastos por validar lo superan"}</small>` : ""}</span>
              <span class="fin-c-prog num"><span class="fin-m">Programado a hoy</span>${MH.money(r.programadoHoy)}</span>
              <span class="fin-c-ejec num"><span class="fin-m">Ejecutado</span>${MH.money(ej)}</span>
              <span class="fin-c-pct"><span class="bar" role="img" aria-label="${MH.pct(pct)} de lo programado"><i class="${semaforoRubro(r)}" style="width:${Math.min(pct, 100)}%"></i></span><b>${MH.pct(pct)}</b></span>
              <span class="fin-c-disp num"><span class="fin-m">Disponible</span>${MH.money(r.asignado - ej)}</span></div>`;
          }).join("")}</div>` : MH.empty("Sin presupuesto", "Aún no hay presupuesto asignado a este proyecto.")}
        <button type="button" class="link fin-toggle" data-act="fin-detalle" aria-expanded="${ui().detalle}" aria-controls="fin-detalle">${ui().detalle ? "Ocultar detalle" : "Ver detalle con diferencias y límites de cada color"}</button>
        ${ui().detalle ? vDetalle(rubros) : ""}
      </section>`;
    return figuras + retraso + porValidar + porRubro;
  }

  function vDetalle(rubros) {
    const colorTxt = { exito: "Verde", alerta: "Amarillo", destructivo: "Rojo" };
    return `<div class="fin-detalle" id="fin-detalle">
      <div class="table-wrap"><table><thead><tr><th>Rubro</th><th class="num">Asignado</th><th class="num">Programado a hoy</th><th class="num">Ejecutado</th><th class="num">Diferencia</th><th class="num">% de lo programado</th><th>Color</th></tr></thead>
      <tbody>${rubros.map((r) => { const ej = ejecRubro(r.codigo), k = semaforoRubro(r);
        return `<tr><td>${esc(rubroTxt(r.codigo))}</td><td class="num">${MH.money(r.asignado)}</td><td class="num">${MH.money(r.programadoHoy)}</td><td class="num">${MH.money(ej)}</td><td class="num">${MH.money(r.programadoHoy - ej)}</td><td class="num">${MH.pct(r.programadoHoy ? (ej / r.programadoHoy) * 100 : 0)}</td><td>${MH.pill(colorTxt[k], k)}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="fin-note">Diferencia = programado a hoy − ejecutado. Límites de cada color: <b>Verde</b>, lo ejecutado no pasa de lo programado a hoy; <b>Amarillo</b>, pasa de lo programado a hoy sin superar lo asignado; <b>Rojo</b>, supera lo asignado al rubro.</p>
      <fieldset class="fin-avanzadas"><legend>Opciones avanzadas</legend>
        <label class="field"><span>Corte</span><input type="date" id="fin-corte" value="${MH.data.hoy}" max="${MH.data.hoy}"></label>
        <label class="field"><span>Base</span><select id="fin-base"><option>Plan financiero vigente</option><option>Línea base (versión original)</option></select></label>
        <button type="button" class="btn" data-act="fin-restablecer">Restablecer</button>
      </fieldset></div>`;
  }

  /* ---------- Gastos ---------- */
  const FILTROS = [["todos", "Todos"], ["por_validar", "Por validar"], ["validado", "Validados"], ["rechazado", "Rechazados"]];
  function vGastos() {
    const todos = lista(), f = ui().filtro;
    const vis = f === "todos" ? todos : todos.filter((g) => g.estado === f);
    const chips = `<div class="chips" role="group" aria-label="Filtrar por estado">${FILTROS.map(([k, l]) => {
      const n = k === "todos" ? todos.length : todos.filter((g) => g.estado === k).length;
      return `<button type="button" class="chip" data-act="fin-filtro" data-filtro="${k}" aria-pressed="${f === k}">${l} · ${n}</button>`; }).join("")}</div>`;
    const bar = `<div class="fin-gastos-bar">${chips}${MH.can("registrarGasto") ? `<button type="button" class="btn btn--primary fin-only-desk" data-act="registrar-gasto">Registrar gasto</button>` : ""}</div>`;
    const rows = vis.length ? `<div class="fin-grid fin-gas" role="list">
        <div class="fin-row fin-head" aria-hidden="true"><span>Gasto</span><span>Rubro</span><span>Periodo</span><span class="num">Total</span><span>Estado</span><span>Soporte</span><span>Acción</span></div>
        ${vis.map((g) => `<div class="fin-row" role="listitem" id="gasto-${esc(g.id)}">
          <span class="fin-c-gasto"><b>${esc(g.tercero)}</b><small>${quienTxt(g)}</small><small class="fin-desc">${esc(g.descripcion)}</small></span>
          <span class="fin-c-rubro"><span class="fin-m">Rubro: </span>${esc(rubroTxt(g.rubro))}</span>
          <span class="fin-c-per"><span class="fin-m">Periodo: </span>${mesTxt(g.periodo)}</span>
          <span class="fin-c-total num"><b>${dinero(g.total)}</b><small>${ivaTxt(g)}</small></span>
          <span class="fin-c-aviso">${MH.pill(...ESTADO[g.estado])}${avisos(g).join("")}</span>
          <span class="fin-c-soporte">${soporteHtml(g)}</span>
          <span class="fin-c-accion">${accionHtml(g)}</span></div>`).join("")}
      </div>` : MH.empty("No hay gastos en este estado", "Cambia el filtro para ver los demás gastos del proyecto.");
    // Breakdown by periodo and IVA of the filtered set.
    const per = {};
    vis.forEach((g) => { const x = (per[g.periodo] = per[g.periodo] || { n: 0, sub: 0, iva: 0, tot: 0 }); x.n++; x.sub += subtotalDe(g); x.iva += g.iva || 0; x.tot += g.total; });
    const keys = Object.keys(per).sort();
    const sum = keys.reduce((a, k) => ({ n: a.n + per[k].n, sub: a.sub + per[k].sub, iva: a.iva + per[k].iva, tot: a.tot + per[k].tot }), { n: 0, sub: 0, iva: 0, tot: 0 });
    const linea = (label, x, cls = "") => `<div class="fin-row ${cls}" role="listitem"><span class="fin-c-gasto"><b>${label}</b><small>${x.n} ${x.n === 1 ? "gasto" : "gastos"}</small></span>
      <span class="num"><span class="fin-m">Subtotal</span>${dinero(x.sub)}</span><span class="num"><span class="fin-m">IVA</span>${x.iva ? dinero(x.iva) : "Sin IVA"}</span><span class="num"><span class="fin-m">Total</span><b>${dinero(x.tot)}</b></span></div>`;
    const desglose = keys.length ? `<section class="fin-sec" aria-labelledby="fin-per-h"><div class="fin-sec-head"><h3 id="fin-per-h">Por periodo e IVA · ${FILTROS.find(([k]) => k === f)[1].toLowerCase()}</h3></div>
        <div class="fin-grid fin-per" role="list"><div class="fin-row fin-head" aria-hidden="true"><span>Periodo</span><span class="num">Subtotal</span><span class="num">IVA</span><span class="num">Total</span></div>
        ${keys.map((k) => linea(mesTxt(k), per[k])).join("")}${keys.length > 1 ? linea("Total", sum, "fin-sum") : ""}</div></section>` : "";
    return bar + rows + desglose;
  }

  /* ---------- Presupuesto ---------- */
  function vPresupuesto() {
    const rs = MH.data.rubros;
    if (!rs.some((r) => r.asignado > 0)) return MH.empty("Sin presupuesto", "Aún no hay presupuesto asignado a este proyecto.");
    const tot = rs.reduce((a, r) => ({ asig: a.asig + r.asignado, ej: a.ej + ejecRubro(r.codigo), pv: a.pv + porValidarRubro(r.codigo) }), { asig: 0, ej: 0, pv: 0 });
    const fila = (nombre, asig, ej, pv, id, k) => { const pct = asig ? (ej / asig) * 100 : 0;
      return `<div class="fin-row${id ? "" : " fin-sum"}" role="listitem"${id ? ` id="rubro-${id}"` : ""}>
        <span class="fin-c-rubro"><b>${esc(nombre)}</b></span>
        <span class="num"><span class="fin-m">Asignado</span>${MH.money(asig)}</span>
        <span class="num"><span class="fin-m">Ejecutado</span>${MH.money(ej)}</span>
        <span class="num"><span class="fin-m">Por validar</span>${pv ? dinero(pv) : "—"}</span>
        <span class="num"><span class="fin-m">Disponible</span><b class="${asig - ej < 0 ? "fin-neg" : ""}">${MH.money(asig - ej)}</b></span>
        <span class="fin-c-pct"><span class="bar" role="img" aria-label="${MH.pct(pct)} del asignado"><i class="${k}" style="width:${Math.min(pct, 100)}%"></i></span><b>${MH.pct(pct)}</b></span></div>`; };
    return `<section class="fin-sec" aria-labelledby="fin-pre-h"><div class="fin-sec-head"><h3 id="fin-pre-h">Presupuesto por rubro</h3>${MH.info("Disponible del rubro", INFO_DISP)}</div>
      <div class="fin-grid fin-pre" role="list"><div class="fin-row fin-head" aria-hidden="true"><span>Rubro</span><span class="num">Asignado</span><span class="num">Ejecutado</span><span class="num">Por validar</span><span class="num">Disponible</span><span>% ejecutado del asignado</span></div>
      ${rs.map((r) => fila(rubroTxt(r.codigo), r.asignado, ejecRubro(r.codigo), porValidarRubro(r.codigo), r.codigo, semaforoRubro(r))).join("")}
      ${fila("Total del proyecto", tot.asig, tot.ej, tot.pv, null, "exito")}</div></section>`;
  }

  /* ---------- tab render ---------- */
  const SUBS = [["resumen", "Resumen"], ["gastos", "Gastos"], ["presupuesto", "Presupuesto"]];
  MH.tabs.finanzas = {
    render(el, ctx) {
      const s = ui(), nav = ctx.nav || {};
      if (!nav._fin) {
        nav._fin = true;
        if (nav.sub) s.sub = nav.sub;
        if (nav.focus && nav.focus.startsWith("gasto-")) {
          const g = MH.data.gastos.find((x) => "gasto-" + x.id === nav.focus);
          if (g && !(s.sub === "resumen" && g.estado === "por_validar")) { s.sub = "gastos"; if (s.filtro !== "todos" && s.filtro !== g.estado) s.filtro = "todos"; }
        }
        if (nav.focus && nav.focus.startsWith("rubro-") && s.sub === "gastos") s.sub = "resumen";
      }
      const body = s.sub === "gastos" ? vGastos() : s.sub === "presupuesto" ? vPresupuesto() : vResumen();
      el.innerHTML = `<div class="fin">
        <div class="subtabs" role="tablist" aria-label="Finanzas">${SUBS.map(([k, l]) => `<button type="button" role="tab" id="fin-tab-${k}" aria-controls="fin-panel" aria-selected="${s.sub === k}" tabindex="${s.sub === k ? 0 : -1}" data-act="fin-sub" data-sub="${k}">${l}${k === "gastos" ? ` · ${MH.data.gastos.length}` : ""}</button>`).join("")}</div>
        <div class="fin-panel" id="fin-panel" role="tabpanel" aria-labelledby="fin-tab-${s.sub}">${body}</div></div>`;
      el.querySelector(".subtabs").addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const i = SUBS.findIndex(([k]) => k === s.sub) + (e.key === "ArrowRight" ? 1 : -1);
        s.sub = SUBS[(i + SUBS.length) % SUBS.length][0]; MH.render();
        document.getElementById("fin-tab-" + s.sub)?.focus();
      });
      el.querySelector("#fin-corte")?.addEventListener("change", () => MH.toast("En el prototipo las cifras usan siempre el corte del " + MH.fecha(MH.data.hoy) + ".", "info"));
      el.querySelector("#fin-base")?.addEventListener("change", () => MH.toast("En el prototipo la base es siempre el plan financiero vigente.", "info"));
      MH.state.mobileBar = MH.can("registrarGasto") ? `<button type="button" class="btn btn--primary" data-act="registrar-gasto">Registrar gasto</button>` : "";
    },
  };

  Object.assign(MH.actions, {
    "fin-sub": (b) => { ui().sub = b.dataset.sub; MH.render(); document.getElementById("fin-tab-" + ui().sub)?.focus(); },
    "fin-filtro": (b) => { ui().filtro = b.dataset.filtro; MH.render(); document.querySelector(`[data-act=fin-filtro][data-filtro=${b.dataset.filtro}]`)?.focus(); },
    "fin-ver-gastos": () => { ui().sub = "gastos"; ui().filtro = "todos"; MH.render(); document.getElementById("fin-tab-gastos")?.focus(); },
    "fin-ver-actividades": () => MH.go("actividades"),
    "fin-detalle": () => { ui().detalle = !ui().detalle; MH.render(); document.querySelector(".fin-toggle")?.focus(); },
    "fin-restablecer": () => { MH.render(); MH.toast("Opciones restablecidas: corte de hoy y plan financiero vigente.", "info"); },
    "fin-abrir-soporte": (b) => {
      const g = MH.data.gastos.find((x) => x.id === b.dataset.gasto);
      MH.toast(`En la app se abre «${g ? g.soporte : "el soporte"}» en otra pestaña con un enlace firmado. El prototipo no tiene archivos.`, "info");
    },
  });

  /* ---------- Registrar gasto (form) ---------- */
  const parseNum = (s) => { s = String(s).trim(); if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(s)) return NaN; return Number(s.replace(/\./g, "").replace(",", ".")); };
  const TIPOS = [["Factura de proveedor", "Factura de proveedor"], ["Cuenta de cobro de persona natural", "Cuenta de cobro"], ["Otro", "Otro"]];
  const EXT = /\.(pdf|docx|xlsx|pptx|jpe?g|png)$/i;

  MH.actions["registrar-gasto"] = () => {
    if (!MH.can("registrarGasto")) { MH.toast("Tu rol es de solo consulta: no puedes registrar gastos.", "info"); return; }
    ui().sub = "gastos";
    if (MH.state.tab !== "finanzas") MH.go("finanzas"); else MH.render();
    (document.querySelector(".fin-gastos-bar [data-act=registrar-gasto]") || document.getElementById("fin-tab-gastos"))?.focus();
    abrirFormulario();
  };

  function abrirFormulario() {
    const rubros = MH.data.rubros.filter((r) => r.asignado > 0), meses = mesesProyecto(), hoy = MH.data.hoy;
    const st = { modo: "archivo", archivo: null };
    const f = (id, label, input, extra = "") => `<label class="field" id="ff-${id}"><span>${label}</span>${input}${extra}<small class="err" id="fe-${id}" hidden></small></label>`;
    const body = `<form class="fin-form" id="fin-form" novalidate>
      ${rubros.length ? f("rubro", "Rubro", `<select id="fi-rubro" aria-describedby="fe-rubro"><option value="">Elige un rubro</option>${rubros.map((r) => `<option value="${r.codigo}">${esc(rubroTxt(r.codigo))}</option>`).join("")}</select>`)
        : `<p class="err">Aún no hay rubros con monto asignado. Asigna primero un monto a un rubro en Presupuesto.</p>`}
      <div class="fin-f3">
        ${f("subtotal", "Subtotal", `<input id="fi-subtotal" inputmode="decimal" autocomplete="off" placeholder="1.500,50" aria-describedby="fe-subtotal">`)}
        ${f("iva", "IVA", `<input id="fi-iva" inputmode="decimal" autocomplete="off" value="0" aria-describedby="fe-iva">`)}
        <label class="field"><span>Total</span><output id="fi-total" class="fin-total" aria-live="polite">$ 0</output><small>Subtotal + IVA, lo calcula el sistema.</small></label>
      </div>
      <div class="fin-f2">
        ${f("fecha", "Fecha del documento", `<input type="date" id="fi-fecha" value="${hoy}" max="${hoy}" aria-describedby="fe-fecha">`)}
        ${f("periodo", "Periodo", `<select id="fi-periodo" aria-describedby="fe-periodo"><option value="">Elige el periodo</option>${meses.map((m) => `<option value="${m}">${mesTxt(m)}</option>`).join("")}</select>`, `<small id="fi-periodo-hint" hidden></small>`)}
      </div>
      <div class="fin-f2">
        ${f("tipo", "Tipo de soporte", `<select id="fi-tipo">${TIPOS.map(([l]) => `<option>${l}</option>`).join("")}</select>`)}
        ${f("numero", "Número de documento", `<input id="fi-numero" autocomplete="off" aria-describedby="fe-numero">`)}
      </div>
      ${f("tercero", "Tercero", `<input id="fi-tercero" autocomplete="off" aria-describedby="fe-tercero">`)}
      <div class="fin-f2">
        ${f("tipoid", "Tipo de identificación (opcional)", `<select id="fi-tipoid"><option value="">Sin definir</option><option>NIT</option><option>Cédula de ciudadanía</option><option>Cédula de extranjería</option></select>`)}
        ${f("nit", "Número de identificación (opcional)", `<input id="fi-nit" inputmode="numeric" autocomplete="off">`, `<small>Sin identificación el gasto queda «Datos incompletos» y no se puede validar.</small>`)}
      </div>
      ${f("descripcion", "Descripción", `<textarea id="fi-descripcion" rows="2" aria-describedby="fe-descripcion"></textarea>`)}
      <fieldset class="fin-soporte-f" id="ff-soporte"><legend>Soporte</legend>
        <div class="fin-seg" role="radiogroup" aria-label="Tipo de soporte adjunto">
          <label><input type="radio" name="fi-modo" value="archivo" checked> Archivo</label>
          <label><input type="radio" name="fi-modo" value="enlace"> Enlace</label></div>
        <div id="fi-archivo-box" class="fin-file"><input type="file" id="fi-file" hidden accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png">
          <button type="button" class="btn" id="fi-elegir">${MH.icon.subir} Elegir archivo</button><span id="fi-file-name" class="fin-dim">Ningún archivo elegido</span>
          <button type="button" class="btn btn--sm" id="fi-quitar" hidden>Quitar</button></div>
        <div id="fi-enlace-box" class="fin-f2" hidden>
          <label class="field"><span>URL</span><input id="fi-url" type="url" inputmode="url" placeholder="https://" aria-describedby="fe-soporte"></label>
          <label class="field"><span>Nombre del enlace</span><input id="fi-url-nombre" placeholder="Factura en el portal del proveedor"></label></div>
        <small class="err" id="fe-soporte" hidden></small>
      </fieldset>
      <p class="err" id="fin-form-err" role="alert" hidden></p>
      <button type="submit" hidden></button>
    </form>`;
    MH.openSheet({
      title: "Registrar gasto", subtitle: `${MH.data.proyecto.codigo} · se registra por validar; lo valida Gerencia.`, body, size: "dialog",
      footer: `<button type="button" class="btn" id="fin-cancelar">Cancelar</button><button type="button" class="btn btn--primary" id="fin-registrar">Registrar</button>`,
      onMount(el, close) {
        el.classList.add("fin-sheet-form");
        const $ = (s) => el.querySelector(s);
        const total = () => { const a = parseNum($("#fi-subtotal").value), b = parseNum($("#fi-iva").value);
          $("#fi-total").textContent = a > 0 && b >= 0 ? dinero(Math.round((a + b) * 100) / 100) : "$ 0"; };
        $("#fi-subtotal").addEventListener("input", total); $("#fi-iva").addEventListener("input", total);
        const periodoDesdeFecha = () => { const m = $("#fi-fecha").value.slice(0, 7); const ok = meses.includes(m);
          $("#fi-periodo").value = ok ? m : ""; const h = $("#fi-periodo-hint"); h.hidden = ok || !m; h.textContent = "La fecha está fuera de los meses del proyecto: elige el periodo."; };
        $("#fi-fecha").addEventListener("change", periodoDesdeFecha); periodoDesdeFecha();
        el.querySelectorAll("[name=fi-modo]").forEach((r) => r.addEventListener("change", () => { st.modo = r.value; $("#fi-archivo-box").hidden = st.modo !== "archivo"; $("#fi-enlace-box").hidden = st.modo !== "enlace"; setErr("soporte", ""); }));
        $("#fi-elegir").addEventListener("click", () => $("#fi-file").click());
        $("#fi-file").addEventListener("change", () => {
          const file = $("#fi-file").files[0]; if (!file) return;
          if (!EXT.test(file.name)) { st.archivo = null; setErr("soporte", "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG."); }
          else if (file.size > 25 * 1024 * 1024) { st.archivo = null; setErr("soporte", "El archivo supera el límite de 25 MB."); }
          else { st.archivo = file.name; setErr("soporte", ""); }
          $("#fi-file-name").textContent = st.archivo || "Ningún archivo elegido"; $("#fi-quitar").hidden = !st.archivo; $("#fi-file").value = "";
        });
        $("#fi-quitar").addEventListener("click", () => { st.archivo = null; $("#fi-file-name").textContent = "Ningún archivo elegido"; $("#fi-quitar").hidden = true; $("#fi-elegir").focus(); });
        function setErr(k, msg) {
          const e = $("#fe-" + k), box = $("#ff-" + k); if (!e) return;
          e.textContent = msg; e.hidden = !msg; if (box) box.setAttribute("aria-invalid", msg ? "true" : "false");
          const input = box && box.querySelector("input,select,textarea"); if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
        }
        $("#fin-cancelar").addEventListener("click", close);
        $("#fin-form").addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
        $("#fin-registrar").addEventListener("click", enviar);
        function enviar() {
          if (!rubros.length) return;
          const v = (id) => $("#fi-" + id).value.trim();
          const sub = parseNum(v("subtotal")), iva = parseNum(v("iva"));
          const checks = [
            ["rubro", !v("rubro") && "Elige el rubro."],
            ["fecha", !v("fecha") ? "La fecha del documento es obligatoria." : v("fecha") > hoy && "La fecha del documento no puede ser futura."],
            ["periodo", !v("periodo") && "Elige el periodo: la fecha del documento está fuera de los meses del proyecto."],
            ["subtotal", !(sub > 0) && "Ingresa un subtotal válido con máximo dos decimales; usa coma para los decimales (1.500,50)."],
            ["iva", v("iva") === "" ? "Ingresa el IVA (puede ser 0)." : !(iva >= 0) && "Ingresa un IVA válido con máximo dos decimales; usa coma para los decimales (1.500,50). Puede ser 0."],
            ["tercero", !v("tercero") && "El nombre del tercero es obligatorio."],
            ["numero", !v("numero") && "El número de documento es obligatorio."],
            ["descripcion", !v("descripcion") && "La descripción es obligatoria."],
            ["soporte", st.modo === "archivo" ? !st.archivo && ($("#fe-soporte").hidden ? "Adjunta al menos un soporte (archivo o enlace)." : $("#fe-soporte").textContent)
              : !v("url") ? "Adjunta al menos un soporte (archivo o enlace)." : !(/^https:\/\/[^\s/$.?#][^\s]*$/i.test(v("url")) && v("url").length <= 2000) && "El enlace debe ser una URL https válida (máximo 2000 caracteres)."],
          ];
          let first = null;
          checks.forEach(([k, msg]) => { setErr(k, msg || ""); if (msg && !first) first = k; });
          if (first) { const box = $("#ff-" + first); (box.querySelector("select,input:not([type=file]):not([type=radio]),textarea") || $("#fi-elegir")).focus(); return; }
          // Save.
          const g0 = { tercero: v("tercero"), nit: v("nit") || "—", tipoId: v("tipoid") || "", rubro: v("rubro"), subtotal: sub, iva, total: Math.round((sub + iva) * 100) / 100,
            periodo: v("periodo"), fecha: v("fecha"), descripcion: v("descripcion"), estado: "por_validar", registro: MH.persona() };
          if (!g0.tipoId && g0.nit !== "—") g0.tipoId = "NIT";
          const tipo = TIPOS.find(([l]) => l === v("tipo"))[1];
          let id = v("numero"), n = 2; const dup = MH.data.gastos.some((x) => x.id === id && x.estado !== "rechazado");
          while (MH.data.gastos.some((x) => x.id === id)) id = `${v("numero")}-${n++}`;
          const soporte = st.modo === "archivo" ? st.archivo : v("url-nombre") || v("url").replace(/^https:\/\//i, "").split("/")[0];
          const warnSupera = ejecRubro(g0.rubro) + g0.total > rubroDe(g0.rubro).asignado;
          const g = Object.assign({ id, tipo }, g0, { soporte });
          MH.data.gastos.push(g);
          const docs = MH.data.documentos; const dn = docs.reduce((m, d) => Math.max(m, +String(d.id).replace(/\D/g, "") || 0), 0) + 1;
          docs.unshift({ id: "d" + dn, nombre: soporte, origen: "gasto", ref: id, quien: MH.persona(), fecha: hoy, enlace: st.modo === "enlace" ? v("url") : undefined });
          registrar({ tipo: "gasto", gasto: id, texto: `${g.tercero} · ${g.descripcion} · ${mesTxt(g.periodo)} · ${ivaTxt(g)} · 1 soporte.` });
          sync(); close();
          ui().sub = "gastos"; ui().filtro = "todos";
          MH.go("finanzas", { focus: "gasto-" + id, _fin: true });
          const av = [];
          if (warnSupera) av.push("Este gasto, sumado a los gastos validados, superaría el valor asignado al rubro.");
          if (dup) av.push(`Ya hay otro gasto con el número ${v("numero")}. Se registró igual; revisa que no esté duplicado antes de validarlo.`);
          if (g0.nit === "—") av.push("Falta la identificación del tercero: el gasto queda «Datos incompletos» y no se puede validar hasta completarla.");
          if (av.length) MH.openSheet({ title: "Gasto registrado, con avisos", body: `<ul class="fin-avisos">${av.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`,
            footer: `<button type="button" class="btn btn--primary" data-close>Entendido</button>` });
        }
      },
    });
  }

  /* ---------- Validar gasto (panel) ---------- */
  let P = null; // { id, el, obs }
  MH.actions["revisar-gasto"] = (b) => {
    const id = b.dataset.gasto;
    if (!MH.data.gastos.some((g) => g.id === id)) { MH.toast("No encontramos ese gasto.", "error"); return; }
    MH.openSheet({ title: "Validar gasto", subtitle: `${MH.data.proyecto.codigo} · ${MH.data.proyecto.nombre}`, size: "panel", body: "", footer: " ",
      onMount(el) {
        el.classList.add("fin-sheet-val");
        P = { id, el };
        const layer = document.querySelector(".layer");
        P.obs = new MutationObserver(() => { if (!layer.hidden) return; const last = P && P.id; P.obs.disconnect(); P = null; devolverFoco(last); });
        P.obs.observe(layer, { attributes: true, attributeFilter: ["hidden"] });
        pintar(false);
        setTimeout(() => P && P.el.querySelector("#fin-val-h")?.focus(), 0);
      } });
  };
  function devolverFoco(id) {
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const b = [...document.querySelectorAll("[data-act=revisar-gasto]")].find((x) => x.dataset.gasto === id);
      (b || document.getElementById("fin-pendientes") || document.getElementById("fin-tab-resumen"))?.focus();
    }, 0);
  }

  function pintar(foco) {
    const el = P.el, g = MH.data.gastos.find((x) => x.id === P.id), pend = pendientes();
    const idx = pend.findIndex((x) => x.id === g.id), r = rubroDe(g.rubro), ej = ejecRubro(g.rubro);
    const esPend = g.estado === "por_validar", puede = MH.can("validarGasto"), propio = g.registro === MH.persona();
    const queda = r.asignado - ej - g.total, excede = esPend && queda < 0;
    const movil = MH.isMobile();
    el.querySelector("#sheet-title").textContent = movil ? (idx >= 0 ? `Por validar · ${idx + 1} de ${pend.length}` : "Gasto") : "Validar gasto";
    const prev = pend[idx - 1], next = pend[idx + 1];
    const navMovil = movil && idx >= 0 ? `<div class="fin-val-nav">
        <button type="button" class="btn btn--icon" id="fin-prev" aria-label="${prev ? "Gasto anterior: " + esc(prev.tercero) : "Gasto anterior"}" ${prev ? "" : "disabled"}>‹</button>
        <span>${idx + 1} de ${pend.length}</span>
        <button type="button" class="btn btn--icon" id="fin-next" aria-label="${next ? "Siguiente gasto: " + esc(next.tercero) : "Siguiente gasto"}" ${next ? "" : "disabled"}>›</button></div>` : "";
    const listaHtml = `<nav class="fin-val-list" aria-label="Gastos por validar"><p class="label">Por validar · ${pend.length}</p>
      ${pend.length ? `<ul>${pend.map((x) => `<li><button type="button" class="fin-val-item" data-id="${esc(x.id)}" ${x.id === g.id ? 'aria-current="true"' : ""}>
        <span class="fin-val-top"><b>${esc(x.tercero)}</b><span class="mono">${dinero(x.total)}</span></span>
        <small>${esc(rubroTxt(x.rubro))} · ${esc(x.id)}${cuentaEn(x) ? ` · cuenta en ${x.periodo}` : ""}</small>
        ${supera(x) ? MH.pill("Supera lo asignado", "destructivo") : ""}</button></li>`).join("")}</ul>` : `<p class="fin-dim">No quedan gastos por validar.</p>`}</nav>`;
    const verSoporte = MH.state.role !== "visualizador";
    const soporte = `<aside class="fin-val-sop" aria-label="Soporte">
      <div class="fin-val-sop-head"><b>Soporte · ${esc(g.soporte || "sin soporte")}</b>${verSoporte && g.soporte ? `<button type="button" class="link" data-act="fin-abrir-soporte" data-gasto="${esc(g.id)}">Abrir en otra pestaña ${MH.icon.abrir}</button>` : ""}</div>
      <div class="fin-val-preview">${verSoporte ? (g.soporte ? `${MH.icon.doc}<b>Vista previa del soporte</b><span>Aquí se ve el PDF o la imagen adjunta, sin salir del panel. En el prototipo es un espacio reservado: no hay archivo de ejemplo.</span>`
        : `<b>Sin soporte</b><span>Adjunta un soporte para poder validarlo.</span>`) : `<b>Sin acceso</b><span>Tu rol no recibe los soportes de los gastos.</span>`}</div></aside>`;
    const dato = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const detalle = `<section class="fin-val-det">
      <p class="mono">${esc(g.id)} · ${esc(g.tipo)}</p>
      <h3 id="fin-val-h" tabindex="-1">${esc(g.tercero)}</h3>
      <p class="fin-val-desc">${esc(g.descripcion)}</p>
      <div class="fin-val-pills">${esPend ? "" : MH.pill(...ESTADO[g.estado])}${esPend && supera(g) ? MH.pill("Supera lo asignado", "destructivo") : ""}${!tieneId(g) ? MH.pill("Datos incompletos", "alerta") : ""}</div>
      <dl class="fin-dl">
        ${dato("Total", `<b>${dinero(g.total)}</b> · ${ivaTxt(g)}`)}
        ${dato("Fecha del documento", `${MH.fecha(g.fecha)} · cuenta en ${g.periodo}`)}
        ${dato("Identificación", tieneId(g) ? esc(idTxt(g)) : "Sin identificación")}
        ${dato("Registró", esc(g.registro))}
        ${g.estado === "rechazado" && g.motivo ? dato("Motivo del rechazo", esc(g.motivo)) : ""}
      </dl>
      <div class="fin-rubbox">
        <p class="fin-rubbox-h"><b>Rubro ${esc(rubroTxt(g.rubro))}</b> ${MH.info("Disponible del rubro", INFO_DISP)}</p>
        <dl class="fin-dl fin-dl--4">${dato("Asignado", MH.money(r.asignado))}${dato("Ya ejecutado", MH.money(ej))}${dato(esPend ? "Este gasto" : "Este gasto (ya contado)" , MH.money(g.total))}</dl>
        ${esPend ? `<p class="fin-queda ${excede ? "fin-neg" : ""}">${excede ? "Si lo validas, el rubro queda en" : "Si lo validas, al rubro le quedan"} <b>${MH.money(queda)}</b></p>` : ""}
      </div>
      ${excede ? `<div class="fin-alert fin-alert--col" role="note">${MH.pill("Hoy la API lo bloquea", "alerta")}<span>Puedes validarlo igual: quedará marcado como «Supera lo asignado» en el resumen. Otra opción es rechazarlo y pedir un traslado entre rubros.</span>
        <small class="fin-dim">Hoy la API responde «Validar este gasto superaría el valor asignado al rubro. Se notificó a Gerencia.» Pendiente de decidir con la PO.</small></div>` : ""}
      ${esPend && puede && !propio ? `<label class="field" id="ff-motivo"><span>Motivo (obligatorio si lo rechazas)</span><textarea id="fin-motivo" rows="3" aria-describedby="fe-motivo"></textarea><small class="err" id="fe-motivo" hidden></small></label>` : ""}
    </section>`;
    el.querySelector(".sheet-body").innerHTML = `${navMovil}<div class="fin-val${movil ? " fin-val--movil" : ""}">${movil ? "" : listaHtml}${movil ? soporte + detalle : detalle + soporte}</div>`;
    // Footer.
    let foot;
    if (esPend && puede && !propio) {
      const bloqueo = !tieneId(g) ? "Completa el tipo y número de identificación del tercero antes de validar." : !g.soporte ? "Adjunta un soporte para poder validarlo." : "";
      foot = `${bloqueo ? `<p class="fin-foot-msg" id="fin-bloqueo">${bloqueo}</p>` : ""}<button type="button" class="btn" id="fin-rechazar">Rechazar</button>
        <button type="button" class="btn btn--primary" id="fin-validar" ${bloqueo ? 'disabled aria-describedby="fin-bloqueo"' : ""}>Validar gasto</button>`;
    } else {
      const msg = !esPend ? `Este gasto ya está ${ESTADO[g.estado][0].toLowerCase()}.` : propio && puede ? "No puedes validar un gasto que tú registraste." : "Solo consulta: validar o rechazar gastos le corresponde a Gerencia (y no a quien registró el gasto).";
      foot = `<p class="fin-foot-msg">${msg}</p><button type="button" class="btn" data-close>Cerrar</button>`;
    }
    const f = el.querySelector(".sheet-foot"); f.innerHTML = foot;
    f.querySelector("[data-close]")?.addEventListener("click", MH.closeSheet);
    // Bindings.
    const ir = (id) => { P.id = id; pintar(true); };
    el.querySelectorAll(".fin-val-item").forEach((b, i, all) => {
      b.addEventListener("click", () => ir(b.dataset.id));
      b.addEventListener("keydown", (e) => { if (!["ArrowDown", "ArrowUp"].includes(e.key)) return; e.preventDefault();
        const n = all[i + (e.key === "ArrowDown" ? 1 : -1)]; if (n) { ir(n.dataset.id); el.querySelector(`.fin-val-item[data-id="${CSS.escape(n.dataset.id)}"]`)?.focus(); } });
    });
    el.querySelector("#fin-prev")?.addEventListener("click", () => prev && ir(prev.id));
    el.querySelector("#fin-next")?.addEventListener("click", () => next && ir(next.id));
    el.querySelector("#fin-validar")?.addEventListener("click", () => validar(g, excede));
    el.querySelector("#fin-rechazar")?.addEventListener("click", () => rechazar(g));
    if (foco) el.querySelector("#fin-val-h").focus();
    el.querySelector(".sheet-body").scrollTop = 0;
  }

  function siguiente(idxAntes) {
    const pend = pendientes();
    if (!pend.length) { MH.closeSheet(); MH.toast("No quedan gastos por validar.", "info"); return; }
    P.id = pend[Math.min(idxAntes, pend.length - 1)].id; pintar(true);
  }
  function validar(g, excede) {
    const idx = pendientes().findIndex((x) => x.id === g.id);
    g.estado = "validado"; g.validadoPor = MH.persona(); g.superaAsignado = excede;
    registrar({ tipo: "validacion", gasto: g.id, texto: `${g.tercero} · ${MH.money(g.total)} · ${rubroTxt(g.rubro)}${excede ? " · validado por encima de lo asignado" : ""}.` });
    sync(); MH.render();
    MH.toast(`Gasto ${g.id} validado: ya cuenta en Ejecutado.`, "exito");
    siguiente(idx);
  }
  function rechazar(g) {
    const t = P.el.querySelector("#fin-motivo"), v = t.value.trim(), e = P.el.querySelector("#fe-motivo"), box = P.el.querySelector("#ff-motivo");
    const msg = !v ? "El motivo no puede estar vacío." : v.length > 500 ? "El motivo es demasiado largo." : "";
    e.textContent = msg; e.hidden = !msg; box.setAttribute("aria-invalid", msg ? "true" : "false"); t.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) { t.focus(); return; }
    const idx = pendientes().findIndex((x) => x.id === g.id);
    g.estado = "rechazado"; g.motivo = v;
    registrar({ tipo: "rechazo", gasto: g.id, motivo: v, texto: `${g.tercero} · ${MH.money(g.total)} · ${rubroTxt(g.rubro)}.` });
    sync(); MH.render();
    MH.toast(`Gasto ${g.id} rechazado. ${g.registro} recibirá el motivo.`, "info");
    siguiente(idx);
  }
})();
