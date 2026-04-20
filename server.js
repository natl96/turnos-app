const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: '*' } 
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ESTADO EN MEMORIA ====================
let cola = [];                    // turnos en espera / llamados
let turnos = [];                  // histórico
let contadores = {};              // para códigos
let modulos = {};
let asesores = [
  { id: 'a1', nombre: 'Ana García', modulo: '1', password: '1234' },
  { id: 'a2', nombre: 'Luis Martínez', modulo: '2', password: '1234' },
  { id: 'a3', nombre: 'María López', modulo: '3', password: '1234' },
];
let servicios = [
  { id: 's1', nombre: 'Caja', codigo: 'CAJ', activo: true },
  { id: 's2', nombre: 'Información', codigo: 'INF', activo: true },
  { id: 's3', nombre: 'Trámites', codigo: 'TRA', activo: true },
  { id: 's4', nombre: 'Soporte', codigo: 'SOP', activo: true },
];
let usuarios = [
  { id: 'u1', nombre: 'Admin', email: 'admin@turnos.com', password: 'admin123', rol: 'admin' },
];
let ultimosLlamados = [];

// ==================== FUNCIONES AUXILIARES ====================
function generarCodigo(servicioId) {
  const srv = servicios.find(s => s.id === servicioId);
  const cod = srv ? srv.codigo : 'TUR';
  if (!contadores[cod]) contadores[cod] = 1;
  const num = String(contadores[cod]++).padStart(3, '0');
  return `${cod}-${num}`;
}

function calcularEspera(servicioId) {
  return cola.filter(t => t.servicio === servicioId && t.estado === 'esperando').length * 5;
}

function emitirEstado() {
  const estado = {
    totalEsperando: cola.filter(t => t.estado === 'esperando').length,
    servicios: servicios.map(s => ({
      id: s.id,
      nombre: s.nombre,
      enEspera: cola.filter(t => t.servicio === s.id && t.estado === 'esperando').length,
      tiempoEstimado: calcularEspera(s.id),
    })),
    ultimosLlamados: ultimosLlamados.slice(0, 6),
  };
  io.emit('estado', estado);
}

// ==================== RUTAS ====================

// Página principal y páginas estáticas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pages/:page', (req, res) => {
  const page = req.params.page.replace('.html', '');
  res.sendFile(path.join(__dirname, 'public', `${page}.html`));
});

// --- CLIENTE ---
app.post('/api/turnos', (req, res) => {   // ← Cambiado a /api/turnos para que coincida con frontend
  const { serviceId, nombre, phone, email, deliveryType } = req.body;
  if (!serviceId) return res.status(400).json({ success: false, message: 'Servicio requerido' });

  const srv = servicios.find(s => s.id === serviceId);
  if (!srv) return res.status(404).json({ success: false, message: 'Servicio no encontrado' });

  const codigo = generarCodigo(serviceId);
  const turno = {
    id: Date.now().toString(),
    codigo,
    serviceName: srv.nombre,
    servicio: serviceId,
    nombre: nombre || 'Cliente',
    phone: phone || '',
    email: email || '',
    estado: 'esperando',
    horaCreacion: new Date().toISOString(),
    modulo: null,
    posicion: cola.filter(t => t.servicio === serviceId && t.estado === 'esperando').length + 1,
    estimatedWaitMinutes: calcularEspera(serviceId) + 5,
  };

  cola.push(turno);
  emitirEstado();
  io.emit('nuevo-turno', { turno });   // ← Evento clave para actualizar pantalla

  res.json({ success: true, ticket: turno });
});

app.post('/api/turnos/:id/cancelar', (req, res) => {
  const turno = cola.find(t => t.id === req.params.id);
  if (!turno) return res.status(404).json({ success: false, message: 'Turno no encontrado' });
  turno.estado = 'cancelado';
  emitirEstado();
  res.json({ success: true });
});

// --- ASESOR ---
app.post('/api/asesor/login', (req, res) => {
  const { modulo, password } = req.body;
  const asesor = asesores.find(a => a.modulo === modulo && a.password === password);
  if (!asesor) return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
  modulos[modulo] = { ...asesor, estado: 'disponible' };
  emitirEstado();
  res.json({ ok: true, asesor: { ...asesor, password: undefined } });
});

app.post('/api/asesor/llamar', (req, res) => {
  const { modulo } = req.body;
  const siguiente = cola.find(t => t.estado === 'esperando');
  if (!siguiente) return res.status(404).json({ ok: false, error: 'No hay turnos en espera' });

  siguiente.estado = 'llamado';
  siguiente.horaLlamado = new Date().toISOString();
  siguiente.modulo = modulo;

  ultimosLlamados.unshift({
    id: siguiente.codigo,
    serviceName: siguiente.serviceName,
    modulo: modulo,
    hora: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  });
  if (ultimosLlamados.length > 6) ultimosLlamados.pop();

  io.emit('turno-llamado', { turno: siguiente, modulo });
  emitirEstado();
  res.json({ ok: true, turno: siguiente });
});

app.post('/api/asesor/finalizar', (req, res) => {
  const { turnoId } = req.body;
  const turno = cola.find(t => t.id === turnoId);
  if (!turno) return res.status(404).json({ ok: false });
  turno.estado = 'atendido';
  turno.horaFin = new Date().toISOString();
  emitirEstado();
  res.json({ ok: true });
});

// --- ADMIN ---
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  const u = usuarios.find(u => u.email === email && u.password === password);
  if (!u) return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
  res.json({ ok: true, usuario: { ...u, password: undefined } });
});

app.get('/api/estado', (req, res) => {
  res.json({
    totalEsperando: cola.filter(t => t.estado === 'esperando').length,
    servicios: servicios.filter(s => s.activo),
    ultimosLlamados: ultimosLlamados,
  });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Cliente conectado a Socket.IO');
  emitirEstado();
});

// ==================== INICIO ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
