CREATE TABLE reportes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 codigo TEXT UNIQUE NOT NULL,
 nombre TEXT NOT NULL,
 email TEXT NOT NULL,
 telefono TEXT,
 ubicacion TEXT NOT NULL,
 tipo TEXT NOT NULL,
 descripcion TEXT,
 foto TEXT,
 prioridad TEXT NOT NULL DEFAULT 'Media',
 responsable TEXT,
 estado_actual TEXT NOT NULL DEFAULT 'Reporte recibido',
 fecha_creacion TEXT NOT NULL
);

CREATE TABLE historial (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reporte_id INTEGER NOT NULL,
 estado TEXT NOT NULL,
 observacion TEXT,
 fecha TEXT NOT NULL,
 FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE
);
