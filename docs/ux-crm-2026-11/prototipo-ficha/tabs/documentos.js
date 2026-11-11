/* Documentos tab: every support of the project in one list, grouped by origin, with search,
   «De dónde viene» links, «Subir documento» dialog (project documents only) and delete. */
(function () {
  const MH = (window.MH = window.MH || {});
  MH.tabs = MH.tabs || {};
  MH.actions = MH.actions || {};

  const GRUPOS = [
    { id: "entregable", chip: "Entregables", titulo: "Soportes de entregables" },
    { id: "gasto", chip: "Gastos", titulo: "Soportes de gastos" },
    { id: "indicador", chip: "Indicadores", titulo: "Soportes de indicadores" },
    { id: "proyecto", chip: "Del proyecto", titulo: "Documentos del proyecto" },
  ];
  const FORMATOS = ["pdf", "docx", "xlsx", "pptx", "jpg", "jpeg", "png"];
  const LIMITE_MB = 25;

  const ui = () => (MH.state.ui.documentos = MH.state.ui.documentos || { filtro: "todos", q: "" });

  /* Por definir con la PO (choice): a role that cannot register expenses does not receive expense supports
     (the API does not send them to the Visualizador); the «Gastos» chip stays visible with 0. */
  const veGastos = () => MH.can("registrarGasto");
  const visibles = () => MH.data.documentos.filter((d) => d.origen !== "gasto" || veGastos());

  const actividad = (cod) => MH.data.actividades.find((a) => a.codigo === cod);
  const gasto = (id) => MH.data.gastos.find((g) => g.id === id);
  const rubro = (cod) => MH.data.rubros.find((r) => r.codigo === cod);
  const entregable = (ref) => { for (const a of MH.data.actividades) { const e = (a.entregables || []).find((x) => x.codigo === ref); if (e) return { a, e }; } return null; };

  function textoBusqueda(d) {
    const partes = [d.nombre, d.ref, d.actividad, d.archivo];
    if (d.origen === "entregable" && d.ref) partes.push(d.ref.split("-").pop());
    return partes.filter(Boolean).join(" ").toLowerCase();
  }

  function estadoDoc(d) {
    if (d.origen !== "gasto") return "";
    const g = gasto(d.ref); if (!g) return "";
    if (g.estado === "rechazado") return MH.pill("Gasto rechazado", "destructivo");
    if (g.estado === "por_validar") {
      const r = rubro(g.rubro);
      if (r && r.ejecutado + g.total > r.asignado) return MH.pill("Supera lo asignado", "alerta");
    }
    return "";
  }

  function origenHtml(d) {
    if (d.origen === "entregable") {
      const x = entregable(d.ref);
      const a = (x && x.a) || actividad(d.actividad);
      if (!a) return `<span class="doc-origen"><b>Entregable ${MH.esc(d.ref || "")}</b><span>La actividad ya no existe.</span></span>`;
      const corto = x ? x.e.codigo.split("-").pop() : "";
      return `<span class="doc-origen"><button type="button" class="link" data-act="doc-ir-actividad" data-actividad="${a.codigo}" data-ref="${MH.esc(d.ref || "")}">${a.codigo} · ${MH.esc(a.nombre)}</button>
        <span>Entregable ${corto} · ${MH.esc(x ? x.e.nombre : d.ref)}</span></span>`;
    }
    if (d.origen === "gasto") {
      const g = gasto(d.ref);
      if (!g) return `<span class="doc-origen"><b>Gasto ${MH.esc(d.ref)}</b><span>El gasto ya no existe.</span></span>`;
      return `<span class="doc-origen"><button type="button" class="link" data-act="doc-ir-gasto" data-gasto="${g.id}">Gasto ${g.id} · ${MH.money(g.total)}</button>
        <span>${MH.esc(g.descripcion.replace(/\.$/, ""))}</span></span>`;
    }
    if (d.origen === "indicador") {
      const i = MH.data.indicadores.find((x) => x.codigo === d.ref);
      return `<span class="doc-origen"><button type="button" class="link" data-act="doc-ir-indicadores">Indicador ${MH.esc(d.ref || "")}</button>
        <span>${MH.esc(i ? i.nombre : "Medición del indicador")}</span></span>`;
    }
    return `<span class="doc-origen"><b>Del proyecto</b><span>${d.url ? "Enlace" : "Archivo"} subido con «Subir documento»</span></span>`;
  }

  const puedeEliminar = (d) => d.origen === "proyecto" && MH.can("subirDocumento") && (MH.can("editarDatos") || d.quien === MH.persona());

  function acciones(d) {
    const abrir = `<button type="button" class="btn btn--sm doc-abrir" data-act="doc-abrir" data-doc="${d.id}" aria-label="Abrir ${MH.esc(d.nombre)}">${MH.icon.abrir}<span>Abrir</span></button>`;
    const borrar = puedeEliminar(d)
      ? `<button type="button" class="icon-btn" data-act="doc-eliminar" data-doc="${d.id}" aria-label="Eliminar ${MH.esc(d.nombre)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>` : "";
    return `<div class="doc-acciones">${abrir}${borrar}</div>`;
  }

  const subio = (d) => `${MH.esc(d.quien)} · ${MH.fecha(d.fecha)}`;

  function tabla(docs) {
    return `<div class="table-wrap"><table class="doc-tabla"><thead><tr><th>Documento</th><th>De dónde viene</th><th>Estado</th><th>Subió</th><th><span class="doc-sr">Acciones</span></th></tr></thead>
      <tbody>${docs.map((d) => `<tr id="doc-${d.id}"><td><span class="doc-nombre">${MH.icon.doc}<b>${MH.esc(d.nombre)}</b></span></td><td>${origenHtml(d)}</td><td>${estadoDoc(d)}</td>
        <td class="doc-subio"><span>${MH.esc(d.quien)}</span><small>${MH.fecha(d.fecha)}</small></td><td class="doc-td-acc">${acciones(d)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function tarjetas(docs) {
    return `<ul class="doc-cards">${docs.map((d) => `<li class="doc-card" id="doc-${d.id}">
      <div class="doc-card-head"><span class="doc-nombre">${MH.icon.doc}<b>${MH.esc(d.nombre)}</b></span>${estadoDoc(d)}</div>
      ${origenHtml(d)}<small class="doc-meta">${subio(d)}</small>${acciones(d)}</li>`).join("")}</ul>`;
  }

  function explicacionVacios(vacios) {
    if (!vacios.length) return "";
    const nombres = vacios.map((g) => g.chip);
    const lista = nombres.length === 1 ? nombres[0] : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
    const verbo = nombres.length === 1 ? "no tiene" : "no tienen";
    const frases = vacios.map((g) => {
      if (g.id === "entregable") return "los soportes de entregables se adjuntan al registrar el avance en Actividades";
      if (g.id === "gasto") return veGastos() ? "los de gastos, al registrar el gasto en Finanzas" : "los de gastos no se muestran a tu rol";
      if (g.id === "indicador") return 'los soportes de las mediciones se adjuntan desde <button type="button" class="link" data-act="doc-ir-indicadores">Actividades › Indicadores</button>';
      return MH.can("subirDocumento") ? "los del proyecto (convenio, actas de inicio), con «Subir documento»" : "los del proyecto (convenio, actas de inicio) los sube el equipo del proyecto";
    });
    const cuerpo = frases.join("; ");
    return `<p class="doc-vacios"><b>${lista} ${verbo} documentos.</b> <span>${cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1)}.</span></p>`;
  }

  function lista(host) {
    const s = ui();
    const docs = visibles();
    const q = s.q.trim().toLowerCase();
    if (!MH.data.documentos.length) { host.innerHTML = MH.empty("Este proyecto todavía no tiene documentos.", "Los soportes aparecen aquí cuando se registran avances, gastos o mediciones.", MH.can("subirDocumento") ? '<button type="button" class="btn btn--primary" data-act="subir-documento">Subir documento</button>' : ""); return; }
    const grupos = GRUPOS.filter((g) => s.filtro === "todos" || s.filtro === g.id);
    const conDocs = grupos.map((g) => ({ g, docs: docs.filter((d) => d.origen === g.id && (!q || textoBusqueda(d).includes(q))) }));
    const enOrigen = (g) => docs.some((d) => d.origen === g.id);
    let html = "";
    if (q && conDocs.every((x) => !x.docs.length)) {
      html = MH.empty("No hay documentos con este filtro.", `Ningún documento coincide con «${MH.esc(s.q.trim())}».`, '<button type="button" class="btn btn--sm" data-act="doc-limpiar">Limpiar búsqueda</button>');
    } else {
      const movil = MH.isMobile();
      html = conDocs.filter((x) => x.docs.length).map(({ g, docs: ds }) => `<section class="doc-grupo" aria-labelledby="doc-g-${g.id}">
          <h3 id="doc-g-${g.id}" class="doc-grupo-titulo">${g.titulo} · ${ds.length}</h3>${movil ? tarjetas(ds) : tabla(ds)}</section>`).join("");
      html += explicacionVacios(grupos.filter((g) => !enOrigen(g)));
    }
    host.innerHTML = html;
  }

  MH.tabs.documentos = {
    render(el) {
      const s = ui();
      const docs = visibles();
      const cuenta = (id) => (id === "todos" ? docs.length : docs.filter((d) => d.origen === id).length);
      const chips = [{ id: "todos", chip: "Todos" }, ...GRUPOS].map((g) => `<button type="button" class="chip" aria-pressed="${s.filtro === g.id}" data-act="doc-filtro" data-filtro="${g.id}">${g.chip} · ${cuenta(g.id)}</button>`).join("");
      const puede = MH.can("subirDocumento");
      el.innerHTML = `<div class="doc">
        <div class="doc-head"><div><h2 class="doc-titulo">Documentos del proyecto ${MH.info("Qué documentos aparecen aquí", "Aquí ves todos los soportes del proyecto. Cada uno se sube desde donde nace: el avance de un entregable, un gasto o una medición. Usa «Subir documento» solo para los del proyecto, como el convenio o el acta de inicio.")}</h2>
          <p class="doc-sub">Los soportes de entregables, gastos, indicadores y del proyecto, en una sola lista.</p></div>
          ${puede ? `<button type="button" class="btn btn--primary doc-subir" data-act="subir-documento">${MH.icon.subir}Subir documento</button>` : ""}</div>
        <div class="doc-controles">
          <div class="doc-filtros"><span class="label" id="doc-filtros-l">Filtrar por origen</span><div class="chips" role="group" aria-labelledby="doc-filtros-l">${chips}</div></div>
          <label class="doc-buscar"><span class="doc-sr">Buscar por nombre o código</span>${MH.icon.buscar}<input type="search" id="doc-q" placeholder="Buscar por nombre o código" value="${MH.esc(s.q)}" autocomplete="off"></label>
        </div>
        <div class="doc-lista" aria-live="polite"></div></div>`;
      const host = el.querySelector(".doc-lista");
      lista(host);
      el.querySelector("#doc-q").addEventListener("input", (e) => { s.q = e.target.value; lista(host); });
      MH.state.mobileBar = puede ? `<button type="button" class="btn btn--primary" data-act="subir-documento">${MH.icon.subir}Subir documento</button>` : "";
    },
  };

  /* ---------- actions ---------- */
  Object.assign(MH.actions, {
    "doc-filtro": (b) => { ui().filtro = b.dataset.filtro; MH.render(); document.querySelector(`[data-act=doc-filtro][data-filtro="${b.dataset.filtro}"]`)?.focus(); },
    "doc-limpiar": () => { ui().q = ""; MH.render(); document.getElementById("doc-q")?.focus(); },
    "doc-ir-actividad": (b) => MH.go("actividades", { focus: "act-" + b.dataset.actividad, entregable: b.dataset.ref }),
    "doc-ir-gasto": (b) => MH.go("finanzas", { focus: "gasto-" + b.dataset.gasto }),
    "doc-ir-indicadores": () => MH.go("actividades", { focus: "act-indicadores" }),
    "doc-abrir": (b) => {
      const d = MH.data.documentos.find((x) => x.id === b.dataset.doc); if (!d) return;
      MH.toast(d.url ? `En la app se abre el enlace «${d.nombre}» en otra pestaña.` : `En la app se abre «${d.nombre}» en otra pestaña (enlace firmado; la apertura queda registrada).`, "info");
    },
    "doc-eliminar": (b) => {
      const d = MH.data.documentos.find((x) => x.id === b.dataset.doc); if (!d) return;
      MH.confirm({
        title: "Eliminar documento", text: `«${MH.esc(d.nombre)}» dejará de aparecer en la lista. El archivo queda en el almacenamiento.`,
        confirmLabel: "Eliminar", danger: true,
        onConfirm() {
          MH.data.documentos = MH.data.documentos.filter((x) => x.id !== d.id);
          MH.data.registro.unshift({ id: "r" + Date.now(), cuando: ahora(), quien: MH.persona(), tipo: "documento", accion: "eliminar", texto: d.nombre });
          MH.render(); MH.toast("Documento eliminado.");
        },
      });
    },
    "subir-documento": () => abrirSubir(),
  });

  function ahora() { return MH.ahora(); }

  /* ---------- Subir documento dialog ---------- */
  function abrirSubir() {
    if (!MH.can("subirDocumento")) { MH.toast("No tienes permiso para cambiar los documentos de este proyecto.", "error"); return; }
    MH.openSheet({
      title: "Subir documento",
      subtitle: "Adjunta un contrato, convenio o acta del proyecto como archivo o como enlace. Queda en el grupo «Del proyecto».",
      body: `<fieldset class="doc-tipo"><legend class="label">Tipo de documento</legend>
          <label class="doc-opcion"><input type="radio" name="doc-tipo" value="archivo" checked><span>Subir un archivo</span></label>
          <label class="doc-opcion"><input type="radio" name="doc-tipo" value="enlace"><span>Enlace</span></label></fieldset>
        <div class="field doc-f-archivo"><span id="doc-arch-l">Archivo</span>
          <div class="doc-selector"><button type="button" class="btn" id="doc-elegir" aria-describedby="doc-arch-nombre">Elegir archivo</button>
            <span id="doc-arch-nombre" class="doc-arch-nombre">Ningún archivo elegido</span></div>
          <input type="file" id="doc-file" class="doc-sr" tabindex="-1" aria-labelledby="doc-arch-l" accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png">
          <small>PDF, Word, Excel, PowerPoint, JPG o PNG; hasta ${LIMITE_MB} MB.</small></div>
        <div class="doc-f-enlace" hidden>
          <label class="field"><span>URL</span><input type="url" id="doc-url" placeholder="https://…" inputmode="url" maxlength="2000"></label>
          <label class="field"><span>Nombre del enlace</span><input type="text" id="doc-nombre" placeholder="Ej.: Convenio firmado"></label></div>
        <p class="err doc-err" role="alert" hidden></p>`,
      footer: `<button type="button" class="btn" id="doc-cancelar">Cancelar</button><button type="button" class="btn btn--primary" id="doc-enviar">Subir documento</button>`,
      onMount(el, close) {
        let archivo = null;
        const err = el.querySelector(".doc-err");
        const tipo = () => el.querySelector("input[name=doc-tipo]:checked").value;
        const fallo = (msg, campo) => {
          err.textContent = msg; err.hidden = !msg;
          el.querySelectorAll(".field").forEach((f) => f.removeAttribute("aria-invalid"));
          if (campo) campo.closest(".field")?.setAttribute("aria-invalid", "true");
        };
        el.querySelectorAll("input[name=doc-tipo]").forEach((r) => r.addEventListener("change", () => {
          el.querySelector(".doc-f-archivo").hidden = tipo() !== "archivo";
          el.querySelector(".doc-f-enlace").hidden = tipo() !== "enlace";
          fallo("");
        }));
        const file = el.querySelector("#doc-file");
        el.querySelector("#doc-elegir").addEventListener("click", () => file.click());
        file.addEventListener("change", () => {
          archivo = file.files[0] || null;
          el.querySelector("#doc-arch-nombre").textContent = archivo ? archivo.name : "Ningún archivo elegido";
          fallo("");
        });
        el.querySelector("#doc-cancelar").addEventListener("click", close);
        el.querySelector("#doc-enviar").addEventListener("click", () => {
          let doc;
          if (tipo() === "archivo") {
            const boton = el.querySelector("#doc-elegir");
            if (!archivo) return fallo("Selecciona el archivo.", boton);
            const ext = (archivo.name.split(".").pop() || "").toLowerCase();
            if (!archivo.name.includes(".") || !FORMATOS.includes(ext)) return fallo("Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.", boton);
            if (archivo.size > LIMITE_MB * 1024 * 1024) return fallo(`El archivo supera el límite de ${LIMITE_MB} MB.`, boton);
            if (MH.data.documentos.some((d) => d.archivo === archivo.name)) return fallo("Ese archivo ya está adjunto a un documento.", boton);
            doc = { nombre: archivo.name.replace(/\.[^.]+$/, ""), archivo: archivo.name };
          } else {
            const u = el.querySelector("#doc-url"), n = el.querySelector("#doc-nombre");
            const url = u.value.trim(), nombre = n.value.trim();
            if (!url || !nombre) return fallo("Completa el enlace y su nombre.", !url ? u : n);
            let ok = false; try { ok = new URL(url).protocol === "https:" && url.length <= 2000; } catch (e) { ok = false; }
            if (!ok) return fallo("El enlace debe ser una URL https válida (máximo 2000 caracteres).", u);
            doc = { nombre, url };
          }
          fallo("");
          const enviar = el.querySelector("#doc-enviar"), cancelar = el.querySelector("#doc-cancelar");
          enviar.disabled = cancelar.disabled = true; enviar.textContent = "Subiendo…";
          setTimeout(() => {
            if (!MH.can("subirDocumento")) { enviar.disabled = cancelar.disabled = false; enviar.textContent = "Subir documento"; return fallo("No tienes permiso para cambiar los documentos de este proyecto."); }
            const id = "dp" + Date.now();
            MH.data.documentos.unshift(Object.assign({ id, origen: "proyecto", quien: MH.persona(), fecha: MH.data.hoy }, doc));
            MH.data.registro.unshift({ id: "r" + Date.now(), cuando: ahora(), quien: MH.persona(), tipo: "documento", documento: id, texto: doc.nombre });
            close();
            const s = ui(); if (s.filtro !== "todos" && s.filtro !== "proyecto") s.filtro = "proyecto";
            s.q = "";
            if (MH.state.tab === "documentos") MH.go("documentos", { focus: "doc-" + id }); else MH.render();
            MH.toast(`«${doc.nombre}» quedó en Documentos del proyecto.`);
          }, 600);
        });
      },
    });
  }
})();
