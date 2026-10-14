// Carga datos de demostración para presentaciones.
// ATENCIÓN: borra todos los reportes existentes antes de insertar los de ejemplo.
// Uso: npm run demo
const { db, ESTADOS } = require("./db");

const DIA = 24 * 60 * 60 * 1000;
const ahora = Date.now();

const casos = [
  ["Ana Rodríguez", "Parque Duarte, Moca, República Dominicana", "Acumulación de basura", "Fundas de basura acumuladas junto a los bancos del lado norte del parque desde el fin de semana.", "Alta", 4, "Brigada de Limpieza Moca", 9],
  ["Luis Fernández", "Calle 27 de Febrero, Moca, República Dominicana", "Residuos Plásticos", "Botellas y envases plásticos tapando el contén frente al colmado de la esquina.", "Media", 5, "Brigada de Limpieza Moca", 14],
  ["Carmen Almonte", "Calle Independencia, Moca, República Dominicana", "Contaminación Sónica", "Bocinas a alto volumen después de las 11 de la noche varios días de la semana.", "Media", 1, null, 2],
  ["José Taveras", "Hospital Municipal de Fantino, República Dominicana", "Residuos Orgánicos", "Restos de comida y desechos orgánicos en la parte trasera del hospital, con mal olor.", "Crítica", 3, "Saneamiento Ambiental Fantino", 3],
  ["María Ventura", "Calle Restauración, Fantino, República Dominicana", "Residuos Pluviales", "Imbornal tapado; el agua se acumula en la calle cada vez que llueve.", "Alta", 2, "Obras Públicas Fantino", 5],
  ["Pedro Guzmán", "Parque Central, Santiago, República Dominicana", "Residuos Plásticos", "Vasos y platos desechables dispersos tras una actividad en el parque.", "Baja", 4, "Ayuntamiento de Santiago", 11],
  ["Rosa Peralta", "Parque Duarte, Moca, República Dominicana", "Residuos Metálicos", "Restos de una estructura metálica oxidada abandonados en la acera.", "Media", 0, null, 1],
  ["Rafael Núñez", "Calle 27 de Febrero, Moca, República Dominicana", "Acumulación de basura", "Vertedero improvisado en un solar baldío; la gente sigue tirando basura.", "Crítica", 3, "Brigada de Limpieza Moca", 6],
  ["Yolanda Cruz", "Calle Independencia, Moca, República Dominicana", "Residuos Orgánicos", "Ramas y hojas de una poda que no fueron recogidas.", "Baja", 5, "Brigada de Limpieza Moca", 18],
  ["Miguel Santos", "Parque Central, Santiago, República Dominicana", "Contaminación Sónica", "Ruido constante de un generador eléctrico en un negocio cercano.", "Media", 2, "Ayuntamiento de Santiago", 4],
  ["Altagracia Reyes", "Hospital Municipal de Fantino, República Dominicana", "Acumulación de basura", "Contenedor desbordado en la entrada de emergencias.", "Alta", 0, null, 0.3],
  ["Francisco Ortiz", "Calle Restauración, Fantino, República Dominicana", "Residuos Plásticos", "Fundas plásticas atrapadas en la cuneta a lo largo de media cuadra.", "Baja", 1, null, 2.5],
  ["Daniela Polanco", "Parque Duarte, Moca, República Dominicana", "Residuos Pluviales", "Drenaje obstruido con sedimentos frente a la iglesia.", "Media", 4, "Obras Públicas Moca", 8]
];

const notas = {
  "Reporte en evaluación": "Caso revisado por el equipo técnico; se confirma la incidencia.",
  "Asignado": "Asignado a la brigada responsable de la zona.",
  "Reporte en ejecución": "La brigada se encuentra trabajando en el lugar.",
  "Reporte atendido": "Trabajo completado; se registra evidencia de la limpieza.",
  "Cerrado": "Caso verificado y cerrado."
};

const reset = db.transaction(() => {
  db.prepare("DELETE FROM historial").run();
  db.prepare("DELETE FROM reportes").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('reportes','historial')").run();

  const insR = db.prepare(`INSERT INTO reportes(codigo,nombre,email,telefono,ubicacion,tipo,descripcion,prioridad,responsable,estado_actual,fecha_creacion)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const insH = db.prepare("INSERT INTO historial(reporte_id,estado,observacion,fecha) VALUES(?,?,?,?)");

  casos.forEach(([nombre, ubic, tipo, desc, prio, nivel, resp, diasAtras], i) => {
    const creado = ahora - diasAtras * DIA;
    const codigo = "EA-" + String(26100000 + i * 731 + 17).padStart(8, "0") + String(10 + i * 7).slice(-2);
    const email = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(" ", ".") + "@correo.com";
    const info = insR.run(codigo, nombre, email, "809-5" + String(780000 + i * 1373).slice(0, 6), ubic, tipo, desc, prio, resp, ESTADOS[nivel], new Date(creado).toISOString());
    insH.run(info.lastInsertRowid, "Reporte recibido", "Reporte registrado en EcoAlerta.", new Date(creado).toISOString());
    for (let n = 1; n <= nivel; n++) {
      const t = creado + (diasAtras * DIA * 0.85) * (n / (nivel + 0.5));
      insH.run(info.lastInsertRowid, ESTADOS[n], notas[ESTADOS[n]], new Date(t).toISOString());
    }
  });
});

reset();
console.log(`Datos de demostración cargados: ${casos.length} reportes.`);
