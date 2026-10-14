// Crea una copia de seguridad consistente de la base de datos y de las fotografías.
// Uso: npm run respaldo
// Los respaldos se guardan en la carpeta respaldos/ con la fecha y hora en el nombre.
const fs = require("fs");
const path = require("path");
const { db } = require("./db");

const marca = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const destino = path.join(__dirname, "respaldos", marca);
fs.mkdirSync(destino, { recursive: true });

// better-sqlite3 usa la API de respaldo en línea de SQLite: la copia es
// consistente aunque el servidor esté en ejecución.
db.backup(path.join(destino, "ecoalerta.db"))
  .then(() => {
    const uploads = path.join(__dirname, "public", "uploads");
    let fotos = 0;
    if (fs.existsSync(uploads)) {
      fs.mkdirSync(path.join(destino, "uploads"));
      for (const f of fs.readdirSync(uploads)) {
        fs.copyFileSync(path.join(uploads, f), path.join(destino, "uploads", f));
        fotos++;
      }
    }
    const total = db.prepare("SELECT COUNT(*) c FROM reportes").get().c;
    console.log(`Respaldo creado en ${destino} (${total} reportes, ${fotos} fotografías).`);
  })
  .catch(e => { console.error("No se pudo crear el respaldo:", e.message); process.exit(1); });
