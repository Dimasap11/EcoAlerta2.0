"use strict";
const $ = s => document.querySelector(s);
const ESTADOS = ["Reporte recibido", "Reporte en evaluación", "Asignado", "Reporte en ejecución", "Reporte atendido", "Cerrado"];
const ETIQUETA_PASO = ["Recibido", "Evaluación", "Asignado", "Ejecución", "Atendido", "Cerrado"];

/* ---------- utilidades ---------- */
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fecha = iso => new Date(iso).toLocaleString("es-DO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const fechaCorta = iso => new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short" });

function grupoEstado(e) {
  if (e === "Reporte recibido") return "recibido";
  if (e === "Reporte atendido") return "atendido";
  if (e === "Cerrado") return "cerrado";
  return "proceso";
}
// "Calle X, Moca, República Dominicana" -> Calle X / Moca
function lugar(u) {
  const p = String(u).split(",").map(x => x.trim());
  return esc(p[0]) + (p.length > 1 ? `<small>${esc(p[1])}</small>` : "");
}
// Límites aproximados de República Dominicana (deben coincidir con db.js).
const RD = { latMin: 17.36, latMax: 19.95, lngMin: -72.01, lngMax: -68.32 };
const dentroDeRD = (lat, lng) => lat >= RD.latMin && lat <= RD.latMax && lng >= RD.lngMin && lng <= RD.lngMax;
const enlaceMapa = (lat, lng) => lat == null ? "" :
  `<a class="map-link" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}" target="_blank" rel="noopener">Ver en el mapa ↗</a>`;
const badgeEstado = e => `<span class="badge st-${grupoEstado(e)}">${esc(e)}</span>`;
const badgePrioridad = p => `<span class="badge pr-${esc(String(p).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))}">${esc(p)}</span>`;

function toast(msg, tipo = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.innerHTML = `<span class="toast-ic">${tipo === "error" ? "!" : "✓"}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
}

async function api(url, opt = {}) {
  const r = await fetch(url, opt);
  let d; try { d = await r.json(); } catch { d = { error: "Respuesta inválida del servidor." }; }
  if (!r.ok) throw Object.assign(new Error(d.error || "Ocurrió un error."), { status: r.status });
  return d;
}

/* ---------- modales ---------- */
const abrir = id => { $(id).classList.add("show"); document.body.classList.add("no-scroll"); };
function cerrar(m) {
  m.classList.remove("show");
  if (!document.querySelector(".modal.show")) document.body.classList.remove("no-scroll");
}
document.querySelectorAll(".modal .x").forEach(x => x.addEventListener("click", () => cerrar(x.closest(".modal"))));
document.querySelectorAll(".modal:not(.full)").forEach(m => m.addEventListener("click", e => { if (e.target === m) cerrar(m); }));
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const abiertos = [...document.querySelectorAll(".modal.show")];
  if (abiertos.length) cerrar(abiertos[abiertos.length - 1]);
});

/* ---------- mapa (aislado: si falla, el resto de la app sigue funcionando) ---------- */
let map = null, capaPuntos = null;
const COLORES = { recibido: "#3b82f6", proceso: "#f59e0b", atendido: "#16a34a", cerrado: "#16a34a" };

function iniciarMapa() {
  const cont = $("#map");
  if (typeof L === "undefined") { cont.innerHTML = '<div class="map-fallback">El mapa no está disponible en este momento.</div>'; return; }
  try {
    cont.innerHTML = "";
    map = L.map(cont, { scrollWheelZoom: false }).setView([19.3936, -70.5256], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(map);
    capaPuntos = L.layerGroup().addTo(map);
    cargarMapa(true);
  } catch (e) { console.error(e); cont.innerHTML = '<div class="map-fallback">El mapa no está disponible en este momento.</div>'; }
}

async function cargarMapa(ajustar = false) {
  if (!map) return;
  try {
    const puntos = await api("/api/mapa");
    capaPuntos.clearLayers();
    puntos.forEach(p => {
      const g = grupoEstado(p.estado);
      L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: COLORES[g], fillOpacity: .95 })
        .bindPopup(`<div class="pop"><b>${esc(p.codigo)}</b><span>${esc(p.tipo)}</span><small>${esc(p.ubicacion.split(",").slice(0, 2).join(","))}</small>${badgeEstado(p.estado)}</div>`)
        .addTo(capaPuntos);
    });
    // Vista inicial sobre la zona con más reportes, para que los puntos no queden encimados.
    if (ajustar && puntos.length) {
      const cerca = (a, b) => Math.abs(a.lat - b.lat) < .05 && Math.abs(a.lng - b.lng) < .05;
      const centro = puntos.reduce((m, p) => {
        const n = puntos.filter(q => cerca(p, q)).length; return n > m.n ? { p, n } : m;
      }, { p: puntos[0], n: 0 }).p;
      const zona = puntos.filter(q => cerca(centro, q));
      map.fitBounds(L.latLngBounds(zona.map(p => [p.lat, p.lng])), { padding: [50, 50], maxZoom: 16 });
    }
  } catch (e) { console.error(e); }
}

async function cargarResumen() {
  try {
    const r = await api("/api/resumen");
    $("#resTotal").textContent = r.total;
    $("#resAtendidos").textContent = r.atendidos;
    $("#resTasa").textContent = r.total ? Math.round(r.atendidos / r.total * 100) + "%" : "—";
  } catch { /* indicadores opcionales */ }
}

/* ---------- selector de ubicación ---------- */
let picker = null, pin = null;
const pinIcon = () => L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [28, 38], iconAnchor: [14, 36] });

function marcarUbicacion(lat, lng, origen) {
  if (!dentroDeRD(lat, lng)) { toast("El punto debe estar dentro de República Dominicana.", "error"); return; }
  $("#lat").value = lat.toFixed(6); $("#lng").value = lng.toFixed(6);
  $("#pickerMap").classList.remove("invalid");
  if (picker) {
    if (pin) pin.setLatLng([lat, lng]);
    else {
      pin = L.marker([lat, lng], { icon: pinIcon(), draggable: true }).addTo(picker);
      pin.on("dragend", () => { const p = pin.getLatLng(); marcarUbicacion(p.lat, p.lng, "arrastre"); });
    }
    if (origen === "gps") picker.setView([lat, lng], 17);
  }
  $("#pickerStatus").innerHTML = `<b>Ubicación marcada</b> · ${lat.toFixed(5)}, ${lng.toFixed(5)} <span class="muted">(puedes arrastrar el pin para ajustarla)</span>`;
  $("#pickerStatus").classList.add("ok");
}
function limpiarUbicacion() {
  $("#lat").value = ""; $("#lng").value = "";
  if (pin) { pin.remove(); pin = null; }
  $("#pickerStatus").textContent = "Toca el mapa para marcar el lugar exacto de la incidencia.";
  $("#pickerStatus").classList.remove("ok");
}
function iniciarSelector() {
  const cont = $("#pickerMap");
  if (typeof L === "undefined") { cont.innerHTML = '<div class="map-fallback">Mapa no disponible. Usa el botón "Usar mi ubicación".</div>'; return; }
  try {
    cont.innerHTML = "";
    picker = L.map(cont, { scrollWheelZoom: false, maxBounds: [[RD.latMin - .3, RD.lngMin - .3], [RD.latMax + .3, RD.lngMax + .3]], minZoom: 7 })
      .setView([19.3936, -70.5256], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(picker);
    picker.on("click", e => marcarUbicacion(e.latlng.lat, e.latlng.lng, "clic"));
  } catch (e) { console.error(e); cont.innerHTML = '<div class="map-fallback">Mapa no disponible. Usa el botón "Usar mi ubicación".</div>'; }
}
$("#miUbicacion").onclick = () => {
  if (!navigator.geolocation) return toast("Tu navegador no permite obtener la ubicación.", "error");
  const btn = $("#miUbicacion"); btn.disabled = true; btn.textContent = "Buscando…";
  navigator.geolocation.getCurrentPosition(
    p => { btn.disabled = false; btn.textContent = "📍 Usar mi ubicación"; marcarUbicacion(p.coords.latitude, p.coords.longitude, "gps"); },
    err => {
      btn.disabled = false; btn.textContent = "📍 Usar mi ubicación";
      toast(err.code === 1 ? "Permiso de ubicación denegado. Marca el punto en el mapa." : "No se pudo obtener tu ubicación. Marca el punto en el mapa.", "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
};

/* ---------- formulario ciudadano ---------- */
const fotoInput = $("#foto");
fotoInput.addEventListener("change", () => {
  const f = fotoInput.files[0], prev = $("#fotoPreview");
  if (!f) { $("#fotoNombre").textContent = "Seleccionar una foto"; prev.hidden = true; return; }
  if (f.size > 5 * 1024 * 1024) { toast("La foto no puede pesar más de 5 MB.", "error"); fotoInput.value = ""; return fotoInput.dispatchEvent(new Event("change")); }
  $("#fotoNombre").textContent = f.name;
  prev.src = URL.createObjectURL(f); prev.hidden = false;
});

$("#reporteForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  form.querySelectorAll(".invalid").forEach(x => x.classList.remove("invalid"));
  const faltan = [...form.querySelectorAll("[required]")].filter(x => !x.value.trim() || (x.type === "email" && !x.checkValidity()));
  const sinPunto = !$("#lat").value;
  if (sinPunto) $("#pickerMap").classList.add("invalid");
  if (faltan.length || sinPunto) {
    faltan.forEach(x => x.classList.add("invalid"));
    (faltan[0] || $("#pickerMap")).focus();
    return toast(faltan.length ? "Revisa los campos marcados en rojo." : "Marca en el mapa dónde está la incidencia.", "error");
  }
  const btn = $("#enviarBtn"); btn.disabled = true; btn.textContent = "Enviando…";
  try {
    const d = await api("/api/reportes", { method: "POST", body: new FormData(form) });
    $("#codigoGenerado").textContent = d.codigo;
    try { localStorage.setItem("ecoUltimoCodigo", d.codigo); } catch {}
    form.reset(); fotoInput.dispatchEvent(new Event("change")); limpiarUbicacion();
    abrir("#ticketModal");
    cargarMapa(); cargarResumen();
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Enviar reporte"; }
});
$("#reporteForm").addEventListener("input", e => e.target.classList.remove("invalid"));

$("#copiarCodigo").onclick = async () => {
  const c = $("#codigoGenerado").textContent;
  try { await navigator.clipboard.writeText(c); toast("Código copiado."); }
  catch { toast("Copia el código manualmente: " + c, "error"); }
};
$("#verSeguimiento").onclick = () => { cerrar($("#ticketModal")); abrirSeguimiento($("#codigoGenerado").textContent); };

/* ---------- seguimiento ---------- */
function abrirSeguimiento(codigo) {
  let ultimo = ""; try { ultimo = localStorage.getItem("ecoUltimoCodigo") || ""; } catch {}
  $("#codigoBusqueda").value = codigo || ultimo;
  $("#detalleTicket").innerHTML = "";
  abrir("#seguimientoModal");
  if (codigo) cargarTicket(codigo); else $("#codigoBusqueda").focus();
}
$("#btnSeguimiento").onclick = () => abrirSeguimiento();
$("#ctaSeguimiento").onclick = () => abrirSeguimiento();
$("#buscarForm").addEventListener("submit", e => { e.preventDefault(); cargarTicket($("#codigoBusqueda").value.trim()); });

function progreso(estado) {
  const idx = ESTADOS.indexOf(estado);
  return `<ol class="progress">${ETIQUETA_PASO.map((n, i) =>
    `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span>${i < idx ? "✓" : i + 1}</span><small>${n}</small></li>`).join("")}</ol>`;
}
function linea(historial) {
  return `<ul class="timeline">${[...historial].reverse().map(h =>
    `<li><div class="tl-head">${badgeEstado(h.estado)}<time>${fecha(h.fecha)}</time></div>${h.observacion ? `<p>${esc(h.observacion)}</p>` : ""}</li>`).join("")}</ul>`;
}

async function cargarTicket(c) {
  if (!c) return toast("Escribe un código de seguimiento.", "error");
  try {
    const d = await api("/api/reportes/" + encodeURIComponent(c));
    $("#detalleTicket").innerHTML = `
      <div class="ticket-head"><div><small class="muted">Código</small><h3>${esc(d.codigo)}</h3></div>${badgeEstado(d.estado_actual)}</div>
      ${progreso(d.estado_actual)}
      <dl class="facts">
        <div><dt>Tipo</dt><dd>${esc(d.tipo)}</dd></div>
        <div><dt>Prioridad</dt><dd>${badgePrioridad(d.prioridad)}</dd></div>
        <div class="wide"><dt>Ubicación</dt><dd>${esc(d.ubicacion)} ${enlaceMapa(d.lat, d.lng)}</dd></div>
        <div><dt>Registrado</dt><dd>${fecha(d.fecha_creacion)}</dd></div>
      </dl>
      <h4>Historial del caso</h4>${linea(d.historial)}`;
  } catch (e) { $("#detalleTicket").innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}

/* ---------- administración ---------- */
$("#btnAdmin").onclick = async () => {
  try {
    const s = await api("/api/admin/session");
    if (s.authenticated) abrirAdmin(s.usuario);
    else { $("#loginError").textContent = ""; abrir("#loginModal"); $("#loginUsuario").focus(); }
  } catch (e) { toast(e.message, "error"); }
};
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const r = await api("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: $("#loginUsuario").value, password: $("#loginPassword").value }) });
    $("#loginError").textContent = ""; $("#loginPassword").value = "";
    cerrar($("#loginModal")); abrirAdmin(r.usuario);
  } catch (err) { $("#loginError").textContent = err.message; }
});
function abrirAdmin(usuario) {
  $("#adminUsuario").textContent = usuario || "admin";
  abrir("#adminModal"); cargarAdmin();
}
$("#cerrarAdmin").onclick = () => { cerrar($("#adminModal")); cargarMapa(); cargarResumen(); };
$("#logoutBtn").onclick = async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch {}
  cerrar($("#adminModal")); limpiarDetalle(); toast("Sesión cerrada.");
};

let seleccionado = null, tFiltro = null;
$("#filtroQ").addEventListener("input", () => { clearTimeout(tFiltro); tFiltro = setTimeout(cargarAdmin, 250); });
$("#filtroEstado").addEventListener("change", cargarAdmin);
$("#filtroPrioridad").addEventListener("change", cargarAdmin);
$("#limpiarFiltros").onclick = () => { $("#filtroQ").value = ""; $("#filtroEstado").value = ""; $("#filtroPrioridad").value = ""; cargarAdmin(); };

async function cargarAdmin() {
  try {
    const q = new URLSearchParams();
    if ($("#filtroQ").value.trim()) q.set("q", $("#filtroQ").value.trim());
    if ($("#filtroEstado").value) q.set("estado", $("#filtroEstado").value);
    if ($("#filtroPrioridad").value) q.set("prioridad", $("#filtroPrioridad").value);
    const [rows, s] = await Promise.all([api("/api/admin/reportes?" + q), api("/api/admin/estadisticas")]);
    $("#stats").innerHTML = [
      ["Total de reportes", s.total, "total"], ["Pendientes", s.pendientes, "recibido"], ["En proceso", s.proceso, "proceso"],
      ["Atendidos", s.atendidos, "atendido"], ["Prioridad alta sin cerrar", s.criticos, "critico"]
    ].map(([n, v, c]) => `<div class="stat ${c}"><span>${n}</span><strong>${v}</strong></div>`).join("");
    $("#conteo").textContent = rows.length + (rows.length === 1 ? " resultado" : " resultados");
    $("#tablaReportes").innerHTML = rows.length ? `<table class="report-table"><thead><tr><th>Código</th><th>Tipo</th><th>Ubicación</th><th>Estado</th><th>Prioridad</th><th>Fecha</th></tr></thead><tbody>${rows.map(r =>
      `<tr data-codigo="${esc(r.codigo)}" tabindex="0" class="${r.codigo === seleccionado ? "sel" : ""}"><td class="code">${esc(r.codigo)}</td><td>${esc(r.tipo)}</td><td>${lugar(r.ubicacion)}</td><td>${badgeEstado(r.estado_actual)}</td><td>${badgePrioridad(r.prioridad)}</td><td class="nowrap">${fechaCorta(r.fecha_creacion)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty-state">No hay reportes con esos filtros.</div>`;
  } catch (e) {
    if (e.status === 401) { cerrar($("#adminModal")); abrir("#loginModal"); }
    else toast(e.message, "error");
  }
}
$("#tablaReportes").addEventListener("click", e => { const tr = e.target.closest("tr[data-codigo]"); if (tr) seleccionar(tr.dataset.codigo); });
$("#tablaReportes").addEventListener("keydown", e => { const tr = e.target.closest("tr[data-codigo]"); if (tr && e.key === "Enter") seleccionar(tr.dataset.codigo); });

function limpiarDetalle() {
  seleccionado = null; $("#gestionForm").hidden = true;
  $("#detalleAdmin").className = "detail-empty";
  $("#detalleAdmin").textContent = "Selecciona un reporte de la lista para ver su detalle y actualizarlo.";
}

async function seleccionar(c) {
  try {
    const d = await api("/api/admin/reportes/" + encodeURIComponent(c));
    seleccionado = d.codigo;
    document.querySelectorAll("#tablaReportes tr.sel").forEach(x => x.classList.remove("sel"));
    document.querySelector(`#tablaReportes tr[data-codigo="${CSS.escape(d.codigo)}"]`)?.classList.add("sel");
    $("#adminCodigo").value = d.codigo; $("#adminEstado").value = d.estado_actual;
    $("#adminPrioridad").value = d.prioridad; $("#adminResponsable").value = d.responsable || "";
    $("#adminObservacion").value = "";
    $("#detalleAdmin").className = "detail";
    $("#detalleAdmin").innerHTML = `
      <div class="ticket-head"><div><small class="muted">Código</small><h3>${esc(d.codigo)}</h3></div><div class="badges">${badgeEstado(d.estado_actual)}${badgePrioridad(d.prioridad)}</div></div>
      <dl class="facts">
        <div><dt>Ciudadano</dt><dd>${esc(d.nombre)}</dd></div>
        <div><dt>Contacto</dt><dd>${esc(d.email)}${d.telefono ? `<br>${esc(d.telefono)}` : ""}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(d.tipo)}</dd></div>
        <div><dt>Responsable</dt><dd>${esc(d.responsable || "Sin asignar")}</dd></div>
        <div class="wide"><dt>Ubicación</dt><dd>${esc(d.ubicacion)} ${enlaceMapa(d.lat, d.lng)}</dd></div>
        ${d.descripcion ? `<div class="wide"><dt>Descripción</dt><dd>${esc(d.descripcion)}</dd></div>` : ""}
      </dl>
      ${d.foto ? `<img class="evidence" src="${esc(d.foto)}" alt="Evidencia del reporte">` : `<div class="no-photo">Sin evidencia fotográfica</div>`}
      <details class="hist" open><summary>Historial (${d.historial.length})</summary>${linea(d.historial)}</details>`;
    $("#gestionForm").hidden = false;
  } catch (e) { toast(e.message, "error"); }
}

$("#gestionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const c = $("#adminCodigo").value; if (!c) return;
  const btn = $("#guardarGestion"); btn.disabled = true;
  try {
    await api("/api/admin/reportes/" + encodeURIComponent(c), { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: $("#adminEstado").value, prioridad: $("#adminPrioridad").value, responsable: $("#adminResponsable").value, observacion: $("#adminObservacion").value }) });
    await cargarAdmin(); await seleccionar(c);
    toast("Reporte " + c + " actualizado.");
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; }
});

/* ---------- inicio ---------- */
iniciarMapa();
iniciarSelector();
cargarResumen();
