const express = require("express");
const multer = require("multer");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { db, UBICACIONES, TIPOS, ESTADOS, PRIORIDADES, LIMITES_RD, dentroDeRD } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(publicDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "ecoalerta-desarrollo-2026",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 4 }
}));
app.use(express.static(publicDir));
// Leaflet se sirve desde node_modules: el mapa no depende de un CDN externo.
app.use("/vendor/leaflet", express.static(path.join(__dirname, "node_modules", "leaflet", "dist")));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("La evidencia debe ser una imagen."), { status: 400 }));
  }
});

const ADMIN_USER = process.env.ECO_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ECO_ADMIN_PASS || "EcoAlerta2026!";

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: "Sesión administrativa requerida." });
}
function codigoNuevo() {
  return "EA-" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
}
function historialDe(id) {
  return db.prepare("SELECT estado,observacion,fecha FROM historial WHERE reporte_id=? ORDER BY fecha ASC, id ASC").all(id);
}

app.get("/api/catalogos", (_, res) => res.json({
  tipos: TIPOS, estados: ESTADOS, prioridades: PRIORIDADES, limites: LIMITES_RD
}));

app.post("/api/admin/login", (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = { usuario }; return res.json({ ok: true, usuario });
  }
  res.status(401).json({ error: "Usuario o contraseña incorrectos." });
});
app.get("/api/admin/session", (req, res) => res.json({ authenticated: !!req.session.admin, usuario: req.session.admin?.usuario || null }));
app.post("/api/admin/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.post("/api/reportes", upload.single("foto"), (req, res) => {
  try {
    const { nombre, email, telefono, tipo, descripcion } = req.body;
    const ubicacion = (req.body.ubicacion || "").trim().slice(0, 200);
    const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
    if (!nombre || !email || !ubicacion || !tipo) return res.status(400).json({ error: "Faltan campos obligatorios." });
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: "Tipo de reporte no válido." });
    if (!dentroDeRD(lat, lng)) return res.status(400).json({ error: "Marca en el mapa un punto dentro de República Dominicana." });
    let codigo = codigoNuevo(); while (db.prepare("SELECT 1 FROM reportes WHERE codigo=?").get(codigo)) codigo = codigoNuevo();
    const fecha = new Date().toISOString(), foto = req.file ? "/uploads/" + req.file.filename : null;
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO reportes(codigo,nombre,email,telefono,ubicacion,lat,lng,tipo,descripcion,foto,fecha_creacion)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(codigo, nombre.trim(), email.trim(), telefono || null, ubicacion,
        +lat.toFixed(6), +lng.toFixed(6), tipo, descripcion || null, foto, fecha);
      db.prepare("INSERT INTO historial(reporte_id,estado,observacion,fecha) VALUES(?,?,?,?)")
        .run(info.lastInsertRowid, "Reporte recibido", "Reporte registrado en EcoAlerta.", fecha);
    })();
    res.json({ codigo });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo registrar el reporte." }); }
});

// Vista pública: solo datos no personales del reporte.
app.get("/api/reportes/:codigo", (req, res) => {
  const r = db.prepare("SELECT id,codigo,ubicacion,lat,lng,tipo,prioridad,estado_actual,fecha_creacion FROM reportes WHERE codigo=?").get(req.params.codigo.trim().toUpperCase());
  if (!r) return res.status(404).json({ error: "No encontramos un reporte con ese código." });
  r.historial = historialDe(r.id); delete r.id;
  res.json(r);
});

// Puntos del mapa público. Los reportes nuevos traen coordenadas exactas;
// los anteriores al cambio usan la ubicación fija, desplazada unos metros
// de forma estable para que no queden encimados.
function coordenadasDe(r) {
  if (r.lat != null && r.lng != null) return [r.lat, r.lng];
  const base = UBICACIONES[r.ubicacion];
  if (!base) return null;
  const ang = (r.id * 137.508) * Math.PI / 180, rad = 0.0006 * Math.sqrt((r.id % 7) + 1);
  return [base[0] + rad * Math.sin(ang), base[1] + rad * Math.cos(ang)];
}
app.get("/api/mapa", (_, res) => {
  const rows = db.prepare("SELECT id,codigo,tipo,ubicacion,lat,lng,estado_actual,prioridad,fecha_creacion FROM reportes ORDER BY fecha_creacion DESC").all();
  res.json(rows.map(r => ({ r, c: coordenadasDe(r) })).filter(x => x.c).map(({ r, c }) => ({
    codigo: r.codigo, tipo: r.tipo, ubicacion: r.ubicacion, estado: r.estado_actual,
    prioridad: r.prioridad, fecha: r.fecha_creacion, lat: c[0], lng: c[1]
  })));
});

app.get("/api/resumen", (_, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM reportes").get().c;
  const atendidos = db.prepare("SELECT COUNT(*) c FROM reportes WHERE estado_actual IN ('Reporte atendido','Cerrado')").get().c;
  res.json({ total, atendidos });
});

app.get("/api/admin/reportes", requireAdmin, (req, res) => {
  let sql = "SELECT * FROM reportes WHERE 1=1", params = [];
  if (req.query.estado) { sql += " AND estado_actual=?"; params.push(req.query.estado); }
  if (req.query.prioridad) { sql += " AND prioridad=?"; params.push(req.query.prioridad); }
  if (req.query.tipo) { sql += " AND tipo=?"; params.push(req.query.tipo); }
  if (req.query.q) { sql += " AND (codigo LIKE ? OR ubicacion LIKE ? OR responsable LIKE ? OR nombre LIKE ?)"; const q = "%" + req.query.q + "%"; params.push(q, q, q, q); }
  sql += " ORDER BY fecha_creacion DESC";
  res.json(db.prepare(sql).all(...params));
});
app.get("/api/admin/reportes/:codigo", requireAdmin, (req, res) => {
  const r = db.prepare("SELECT * FROM reportes WHERE codigo=?").get(req.params.codigo);
  if (!r) return res.status(404).json({ error: "Reporte no encontrado." });
  r.historial = historialDe(r.id);
  res.json(r);
});
app.put("/api/admin/reportes/:codigo", requireAdmin, (req, res) => {
  const r = db.prepare("SELECT * FROM reportes WHERE codigo=?").get(req.params.codigo);
  if (!r) return res.status(404).json({ error: "Reporte no encontrado." });
  const estado = req.body.estado || r.estado_actual, prioridad = req.body.prioridad || r.prioridad;
  if (!ESTADOS.includes(estado) || !PRIORIDADES.includes(prioridad)) return res.status(400).json({ error: "Estado o prioridad no válidos." });
  const responsable = req.body.responsable ?? r.responsable, observacion = (req.body.observacion || "").trim(), fecha = new Date().toISOString();
  // Actualización y registro en el historial dentro de una transacción: se guardan ambos o ninguno.
  db.transaction(() => {
    db.prepare("UPDATE reportes SET estado_actual=?,prioridad=?,responsable=? WHERE id=?").run(estado, prioridad, responsable, r.id);
    if (estado !== r.estado_actual || observacion) db.prepare("INSERT INTO historial(reporte_id,estado,observacion,fecha) VALUES(?,?,?,?)").run(r.id, estado, observacion, fecha);
  })();
  res.json({ ok: true });
});
app.get("/api/admin/estadisticas", requireAdmin, (_, res) => {
  const total = db.prepare("SELECT COUNT(*) c FROM reportes").get().c;
  const atendidos = db.prepare("SELECT COUNT(*) c FROM reportes WHERE estado_actual IN ('Reporte atendido','Cerrado')").get().c;
  const proceso = db.prepare("SELECT COUNT(*) c FROM reportes WHERE estado_actual IN ('Reporte en evaluación','Asignado','Reporte en ejecución')").get().c;
  const criticos = db.prepare("SELECT COUNT(*) c FROM reportes WHERE prioridad IN ('Alta','Crítica') AND estado_actual NOT IN ('Reporte atendido','Cerrado')").get().c;
  res.json({ total, atendidos, proceso, pendientes: total - atendidos - proceso, criticos });
});

app.use((err, req, res, next) => {
  if (err.status === 400 || err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "La foto no puede pesar más de 5 MB." : err.message });
  }
  console.error(err); res.status(500).json({ error: "Error interno del servidor." });
});
app.listen(PORT, () => console.log(`EcoAlerta 2.1 disponible en http://localhost:${PORT}`));
