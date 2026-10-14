const Database = require("better-sqlite3");
const path = require("path");

// ECO_DB permite usar otra base de datos (por ejemplo, en las pruebas automatizadas).
const db = new Database(process.env.ECO_DB || path.join(__dirname, "ecoalerta.db"));
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS reportes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,
 nombre TEXT NOT NULL, email TEXT NOT NULL, telefono TEXT,
 ubicacion TEXT NOT NULL, tipo TEXT NOT NULL, descripcion TEXT, foto TEXT,
 prioridad TEXT NOT NULL DEFAULT 'Media', responsable TEXT,
 estado_actual TEXT NOT NULL DEFAULT 'Reporte recibido', fecha_creacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS historial (
 id INTEGER PRIMARY KEY AUTOINCREMENT, reporte_id INTEGER NOT NULL,
 estado TEXT NOT NULL, observacion TEXT, fecha TEXT NOT NULL,
 FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE
);
`);

// Migración: coordenadas exactas elegidas por el ciudadano en el mapa.
const columnas = db.prepare("PRAGMA table_info(reportes)").all().map(c => c.name);
if (!columnas.includes("lat")) db.exec("ALTER TABLE reportes ADD COLUMN lat REAL");
if (!columnas.includes("lng")) db.exec("ALTER TABLE reportes ADD COLUMN lng REAL");

// Límites aproximados de República Dominicana (incluye una franja de la frontera).
const LIMITES_RD = { latMin: 17.36, latMax: 19.95, lngMin: -72.01, lngMax: -68.32 };
const dentroDeRD = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= LIMITES_RD.latMin && lat <= LIMITES_RD.latMax &&
  lng >= LIMITES_RD.lngMin && lng <= LIMITES_RD.lngMax;

// Coordenadas de las ubicaciones fijas que usaba la versión anterior.
// Se conservan para ubicar en el mapa los reportes registrados antes del cambio.
const UBICACIONES = {
  "Parque Duarte, Moca, República Dominicana": [19.3936, -70.5256],
  "Calle 27 de Febrero, Moca, República Dominicana": [19.3912, -70.5218],
  "Calle Independencia, Moca, República Dominicana": [19.3961, -70.5281],
  "Hospital Municipal de Fantino, República Dominicana": [19.1172, -70.2992],
  "Calle Restauración, Fantino, República Dominicana": [19.1193, -70.3018],
  "Parque Central, Santiago, República Dominicana": [19.4517, -70.6970]
};

const TIPOS = [
  "Residuos Plásticos", "Residuos Orgánicos", "Residuos Metálicos",
  "Contaminación Sónica", "Residuos Pluviales", "Acumulación de basura"
];

const ESTADOS = [
  "Reporte recibido", "Reporte en evaluación", "Asignado",
  "Reporte en ejecución", "Reporte atendido", "Cerrado"
];

const PRIORIDADES = ["Baja", "Media", "Alta", "Crítica"];

module.exports = { db, UBICACIONES, TIPOS, ESTADOS, PRIORIDADES, LIMITES_RD, dentroDeRD };
