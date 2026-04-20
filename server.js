const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));

// ====================== USUARIOS DEMO ======================
const USERS = {
  "admin":     { password: "admin123", role: "admin",     redirect: "/pages/admin.html" },
  "asesor01":  { password: "1234",     role: "asesor",   redirect: "/pages/asesor.html" }
};

// ====================== LOGIN API ======================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];

  if (user && user.password === password) {
    res.json({ success: true, redirect: user.redirect });
  } else {
    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  }
});

// Rutas principales (una sola entrada)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'login.html')));
app.get('/asesor', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'asesor.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin.html')));
app.get('/pantalla', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'pantalla.html')));


// ====================== ESTADO ======================
let services = [];
let queue = [];
let currentTicket = null;
let recentCalls = [];
let history = [];
let waitMessages = [];
let advisor = {
  loggedIn: false,
  moduleNumber: '',
  paused: false,
  serviceIds: []
};
let ticketCounter = 1;
let lastResetDate = new Date().toDateString();

// ====================== FUNCIONES DE PERSISTENCIA ======================
function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      services = data.services || createDefaultServices();
      queue = data.queue || [];
      currentTicket = data.currentTicket || null;
      recentCalls = data.recentCalls || [];
      history = data.history || [];
      waitMessages = data.waitMessages?.length ? data.waitMessages : getDefaultWaitMessages();
      advisor = data.advisor || { loggedIn: false, moduleNumber: '', paused: false, serviceIds: [] };
      ticketCounter = data.ticketCounter || 1;
      lastResetDate = data.lastResetDate || new Date().toDateString();

      console.log('✅ Estado cargado desde data.json');
    } catch (err) {
      console.error('❌ Error al cargar data.json, usando valores por defecto:', err.message);
      resetToDefaults();
    }
  } else {
    resetToDefaults();
  }
  // Sincronizar serviceIds del advisor
  if (advisor.serviceIds.length === 0) {
    advisor.serviceIds = services.map(s => s.id);
  }
}

function saveState() {
  // Limitar historial en memoria y archivo (máx 2000 tickets)
  if (history.length > 2000) history = history.slice(-2000);

  const data = {
    services,
    queue,
    currentTicket,
    recentCalls,
    history,
    waitMessages,
    advisor,
    ticketCounter,
    lastResetDate
  };

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Error al guardar estado:', err.message);
  }
}

function resetToDefaults() {
  services = createDefaultServices();
  queue = [];
  currentTicket = null;
  recentCalls = [];
  history = [];
  waitMessages = getDefaultWaitMessages();
  advisor = {
    loggedIn: false,
    moduleNumber: '',
    paused: false,
    serviceIds: services.map(s => s.id)
  };
  ticketCounter = 1;
  lastResetDate = new Date().toDateString();
  console.log('🔄 Usando configuración por defecto');
}

// ====================== FUNCIONES AUXILIARES ======================
function createDefaultServices() {
  return [
    { id: 'cuentas', name: 'Cuentas y tarjetas', prefix: 'CT', estimatedMinutes: 6, color: '#0d6efd', active: true },
    { id: 'prestamos', name: 'Préstamos', prefix: 'PR', estimatedMinutes: 10, color: '#14b8a6', active: true },
    { id: 'caja', name: 'Atención en caja', prefix: 'CJ', estimatedMinutes: 4, color: '#f59e0b', active: true }
  ];
}

function getDefaultWaitMessages() {
  return [
    'Ten tu documento listo para agilizar la atención.',
    'Puedes solicitar tu turno desde el enlace rápido o el QR.',
    'Nuestros asesores priorizan el orden de llegada por servicio.'
  ];
}

function nowIso() { return new Date().toISOString(); }

function clampText(value, max = 120) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function slugify(value) {
  return clampText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function createServiceId(name) {
  const base = slugify(name) || `servicio-${services.length + 1}`;
  let candidate = base;
  let index = 2;
  while (services.some(s => s.id === candidate)) {
    candidate = `${base}-${index}`;
    index++;
  }
  return candidate;
}

function getServiceById(id) {
  return services.find(s => s.id === id);
}

function serviceDuration(serviceId) {
  return getServiceById(serviceId)?.estimatedMinutes || 5;
}

function minutesBetween(start, end) {
  if (!start || !end) return 0;
  const diff = new Date(end) - new Date(start);
  return Math.max(0, Math.round(diff / 60000));
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function computeEstimatedWait(serviceId) {
  const pending = queue.reduce((total, t) => total + serviceDuration(t.serviceId), 0);
  const active = currentTicket ? serviceDuration(currentTicket.serviceId) : 0;
  return pending + active + serviceDuration(serviceId);
}

function createTicketCode(service) {
  return `${service.prefix}-${String(ticketCounter).padStart(3, '0')}`;
}

function publicTicket(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    number: ticket.number,
    serviceId: ticket.serviceId,
    serviceName: ticket.serviceName,
    status: ticket.status,
    channel: ticket.channel,
    deliveryType: ticket.deliveryType,
    phone: ticket.phone,
    email: ticket.email,
    language: ticket.language,
    peopleAhead: ticket.peopleAhead,
    estimatedWaitMinutes: ticket.estimatedWaitMinutes,
    queueEnteredAt: ticket.queueEnteredAt,
    calledAt: ticket.calledAt,
    callCount: ticket.callCount,
    moduleNumber: ticket.moduleNumber,
    attentionStartedAt: ticket.attentionStartedAt,
    attentionFinishedAt: ticket.attentionFinishedAt,
    notes: ticket.notes
  };
}

function publicService(service) {
  return {
    id: service.id,
    name: service.name,
    prefix: service.prefix,
    estimatedMinutes: service.estimatedMinutes,
    color: service.color,
    active: service.active
  };
}

function registerCall(ticket, type = 'Llamado') {
  recentCalls.unshift({
    id: ticket.id,
    number: ticket.number,
    serviceName: ticket.serviceName,
    moduleNumber: advisor.moduleNumber,
    type,
    timestamp: nowIso()
  });
  if (recentCalls.length > 6) recentCalls.pop();
}

function finalizeCurrentTicket(nextStatus, notes = '') {
  if (!currentTicket) return null;
  currentTicket.status = nextStatus;
  currentTicket.notes = clampText(notes, 240);
  currentTicket.attentionFinishedAt = nowIso();
  history.push({ ...currentTicket });
  const finalized = { ...currentTicket };
  currentTicket = null;
  return finalized;
}

function buildDashboard() {
  const completed = history.filter(t => t.status === 'Finalizado');
  const called = history.filter(t => t.calledAt);

  return {
    queueTotal: queue.length,
    avgWaitMinutes: average(called.map(t => minutesBetween(t.queueEnteredAt, t.calledAt))),
    avgAttentionMinutes: average(completed.map(t => minutesBetween(t.attentionStartedAt, t.attentionFinishedAt))),
    completedCount: completed.length,
    absentCount: history.filter(t => t.status === 'Ausente').length,
    cancelledCount: history.filter(t => t.status === 'Cancelado').length,
    congestion: queue.length >= 6,
    serviceLoad: services.map(service => ({
      id: service.id,
      name: service.name,
      pendingCount: queue.filter(t => t.serviceId === service.id).length,
      completedCount: completed.filter(t => t.serviceId === service.id).length
    }))
  };
}

function buildStatePayload() {
  return {
    services: services.map(publicService),
    turnoActual: publicTicket(currentTicket),
    enEspera: queue.map(publicTicket),
    recentCalls,
    history: history.slice(-8).reverse().map(publicTicket),
    waitMessages,
    advisor,
    dashboard: buildDashboard(),
    generatedAt: nowIso()
  };
}

function ensureAdvisorReady(res) {
  if (!advisor.loggedIn) {
    res.status(400).json({ success: false, message: 'Inicia sesión con tu número de módulo antes de atender.' });
    return false;
  }
  return true;
}

// ====================== RUTAS ======================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'index.html')));
app.get('/asesor', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'asesor.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin.html')));

app.get('/api/estado', (req, res) => res.json(buildStatePayload()));

// Crear turno
app.post('/api/turnos', (req, res) => {
  const service = getServiceById(req.body.serviceId);
  if (!service || !service.active) {
    return res.status(400).json({ success: false, message: 'Selecciona un servicio válido.' });
  }

  const deliveryType = req.body.deliveryType === 'digital' ? 'digital' : 'impreso';
  const phone = clampText(req.body.phone, 30);
  const email = clampText(req.body.email, 80).toLowerCase();

  if (deliveryType === 'digital' && !phone && !email) {
    return res.status(400).json({ success: false, message: 'Para ticket digital debes ingresar teléfono o correo.' });
  }

  // Reset diario del contador
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    ticketCounter = 1;
    lastResetDate = today;
  }

  const newTicket = {
    id: createTicketCode(service),
    number: ticketCounter,
    serviceId: service.id,
    serviceName: service.name,
    status: 'Pendiente',
    channel: ['kiosco', 'web', 'movil'].includes(req.body.channel) ? req.body.channel : 'kiosco',
    deliveryType,
    phone,
    email,
    language: ['es', 'en'].includes(req.body.language) ? req.body.language : 'es',
    peopleAhead: queue.length + (currentTicket ? 1 : 0),
    estimatedWaitMinutes: computeEstimatedWait(service.id),
    queueEnteredAt: nowIso(),
    calledAt: null,
    callCount: 0,
    moduleNumber: null,
    attentionStartedAt: null,
    attentionFinishedAt: null,
    notes: ''
  };

  ticketCounter++;
  queue.push(newTicket);
  saveState();

  res.status(201).json({ success: true, ticket: publicTicket(newTicket) });
});

// Cancelar turno
app.post('/api/turnos/:id/cancelar', (req, res) => {
  const index = queue.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Turno no encontrado.' });

  const [ticket] = queue.splice(index, 1);
  ticket.status = 'Cancelado';
  ticket.attentionFinishedAt = nowIso();
  history.push(ticket);
  saveState();

  res.json({ success: true, ticket: publicTicket(ticket) });
});

// Login asesor
app.post('/api/asesor/login', (req, res) => {
  const moduleNumber = clampText(req.body.moduleNumber, 12);
  if (!moduleNumber) return res.status(400).json({ success: false, message: 'Ingresa el número de módulo.' });

  advisor.loggedIn = true;
  advisor.moduleNumber = moduleNumber;
  advisor.paused = false;
  saveState();
  res.json({ success: true, advisor });
});

// Pausa
app.post('/api/asesor/pausa', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  advisor.paused = !advisor.paused;
  saveState();
  res.json({ success: true, advisor });
});

// Seleccionar servicios del asesor
app.post('/api/asesor/servicios', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  const requested = Array.isArray(req.body.serviceIds) ? req.body.serviceIds : [];
  const validIds = requested.filter(id => getServiceById(id));

  if (!validIds.length) return res.status(400).json({ success: false, message: 'Selecciona al menos un servicio.' });

  advisor.serviceIds = validIds;
  saveState();
  res.json({ success: true, advisor });
});

// Llamar siguiente turno
app.post('/api/llamar', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  if (advisor.paused) return res.status(400).json({ success: false, message: 'El módulo está en pausa.' });
  if (currentTicket) return res.status(400).json({ success: false, message: 'Finaliza el turno actual primero.' });

  const nextIndex = queue.findIndex(t => advisor.serviceIds.includes(t.serviceId));
  if (nextIndex === -1) return res.status(400).json({ success: false, message: 'No hay turnos en espera para tus servicios.' });

  const [ticket] = queue.splice(nextIndex, 1);
  ticket.status = 'En atencion';
  ticket.callCount = 1;
  ticket.calledAt = nowIso();
  ticket.attentionStartedAt = ticket.calledAt;
  ticket.moduleNumber = advisor.moduleNumber;
  currentTicket = ticket;

  registerCall(ticket, 'Llamado');
  saveState();

  res.json({ success: true, turno: publicTicket(currentTicket) });
});

// Rellamar
app.post('/api/rellamar', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  if (!currentTicket) return res.status(400).json({ success: false, message: 'No hay turno activo.' });

  currentTicket.callCount++;
  registerCall(currentTicket, 'Rellamado');
  saveState();
  res.json({ success: true, turno: publicTicket(currentTicket) });
});

// Ausencia
app.post('/api/ausencia', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  if (!currentTicket) return res.status(400).json({ success: false, message: 'No hay turno activo.' });
  if (currentTicket.callCount < 3) return res.status(400).json({ success: false, message: 'Debes llamar 3 veces antes de marcar ausencia.' });

  const ticket = finalizeCurrentTicket('Ausente');
  saveState();
  res.json({ success: true, turno: publicTicket(ticket) });
});

// Finalizar
app.post('/api/finalizar', (req, res) => {
  if (!ensureAdvisorReady(res)) return;
  if (!currentTicket) return res.status(400).json({ success: false, message: 'No hay turno activo.' });

  const ticket = finalizeCurrentTicket('Finalizado', req.body.notes);
  saveState();
  res.json({ success: true, turno: publicTicket(ticket) });
});

// Crear servicio
app.post('/api/servicios', (req, res) => {
  const name = clampText(req.body.name, 40);
  if (!name) return res.status(400).json({ success: false, message: 'El servicio necesita un nombre.' });

  const newService = {
    id: createServiceId(name),
    name,
    prefix: clampText(req.body.prefix, 4).toUpperCase() || 'SV',
    estimatedMinutes: Math.max(1, Math.min(60, Number(req.body.estimatedMinutes) || 5)),
    color: '#8b5cf6',
    active: true
  };

  services.push(newService);
  advisor.serviceIds = services.map(s => s.id);
  saveState();

  res.status(201).json({ success: true, service: publicService(newService) });
});

// Editar servicio
app.put('/api/servicios/:id', (req, res) => {
  const service = getServiceById(req.params.id);
  if (!service) return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });

  const name = clampText(req.body.name, 40);
  if (!name) return res.status(400).json({ success: false, message: 'El servicio necesita un nombre.' });

  service.name = name;
  service.prefix = clampText(req.body.prefix, 4).toUpperCase() || service.prefix;
  service.estimatedMinutes = Math.max(1, Math.min(60, Number(req.body.estimatedMinutes) || service.estimatedMinutes));

  // Actualizar nombre en todos los tickets
  queue = queue.map(t => t.serviceId === service.id ? { ...t, serviceName: service.name } : t);
  if (currentTicket && currentTicket.serviceId === service.id) currentTicket.serviceName = service.name;
  history = history.map(t => t.serviceId === service.id ? { ...t, serviceName: service.name } : t);

  saveState();
  res.json({ success: true, service: publicService(service) });
});

// Eliminar servicio
app.delete('/api/servicios/:id', (req, res) => {
  if (queue.some(t => t.serviceId === req.params.id) || (currentTicket && currentTicket.serviceId === req.params.id)) {
    return res.status(400).json({ success: false, message: 'No puedes eliminar un servicio con turnos activos.' });
  }

  const newServices = services.filter(s => s.id !== req.params.id);
  if (newServices.length === services.length) return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });

  services = newServices;
  advisor.serviceIds = advisor.serviceIds.filter(id => id !== req.params.id);
  if (!advisor.serviceIds.length) advisor.serviceIds = services.map(s => s.id);

  saveState();
  res.json({ success: true });
});

// Mensajes de espera
app.post('/api/mensajes', (req, res) => {
  const messages = Array.isArray(req.body.messages)
    ? req.body.messages.map(m => clampText(m, 140)).filter(Boolean)
    : [];

  if (!messages.length) return res.status(400).json({ success: false, message: 'Ingresa al menos un mensaje.' });

  waitMessages = messages;
  saveState();
  res.json({ success: true, waitMessages });
});

// Reporte CSV
app.get('/api/reportes.csv', (req, res) => {
  const headers = ['Codigo','Servicio','Estado','Canal','Entrega','Modulo','Ingreso','Llamado','Finalizado','Espera (min)','Atencion (min)','Notas'];
  const escapeCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = history.map(t => [
    t.id, t.serviceName, t.status, t.channel, t.deliveryType, t.moduleNumber || '',
    t.queueEnteredAt || '', t.calledAt || '', t.attentionFinishedAt || '',
    minutesBetween(t.queueEnteredAt, t.calledAt),
    minutesBetween(t.attentionStartedAt, t.attentionFinishedAt),
    t.notes || ''
  ]);

  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-turnos.csv"');
  res.send(`\ufeff${csv}`);
});

// ====================== MIDDLEWARE DE ERRORES ======================
app.use((err, req, res, next) => {
  console.error('Error interno:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

// ====================== INICIO ======================
loadState();

app.listen(PORT, () => {
  console.log('🚀 Servidor de turnos PRO corriendo');
  console.log(`   → Cliente: http://localhost:${PORT}/`);
  console.log(`   → Asesor:  http://localhost:${PORT}/asesor`);
  console.log(`   → Admin:   http://localhost:${PORT}/admin`);
  console.log(`   → Datos persistidos en: ${DATA_FILE}`);
});