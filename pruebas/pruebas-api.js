// Pruebas automatizadas de la API de EcoAlerta.
// Levanta el servidor en un puerto aparte con una base de datos temporal,
// ejecuta los casos de prueba y muestra resultado esperado vs. obtenido.
// Uso: npm test
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const raiz = path.join(__dirname, "..");
const dbTemp = path.join(os.tmpdir(), `ecoalerta-pruebas-${Date.now()}.db`);
const resultados = [];
const fotosCreadas = [];
let cookie = "";

// Imagen PNG mínima válida (1x1 px) para las pruebas de evidencia fotográfica.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function formulario(campos, archivo) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  if (archivo) fd.append("foto", new Blob([archivo.datos], { type: archivo.tipo }), archivo.nombre);
  return fd;
}
const valido = {
  nombre: "Prueba Automatizada", email: "prueba@correo.com", telefono: "809-000-0000",
  tipo: "Acumulación de basura", ubicacion: "Frente al parque, Moca", descripcion: "Caso de prueba",
  lat: "19.3936", lng: "-70.5256"
};

async function pedir(ruta, opt = {}) {
  const r = await fetch(BASE + ruta, { ...opt, headers: { ...(opt.headers || {}), ...(cookie ? { cookie } : {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  let cuerpo = null; try { cuerpo = await r.json(); } catch {}
  return { status: r.status, cuerpo };
}
const json = (metodo, cuerpo) => ({ method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

async function caso(id, req, descripcion, esperado, fn) {
  let obtenido, ok;
  try { [ok, obtenido] = await fn(); } catch (e) { ok = false; obtenido = "Excepción: " + e.message; }
  resultados.push({ id, req, descripcion, esperado, obtenido, resultado: ok ? "Aprobado" : "Fallido" });
}

async function ejecutar() {
  let codigo;

  await caso("CP-01", "RF-02, RF-03, RF-05", "Registrar un reporte válido con fotografía", "HTTP 200 y código con formato EA-##########", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario(valido, { datos: PNG, tipo: "image/png", nombre: "evidencia.png" }) });
    codigo = r.cuerpo?.codigo;
    return [r.status === 200 && /^EA-\d{10}$/.test(codigo || ""), `HTTP ${r.status}, código ${codigo}`];
  });
  await caso("CP-02", "RF-02", "Registrar sin nombre ni correo", "HTTP 400 con mensaje de campos obligatorios", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario({ ...valido, nombre: "", email: "" }) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-03", "RF-05", "Registrar con un tipo de residuo inexistente", "HTTP 400, tipo no válido", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario({ ...valido, tipo: "Inventado" }) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-04", "RF-04", "Registrar con coordenadas fuera de República Dominicana", "HTTP 400, punto fuera del país", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario({ ...valido, lat: "40.71", lng: "-74.00" }) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-05", "RF-04", "Registrar sin coordenadas", "HTTP 400, se exige ubicación en el mapa", async () => {
    const { lat, lng, ...sinCoords } = valido;
    const r = await pedir("/api/reportes", { method: "POST", body: formulario(sinCoords) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-06", "RF-03", "Adjuntar un archivo que no es imagen", "HTTP 400, la evidencia debe ser imagen", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario(valido, { datos: Buffer.from("texto"), tipo: "text/plain", nombre: "nota.txt" }) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-07", "RF-03", "Adjuntar una imagen mayor de 5 MB", "HTTP 400, límite de 5 MB", async () => {
    const r = await pedir("/api/reportes", { method: "POST", body: formulario(valido, { datos: Buffer.alloc(5 * 1024 * 1024 + 10), tipo: "image/png", nombre: "grande.png" }) });
    return [r.status === 400, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-08", "RF-09", "Consultar el reporte por su código (vista pública)", "HTTP 200, estado e historial; sin nombre ni correo", async () => {
    const r = await pedir("/api/reportes/" + codigo);
    const privado = r.cuerpo && ("email" in r.cuerpo || "nombre" in r.cuerpo);
    return [r.status === 200 && r.cuerpo.historial?.length === 1 && !privado, `HTTP ${r.status}, estado "${r.cuerpo?.estado_actual}", ${r.cuerpo?.historial?.length} evento(s), datos personales expuestos: ${privado ? "sí" : "no"}`];
  });
  await caso("CP-09", "RF-09", "Consultar un código inexistente", "HTTP 404 con mensaje claro", async () => {
    const r = await pedir("/api/reportes/EA-0000000000");
    return [r.status === 404, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-10", "RF-09", "Consultar el código escrito en minúsculas", "HTTP 200 (no distingue mayúsculas)", async () => {
    const r = await pedir("/api/reportes/" + codigo.toLowerCase());
    return [r.status === 200, `HTTP ${r.status}`];
  });
  await caso("CP-11", "RF-07", "El mapa público incluye el reporte con sus coordenadas", "El código aparece con lat 19.3936 y lng -70.5256", async () => {
    const r = await pedir("/api/mapa");
    const p = r.cuerpo.find(x => x.codigo === codigo);
    return [!!p && p.lat === 19.3936 && p.lng === -70.5256, p ? `Encontrado en (${p.lat}, ${p.lng})` : "No encontrado"];
  });
  await caso("CP-12", "RF-17, RNF-04", "Acceder al panel sin iniciar sesión", "HTTP 401", async () => {
    const r = await pedir("/api/admin/reportes");
    return [r.status === 401, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-13", "RNF-04", "Iniciar sesión con contraseña incorrecta", "HTTP 401", async () => {
    const r = await pedir("/api/admin/login", json("POST", { usuario: "admin", password: "incorrecta" }));
    return [r.status === 401, `HTTP ${r.status}: ${r.cuerpo?.error}`];
  });
  await caso("CP-14", "RF-17", "Iniciar sesión con credenciales correctas", "HTTP 200 y sesión activa", async () => {
    const r = await pedir("/api/admin/login", json("POST", { usuario: "admin", password: process.env.ECO_ADMIN_PASS || "EcoAlerta2026!" }));
    const s = await pedir("/api/admin/session");
    return [r.status === 200 && s.cuerpo.authenticated, `HTTP ${r.status}, sesión activa: ${s.cuerpo.authenticated}`];
  });
  await caso("CP-15", "RF-10, RF-17", "Listar reportes en el panel y ver el detalle completo", "El reporte aparece con nombre, correo y fotografía", async () => {
    const lista = await pedir("/api/admin/reportes");
    const d = await pedir("/api/admin/reportes/" + codigo);
    if (d.cuerpo?.foto) fotosCreadas.push(d.cuerpo.foto);
    return [lista.cuerpo.some(x => x.codigo === codigo) && d.cuerpo.email === valido.email && !!d.cuerpo.foto, `En lista: sí, correo: ${d.cuerpo?.email}, foto: ${d.cuerpo?.foto ? "sí" : "no"}`];
  });
  await caso("CP-16", "RF-11", "Cambiar estado, prioridad y responsable con observación", "HTTP 200 y nuevo evento en el historial", async () => {
    const r = await pedir("/api/admin/reportes/" + codigo, json("PUT", { estado: "Asignado", prioridad: "Alta", responsable: "Brigada de prueba", observacion: "Asignado en prueba" }));
    const d = await pedir("/api/admin/reportes/" + codigo);
    return [r.status === 200 && d.cuerpo.estado_actual === "Asignado" && d.cuerpo.prioridad === "Alta" && d.cuerpo.historial.length === 2, `HTTP ${r.status}, estado "${d.cuerpo.estado_actual}", prioridad "${d.cuerpo.prioridad}", ${d.cuerpo.historial.length} eventos`];
  });
  await caso("CP-17", "RF-11, RNF-06", "Enviar un estado que no existe", "HTTP 400; el reporte no cambia", async () => {
    const r = await pedir("/api/admin/reportes/" + codigo, json("PUT", { estado: "Borrado" }));
    const d = await pedir("/api/admin/reportes/" + codigo);
    return [r.status === 400 && d.cuerpo.estado_actual === "Asignado", `HTTP ${r.status}, estado sigue "${d.cuerpo.estado_actual}"`];
  });
  await caso("CP-18", "RF-09", "El ciudadano ve el cambio en su seguimiento", "Estado \"Asignado\" y 2 eventos en el historial", async () => {
    const r = await pedir("/api/reportes/" + codigo);
    return [r.cuerpo.estado_actual === "Asignado" && r.cuerpo.historial.length === 2, `Estado "${r.cuerpo.estado_actual}", ${r.cuerpo.historial.length} eventos`];
  });
  await caso("CP-19", "RF-10", "Filtrar el panel por estado y prioridad", "Solo devuelve reportes que cumplen ambos filtros", async () => {
    const r = await pedir("/api/admin/reportes?estado=Asignado&prioridad=Alta");
    const otro = await pedir("/api/admin/reportes?estado=Cerrado");
    return [r.cuerpo.length === 1 && otro.cuerpo.length === 0, `Asignado+Alta: ${r.cuerpo.length}, Cerrado: ${otro.cuerpo.length}`];
  });
  await caso("CP-20", "RF-16", "Indicadores del panel", "Total 1, en proceso 1, prioridad alta sin cerrar 1", async () => {
    const r = await pedir("/api/admin/estadisticas");
    const s = r.cuerpo;
    return [s.total === 1 && s.proceso === 1 && s.criticos === 1, `Total ${s.total}, en proceso ${s.proceso}, críticos ${s.criticos}`];
  });
  await caso("CP-21", "RNF-04", "Cerrar sesión impide volver al panel", "HTTP 401 después del cierre", async () => {
    await pedir("/api/admin/logout", { method: "POST" });
    const r = await pedir("/api/admin/reportes");
    return [r.status === 401, `HTTP ${r.status}`];
  });
}

function esperarServidor(proc) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("El servidor no inició a tiempo")), 10000);
    proc.stdout.on("data", d => { if (String(d).includes("disponible")) { clearTimeout(t); ok(); } });
    proc.on("exit", c => { clearTimeout(t); mal(new Error("El servidor terminó con código " + c)); });
  });
}

(async () => {
  const servidor = spawn(process.execPath, ["server.js"], { cwd: raiz, env: { ...process.env, PORT, ECO_DB: dbTemp }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await esperarServidor(servidor);
    await ejecutar();
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally {
    servidor.kill();
    for (const f of fotosCreadasSeguras()) { try { fs.unlinkSync(path.join(raiz, "public", f)); } catch {} }
    for (const suf of ["", "-wal", "-shm"]) { try { fs.unlinkSync(dbTemp + suf); } catch {} }
  }
  const aprobados = resultados.filter(r => r.resultado === "Aprobado").length;
  for (const r of resultados) console.log(`${r.resultado === "Aprobado" ? "✔" : "✘"} ${r.id} [${r.req}] ${r.descripcion}\n    Esperado: ${r.esperado}\n    Obtenido: ${r.obtenido}`);
  console.log(`\n${aprobados} de ${resultados.length} casos aprobados.`);
  if (process.argv.includes("--json")) fs.writeFileSync(path.join(__dirname, "resultados.json"), JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));
  if (aprobados !== resultados.length) process.exitCode = 1;
})();

function fotosCreadasSeguras() { return fotosCreadas.filter(f => /^\/uploads\/[\w.-]+$/.test(f)); }
