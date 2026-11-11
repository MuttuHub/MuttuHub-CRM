/* Prototype shell: state, roles, navigation, shared UI (sheet/dialog, confirm, toast, ⓘ popover).
   Tab modules register MH.tabs[id] = { render(el, ctx) } — see README-modulos in the brief. */
(function () {
  const MH = (window.MH = window.MH || {});
  MH.tabs = MH.tabs || {};
  const TABS = [
    ["resumen", "Resumen"], ["actividades", "Actividades"], ["finanzas", "Finanzas"],
    ["documentos", "Documentos"], ["historial", "Historial"],
  ];
  MH.TABS = TABS;

  MH.ROLES = {
    gerencia: { label: "Gerencia (Mateo Salazar)", persona: "Mateo Salazar", gestor: true, miembro: false },
    coordinacion: { label: "Coordinación (Laura Jiménez)", persona: "Laura Jiménez", gestor: false, miembro: true },
    colaborador: { label: "Colaborador (Andrés Torres)", persona: "Andrés Torres", gestor: false, miembro: true },
    visualizador: { label: "Visualizador (solo consulta)", persona: "Visitante", gestor: false, miembro: false },
  };

  MH.state = { tab: "resumen", viewport: "escritorio", role: "gerencia", nav: {}, ui: {}, novedadesCerrado: false, pagina: "ficha" };
  MH.data = MH.seed();

  /* Permissions as the code enforces them today (src/lib/permissions.ts + API gates), simplified. */
  MH.can = function (accion) {
    const r = MH.ROLES[MH.state.role];
    const escribe = r.gestor || r.miembro;
    switch (accion) {
      case "registrarAvance": case "registrarGasto": case "registrarCantidad":
      case "anularAvance": case "subirDocumento": case "solicitarModificacion": case "adjuntarSoporte":
        return escribe;
      case "validarGasto": case "aprobarModificacion": case "cambiarEstado": case "editarDatos":
        return r.gestor;
      default: return false;
    }
  };
  MH.persona = () => MH.ROLES[MH.state.role].persona;
  /* Timestamp for new records: one minute after the newest registro entry (min 22:00 of the demo day),
     so actions taken in the prototype always read as the latest movement of 05 nov. */
  MH.ahora = function () {
    const last = MH.data.registro.reduce((m, e) => (e.cuando > m ? e.cuando : m), MH.data.hoy + "T21:59");
    const [d, t] = last.slice(0, 16).split("T"); let [h, mi] = t.split(":").map(Number); mi += 1;
    if (mi >= 60) { mi = 0; h = Math.min(h + 1, 23); }
    return `${d}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  };

  /* ---------- formatting ---------- */
  MH.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  MH.money = (n) => (n < 0 ? "−" : "") + "$ " + Math.abs(Math.round(n)).toLocaleString("es-CO");
  MH.pct = (n, d = 1) => n.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }) + " %";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  MH.fecha = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d} ${MESES[+m - 1]} ${y}`; };
  MH.fechaCorta = (iso) => { const [, m, d] = iso.slice(0, 10).split("-"); return `${d} ${MESES[+m - 1]}`; };
  MH.hora = (iso) => { let [h, mi] = iso.slice(11, 16).split(":").map(Number); const pm = h >= 12; h = h % 12 || 12; return `${h}:${String(mi).padStart(2, "0")} ${pm ? "p. m." : "a. m."}`; };
  MH.iniciales = (n) => n.split(/\s+/).slice(0, 2).map((p) => p[0]).join("");

  /* ---------- small HTML builders (return strings) ---------- */
  MH.pill = (text, kind = "muted") => `<span class="pill pill--${kind}">${text}</span>`;
  MH.info = (titulo, texto) => `<button type="button" class="info" data-info-title="${MH.esc(titulo)}" data-info-text="${MH.esc(texto)}" aria-label="Qué es ${MH.esc(titulo)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></button>`;
  MH.empty = (titulo, texto, accionHtml = "") => `<div class="empty"><b>${titulo}</b><span>${texto}</span>${accionHtml}</div>`;
  MH.icon = {
    abrir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    subir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M20 21H4"/></svg>',
  };

  /* ---------- navigation ---------- */
  MH.go = function (tab, nav = {}) {
    MH.state.tab = tab; MH.state.nav = nav; MH.state.pagina = "ficha";
    try { if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab); } catch (e) {}
    MH.render();
    const target = nav.focus && document.getElementById(nav.focus);
    if (target) { target.scrollIntoView({ block: "center", behavior: "smooth" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1600); }
    else document.querySelector(".app-scroll")?.scrollTo({ top: 0 });
  };
  MH.isMobile = () => document.querySelector(".app")?.clientWidth < 720;

  /* ---------- toast ---------- */
  MH.toast = function (msg, kind = "exito") {
    const host = document.querySelector(".toasts");
    const t = document.createElement("div");
    t.className = "toast toast--" + kind; t.setAttribute("role", "status"); t.textContent = msg;
    host.appendChild(t);
    while (host.children.length > 2) host.firstElementChild.remove(); // keep at most 2 visible
    setTimeout(() => t.remove(), 3600);
  };

  /* ---------- sheet / dialog ----------
     MH.openSheet({ title, subtitle, body, footer, size: "dialog"|"panel", onMount(el, close) })
     Desktop: centered dialog (or right panel for size "panel"). Mobile: bottom sheet.
     Escape and the ✕ close it; focus returns to the opener. */
  let lastOpener = null;
  MH.openSheet = function (o) {
    lastOpener = document.activeElement;
    const layer = document.querySelector(".layer");
    layer.innerHTML = `<div class="scrim" data-close></div>
      <section class="sheet sheet--${o.size || "dialog"}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <span class="grabber" aria-hidden="true"></span>
        <header class="sheet-head"><div><h2 id="sheet-title">${o.title}</h2>${o.subtitle ? `<p>${o.subtitle}</p>` : ""}</div>
          <button type="button" class="icon-btn" data-close aria-label="Cerrar">${MH.icon.cerrar}</button></header>
        <div class="sheet-body">${o.body || ""}</div>
        ${o.footer ? `<footer class="sheet-foot">${o.footer}</footer>` : ""}
      </section>`;
    layer.hidden = false;
    const el = layer.querySelector(".sheet");
    layer.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", MH.closeSheet));
    o.onMount && o.onMount(el, MH.closeSheet);
    (el.querySelector("input,select,textarea,button:not([data-close])") || el).focus();
  };
  MH.closeSheet = function () {
    const layer = document.querySelector(".layer");
    layer.hidden = true; layer.innerHTML = "";
    if (lastOpener && document.contains(lastOpener)) lastOpener.focus();
  };

  /* MH.confirm({ title, text, confirmLabel, danger, field: {label, required, id}, onConfirm(value) }) */
  MH.confirm = function (o) {
    const f = o.field;
    MH.openSheet({
      title: o.title,
      body: `<p class="lead">${o.text}</p>${f ? `<label class="field"><span>${f.label}</span><textarea id="confirm-field" rows="3"></textarea><small class="err" hidden></small></label>` : ""}`,
      footer: `<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn ${o.danger ? "btn--danger" : "btn--primary"}" id="confirm-ok">${o.confirmLabel || "Confirmar"}</button>`,
      onMount(el, close) {
        el.querySelector("[data-close].btn").addEventListener("click", close);
        el.querySelector("#confirm-ok").addEventListener("click", () => {
          const v = f ? el.querySelector("#confirm-field").value.trim() : null;
          if (f && f.required && !v) { const e = el.querySelector(".err"); e.textContent = f.error || "Este campo es obligatorio."; e.hidden = false; return; }
          close(); o.onConfirm && o.onConfirm(v);
        });
      },
    });
  };

  /* ---------- ⓘ popover (event delegation for any .info button) ---------- */
  function closeInfo() { document.querySelectorAll(".popover").forEach((p) => p.remove()); document.querySelectorAll(".info[aria-expanded=true]").forEach((b) => b.setAttribute("aria-expanded", "false")); }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".info");
    if (!b) { if (!e.target.closest(".popover")) closeInfo(); return; }
    const open = b.getAttribute("aria-expanded") === "true";
    closeInfo(); if (open) return;
    const device = document.querySelector(".device");
    const p = document.createElement("div");
    p.className = "popover"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", b.dataset.infoTitle);
    p.innerHTML = `<b>${b.dataset.infoTitle}</b><span>${b.dataset.infoText}</span>`;
    device.appendChild(p);
    const r = b.getBoundingClientRect(), d = device.getBoundingClientRect();
    const w = Math.min(300, d.width - 32);
    p.style.width = w + "px";
    p.style.left = Math.max(16, Math.min(r.left - d.left - 12, d.width - w - 16)) + "px";
    p.style.top = r.bottom - d.top + device.scrollTop + 8 + "px";
    b.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".popover")) { const b = document.querySelector(".info[aria-expanded=true]"); closeInfo(); b && b.focus(); return; }
    if (!document.querySelector(".layer").hidden) MH.closeSheet();
  });

  /* ---------- shell rendering ---------- */
  function header() {
    const p = MH.data.proyecto;
    const nov = MH.state.novedadesCerrado ? "" : `<div class="notice" role="status">
        ${MH.pill("Novedades", "info")}<span class="nov-larga">Desde el 05 nov cualquier integrante del equipo puede registrar avance, el historial muestra quién lo hizo y Finanzas habla en «% de lo programado».</span><span class="nov-corta">Cualquier integrante del equipo ya puede registrar avance.</span>
        <button type="button" class="link" data-act="ver-novedades">Ver qué cambió</button>
        <button type="button" class="icon-btn" data-act="cerrar-novedades" aria-label="Cerrar aviso de novedades">${MH.icon.cerrar}</button></div>`;
    const only = (MH.tabs[MH.state.tab] || {}).headerActions; // optional per-tab subset, e.g. ["registrar-gasto"]
    const show = (k) => !only || only.includes(k);
    const acciones = MH.can("registrarAvance")
      ? `${show("registrar-gasto") ? `<button type="button" class="btn${show("registrar-avance") ? "" : " btn--primary"}" data-act="registrar-gasto">Registrar gasto</button>` : ""}${show("registrar-avance") ? `<button type="button" class="btn btn--primary" data-act="registrar-avance">Registrar avance</button>` : ""}`
      : `<span class="readonly">Solo consulta: tu rol no registra avances ni gastos.</span>`;
    const menu = `<div class="menu-wrap"><button type="button" class="btn btn--icon" data-act="menu" aria-haspopup="menu" aria-expanded="${!!MH.state.ui.menu}" aria-label="Más acciones">⋯</button>
      ${MH.state.ui.menu ? `<div class="menu" role="menu">${MH.can("cambiarEstado") ? '<button role="menuitem" data-act="cambiar-estado">Cambiar estado</button>' : ""}<button role="menuitem" data-act="exportar">Exportar ficha</button></div>` : ""}</div>`;
    return `${nov}
      <div class="ficha-head">
        <div class="ficha-id"><button type="button" class="link back" data-act="volver">← Proyectos</button>
          <span class="mono">${p.codigo}</span><h1>${p.nombre} · ${p.estado}</h1>
          <span class="sub">${p.cliente} · Responsable: ${p.responsable}</span></div>
        <div class="ficha-actions">${acciones}${menu}</div>
      </div>
      <nav class="tabs" role="tablist" aria-label="Secciones del proyecto">${TABS.map(([id, label]) => {
        // The Visualizador does not receive gasto soportes (API rule), so count what the role can see.
        const docs = MH.data.documentos.filter((d) => MH.state.role !== "visualizador" || d.origen !== "gasto");
        const n = id === "documentos" ? ` · ${docs.length}` : "";
        return `<button type="button" role="tab" aria-selected="${MH.state.tab === id}" data-tab="${id}">${label}${n}</button>`;
      }).join("")}</nav>`;
  }

  function sidebar() {
    return `<aside class="side" aria-label="Menú principal"><div class="brand"><span class="logo">muttu</span><span class="hub">Hub</span></div>
      <span class="side-label">Operación</span>
      ${["Inicio", "Clientes", "Proyectos", "Tablero", "Documentos", "Reportes"].map((x) => `<a href="#" class="side-link${x === "Proyectos" ? " on" : ""}" data-act="nada">${x}</a>`).join("")}</aside>`;
  }

  MH.render = function () {
    const app = document.querySelector(".app");
    app.querySelector(".side-host").innerHTML = sidebar();
    const main = app.querySelector(".main");
    if (MH.state.pagina === "novedades" && MH.pages && MH.pages.novedades) {
      main.innerHTML = `<div class="page" id="page"></div>`;
      MH.pages.novedades(main.querySelector("#page"));
    } else {
      main.innerHTML = `<div class="ficha">${header()}<div class="tab-panel" role="tabpanel" id="panel"></div></div>`;
      const mod = MH.tabs[MH.state.tab];
      const panel = main.querySelector("#panel");
      if (mod) mod.render(panel, { nav: MH.state.nav }); else panel.innerHTML = MH.empty("Pestaña en construcción", "Este módulo del prototipo aún no está cargado.");
    }
    renderMobileBar();
    document.querySelectorAll(".seg [data-viewport]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.viewport === MH.state.viewport));
  };

  /* Sticky mobile bar: modules may set MH.state.mobileBar = html string during render; default = header actions. */
  function renderMobileBar() {
    const bar = document.querySelector(".mbar");
    let html = MH.state.mobileBar;
    MH.state.mobileBar = null;
    if (html === undefined || html === null) html = MH.state.pagina === "ficha" && MH.can("registrarAvance")
      ? `<button type="button" class="btn" data-act="registrar-gasto">Registrar gasto</button><button type="button" class="btn btn--primary" data-act="registrar-avance">Registrar avance</button>` : "";
    bar.innerHTML = html; bar.hidden = !html;
  }

  /* Global actions. Modules can add handlers: MH.actions["name"] = (btn, event) => {} */
  MH.actions = Object.assign(MH.actions || {}, {
    "cerrar-novedades": () => { MH.state.novedadesCerrado = true; MH.render(); MH.toast("Aviso cerrado. Puedes volver a ver las novedades desde el menú ⋯.", "info"); },
    "ver-novedades": () => { MH.state.pagina = "novedades"; MH.render(); document.querySelector(".app-scroll").scrollTo({ top: 0 }); },
    volver: () => MH.toast("En la app vuelve a la lista de proyectos. El prototipo cubre solo la ficha.", "info"),
    nada: () => MH.toast("Fuera del alcance del prototipo.", "info"),
    menu: () => { MH.state.ui.menu = !MH.state.ui.menu; MH.render(); },
    exportar: () => { MH.state.ui.menu = false; MH.render(); MH.toast("Exportar ficha: sin cambios respecto a hoy.", "info"); },
    "cambiar-estado": () => { MH.state.ui.menu = false; MH.render(); MH.toast("Cambiar estado: sin cambios respecto a hoy.", "info"); },
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t && t.closest(".tabs")) { MH.go(t.dataset.tab); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const fn = MH.actions[a.dataset.act];
    if (fn) { e.preventDefault(); if (a.dataset.act !== "menu") MH.state.ui.menu = false; fn(a, e); }
  });
  // Arrow keys move between tabs (roving focus as in the real Tabs component).
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest && e.target.closest(".tabs [role=tab]");
    if (!t || !["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const all = [...t.parentElement.children]; const i = all.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
    const n = all[(i + all.length) % all.length]; MH.go(n.dataset.tab); document.querySelector(`.tabs [data-tab=${n.dataset.tab}]`).focus();
  });

  /* ---------- prototype toolbar ---------- */
  function setViewport(v) {
    MH.state.viewport = v; document.querySelector(".stage").dataset.viewport = v; MH.render();
    try { localStorage.setItem("mh-proto-viewport", v); } catch (e) {}
  }
  window.addEventListener("DOMContentLoaded", () => {
    try { const v = localStorage.getItem("mh-proto-viewport"); if (v) MH.state.viewport = v; } catch (e) {}
    if (window.innerWidth < 720) MH.state.viewport = "movil";
    document.querySelector(".stage").dataset.viewport = MH.state.viewport;
    const h = location.hash.slice(1); if (TABS.some(([id]) => id === h)) MH.state.tab = h;
    document.querySelectorAll(".seg [data-viewport]").forEach((b) => b.addEventListener("click", () => setViewport(b.dataset.viewport)));
    const rol = document.getElementById("rol");
    rol.innerHTML = Object.entries(MH.ROLES).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join("");
    rol.value = MH.state.role;
    rol.addEventListener("change", () => { MH.state.role = rol.value; MH.render(); MH.toast("Ahora ves la ficha como " + MH.ROLES[rol.value].label + ".", "info"); });
    document.getElementById("reiniciar").addEventListener("click", () => { MH.data = MH.seed(); MH.state.novedadesCerrado = false; MH.state.ui = {}; MH.go(MH.state.tab); MH.toast("Datos demo restablecidos.", "info"); });
    window.addEventListener("hashchange", () => { const k = location.hash.slice(1); if (k !== MH.state.tab && TABS.some(([id]) => id === k)) MH.go(k); });
    MH.render();
  });
})();
