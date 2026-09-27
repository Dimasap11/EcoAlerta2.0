const express = require("express");
const Database = require("better-sqlite3");
const multer = require("multer");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(publicDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(__dirname, "ecoalerta.db"));
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

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret: process.env.SESSION_SECRET || "ecoalerta-desarrollo-2026",
 resave:false, saveUninitialized:false,
 cookie:{httpOnly:true, sameSite:"lax", maxAge:1000*60*60*4}
}));
app.use(express.static(publicDir));

const storage=multer.diskStorage({
 destination:(_,__,cb)=>cb(null,uploadDir),
 filename:(_,file,cb)=>cb(null,Date.now()+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"))
});
const upload=multer({storage,limits:{fileSize:5*1024*1024}});

const ADMIN_USER = process.env.ECO_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ECO_ADMIN_PASS || "EcoAlerta2026!";

function requireAdmin(req,res,next){
 if(req.session && req.session.admin) return next();
 res.status(401).json({error:"Sesión administrativa requerida."});
}
function codigoNuevo(){
 return "EA-"+Date.now().toString().slice(-8)+Math.floor(Math.random()*90+10);
}

app.post("/api/admin/login",(req,res)=>{
 const {usuario,password}=req.body;
 if(usuario===ADMIN_USER && password===ADMIN_PASS){
   req.session.admin={usuario}; return res.json({ok:true,usuario});
 }
 res.status(401).json({error:"Usuario o contraseña incorrectos."});
});
app.get("/api/admin/session",(req,res)=>res.json({authenticated:!!req.session.admin,usuario:req.session.admin?.usuario||null}));
app.post("/api/admin/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.post("/api/reportes",upload.single("foto"),(req,res)=>{
 try{
  const {nombre,email,telefono,ubicacion,tipo,descripcion}=req.body;
  if(!nombre||!email||!ubicacion||!tipo) return res.status(400).json({error:"Faltan campos obligatorios."});
  let codigo=codigoNuevo(); while(db.prepare("SELECT 1 FROM reportes WHERE codigo=?").get(codigo)) codigo=codigoNuevo();
  const fecha=new Date().toISOString(), foto=req.file?"/uploads/"+req.file.filename:null;
  const info=db.prepare(`INSERT INTO reportes(codigo,nombre,email,telefono,ubicacion,tipo,descripcion,foto,fecha_creacion)
  VALUES(?,?,?,?,?,?,?,?,?)`).run(codigo,nombre,email,telefono||null,ubicacion,tipo,descripcion||null,foto,fecha);
  db.prepare("INSERT INTO historial(reporte_id,estado,observacion,fecha) VALUES(?,?,?,?)")
    .run(info.lastInsertRowid,"Reporte recibido","Reporte registrado en EcoAlerta.",fecha);
  res.json({codigo});
 }catch(e){console.error(e);res.status(500).json({error:"No se pudo registrar el reporte."});}
});

app.get("/api/reportes/:codigo",(req,res)=>{
 const r=db.prepare("SELECT * FROM reportes WHERE codigo=?").get(req.params.codigo);
 if(!r)return res.status(404).json({error:"Reporte no encontrado."});
 r.historial=db.prepare("SELECT estado,observacion,fecha FROM historial WHERE reporte_id=? ORDER BY fecha ASC").all(r.id);
 res.json(r);
});

app.get("/api/admin/reportes",requireAdmin,(req,res)=>{
 let sql="SELECT * FROM reportes WHERE 1=1", params=[];
 if(req.query.estado){sql+=" AND estado_actual=?";params.push(req.query.estado)}
 if(req.query.prioridad){sql+=" AND prioridad=?";params.push(req.query.prioridad)}
 if(req.query.tipo){sql+=" AND tipo=?";params.push(req.query.tipo)}
 if(req.query.q){sql+=" AND (codigo LIKE ? OR ubicacion LIKE ? OR responsable LIKE ?)";let q="%"+req.query.q+"%";params.push(q,q,q)}
 sql+=" ORDER BY fecha_creacion DESC";
 res.json(db.prepare(sql).all(...params));
});
app.get("/api/admin/reportes/:codigo",requireAdmin,(req,res)=>{
 const r=db.prepare("SELECT * FROM reportes WHERE codigo=?").get(req.params.codigo);
 if(!r)return res.status(404).json({error:"Reporte no encontrado."});
 r.historial=db.prepare("SELECT estado,observacion,fecha FROM historial WHERE reporte_id=? ORDER BY fecha ASC").all(r.id);
 res.json(r);
});
app.put("/api/admin/reportes/:codigo",requireAdmin,(req,res)=>{
 const r=db.prepare("SELECT * FROM reportes WHERE codigo=?").get(req.params.codigo);
 if(!r)return res.status(404).json({error:"Reporte no encontrado."});
 const estado=req.body.estado||r.estado_actual, prioridad=req.body.prioridad||r.prioridad;
 const responsable=req.body.responsable??r.responsable, observacion=req.body.observacion||"", fecha=new Date().toISOString();
 db.prepare("UPDATE reportes SET estado_actual=?,prioridad=?,responsable=? WHERE id=?").run(estado,prioridad,responsable,r.id);
 if(estado!==r.estado_actual||observacion) db.prepare("INSERT INTO historial(reporte_id,estado,observacion,fecha) VALUES(?,?,?,?)").run(r.id,estado,observacion,fecha);
 res.json({ok:true});
});
app.get("/api/admin/estadisticas",requireAdmin,(_,res)=>{
 const total=db.prepare("SELECT COUNT(*) c FROM reportes").get().c;
 const atendidos=db.prepare("SELECT COUNT(*) c FROM reportes WHERE estado_actual IN ('Reporte atendido','Cerrado')").get().c;
 const proceso=db.prepare("SELECT COUNT(*) c FROM reportes WHERE estado_actual IN ('Reporte en evaluación','Asignado','Reporte en ejecución')").get().c;
 res.json({total,atendidos,proceso,pendientes:total-atendidos-proceso});
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Error interno del servidor."})});
app.listen(PORT,()=>console.log(`EcoAlerta 2.1 disponible en http://localhost:${PORT}`));
