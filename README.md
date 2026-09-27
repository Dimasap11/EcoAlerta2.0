# EcoAlerta 2.0

Versión evolutiva del prototipo original de EcoAlerta.

## Incluye
- Portal ciudadano para registrar incidencias.
- Carga de evidencia fotográfica.
- Código único de seguimiento.
- Persistencia real en SQLite.
- Consulta de ticket e historial.
- Mapa con Leaflet/OpenStreetMap.
- Panel administrativo.
- Estados, prioridad, responsable y observaciones.
- Indicadores básicos del panel.

## Ejecutar en una PC
1. Instalar Node.js.
2. Abrir una terminal dentro de esta carpeta.
3. Ejecutar: `npm install`
4. Ejecutar: `npm start`
5. Abrir: `http://localhost:3000`

La base `ecoalerta.db` se crea automáticamente al iniciar.

## Nota académica
Esta versión sustituye el almacenamiento local del prototipo por una arquitectura cliente-servidor con base de datos. Es una primera implementación de EcoAlerta 2.0 y sirve como base para autenticación, correo real, roles y despliegue.
