const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ── Socket.IO ────────────────────────────────────────────────────────────────
let io;
try {
  const { Server } = require('socket.io');
  io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', () => emitEstado());
  console.log('✅ Socket.IO activo');
} catch (e) {
  console.warn('⚠️  Socket.IO no instalado. Tiempo real desactivado. Ejecuta: npm install socket.io');
  io = { emit: () => {} };
}

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
// Servir archivos estáticos desde public/ (nuevo) y pages/ (compatibilidad)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));

// ── ESTADO ────────────────────────────────────────────────────────────────────
let services = [];
let queue = [];
let currentTicket = null;
let recentCalls = [];
let history = [];
let waitMessages = [];
let advisor = { loggedIn: false, moduleNumber: '', paused: false, serviceIds: [] };
let modulos = {};   // { '1': { asesorNombre, estado, turnoActual } }
let asesores = [
  { id: 'a1', nombre: 'Ana García',    modulo: '1', password: '1234' },
  { id: 'a2', nombre: 'Luis Martínez', modulo: '2', password: '1234' },
  { id: 'a3', nombre: 'María López',   modulo: '3', password: '1234' },
];
let adminUsers = [
  { id: 'u1', nombre: 'Admin', email: 'admin@turnos.com', password: 'admin123', rol: 'admin' },
];
let ultimosLlamados = [];
let ticketCounter = 1;
let lastResetDate = new Date().toDateString();

// ── PERSISTENCIA ──────────────────────────────────────────────────────────────
function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      services      = data.services      || createDefaultServices();
      queue         = data.queue         || [];
      currentTicket = data.currentTicket || null;
      recentCalls   = data.recentCalls   || [];
      history       = data.history       || [];
      waitMessages  = data.waitMessages?.length ? data.waitMessages : getDefaultWaitMessages();
      advisor       = data.advisor       || { loggedIn: false, moduleNumber: '', paused: false, serviceIds: [] };
      ticketCounter = data.ticketCounter || 1;
      lastResetDate = data.lastResetDate || new Date().toDateString();
      if (!advisor.serviceIds.length) advisor.serviceIds = services.map(s => s.id);
      console.log('✅ Estado cargado desde data.json');
    } catch (err) {
      console.error('❌ Error al cargar data.json:', err.message);
      resetToDefaults();
    }
  } else {
    resetToDefaults();
  }
}

function saveState() {
  if (history.length > 2000) history = history.slice(-2000);
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      services, queue, currentTicket, recentCalls, history,
      waitMessages, advisor, ticketCounter, lastResetDate
    }, null, 2));
  } catch (err) {
    console.error('❌ Error al guardar estado:', err.message);
  }
}

function resetToDefaults() {
  services = createDefaultServices();
  queue = []; currentTicket = null; recentCalls = []; history = [];
  waitMessages = getDefaultWaitMessages();
  advisor = { loggedIn: false, moduleNumber: '', paused: false, serviceIds: [] };
  advisor.serviceIds = services.map(s => s.id);
  ticketCounter = 1;
  lastResetDate = new Date().toDateString();
}

// ── AUXILIARES ────────────────────────────────────────────────────────────────
function createDefaultServices() {
  return [
    { id: 'cuentas',   name: 'Cuentas y tarjetas',  prefix: 'CT', estimatedMinutes: 6,  color: '#0d6efd', active: true },
    { id: 'prestamos', name: 'Préstamos',            prefix: 'PR', estimatedMinutes: 10, color: '#14b8a6', active: true },
    { id: 'caja',      name: 'Atención en caja',     prefix: 'CJ', estimatedMinutes: 4,  color: '#f59e0b', active: true },
  ];
}
function getDefaultWaitMessages() {
  return ['Ten tu documento listo para agilizar la atención.',
          'Puedes solicitar tu turno desde el enlace rápido o el QR.',
          'Nuestros asesores priorizan el orden de llegada por servicio.'];
}
function nowIso() { return new Date().toISOString(); }
function clamp(v, max=120) { return String(v||'').trim().replace(/\s+/g,' ').slice(0,max); }
function serviceDuration(id) { return services.find(s=>s.id===id)?.estimatedMinutes||5; }
function minutesBetween(a,b) { if(!a||!b) return 0; return Math.max(0,Math.round((new Date(b)-new Date(a))/60000)); }
function average(vals) { if(!vals.length) return 0; return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length); }
function computeEstimatedWait(sid) {
  const p = queue.reduce((t,x)=>t+serviceDuration(x.serviceId),0);
  return p + (currentTicket?serviceDuration(currentTicket.serviceId):0) + serviceDuration(sid);
}
function createTicketCode(service) {
  const today = new Date().toDateString();
  if (today !== lastResetDate) { ticketCounter=1; lastResetDate=today; }
  return `${service.prefix}-${String(ticketCounter).padStart(3,'0')}`;
}
function publicTicket(t) {
  if (!t) return null;
  return { id:t.id, number:t.number, serviceId:t.serviceId, serviceName:t.serviceName,
    status:t.status, channel:t.channel, deliveryType:t.deliveryType, phone:t.phone,
    email:t.email, peopleAhead:t.peopleAhead, estimatedWaitMinutes:t.estimatedWaitMinutes,
    queueEnteredAt:t.queueEnteredAt, calledAt:t.calledAt, callCount:t.callCount,
    moduleNumber:t.moduleNumber, attentionStartedAt:t.attentionStartedAt,
    attentionFinishedAt:t.attentionFinishedAt, notes:t.notes,
    // aliases para los nuevos HTMLs
    codigo:t.id, servicioNombre:t.serviceName, nombre:t.nombre||'', estado:t.status,
    horaCreacion:t.queueEnteredAt, posicion:t.peopleAhead, tiempoEstimado:t.estimatedWaitMinutes };
}
function buildDashboard() {
  const completed = history.filter(t=>t.status==='Finalizado');
  return {
    queueTotal: queue.length,
    avgWaitMinutes: average(history.filter(t=>t.calledAt).map(t=>minutesBetween(t.queueEnteredAt,t.calledAt))),
    avgAttentionMinutes: average(completed.map(t=>minutesBetween(t.attentionStartedAt,t.attentionFinishedAt))),
    completedCount: completed.length,
    absentCount: history.filter(t=>t.status==='Ausente').length,
    cancelledCount: history.filter(t=>t.status==='Cancelado').length,
    congestion: queue.length >= 6,
    serviceLoad: services.map(s=>({
      id:s.id, name:s.name,
      pendingCount: queue.filter(t=>t.serviceId===s.id).length,
      completedCount: completed.filter(t=>t.serviceId===s.id).length
    }))
  };
}
function buildStatePayload() {
  const hoy = new Date().toDateString();
  const hoyHist = history.filter(t=>new Date(t.queueEnteredAt||'').toDateString()===hoy);
  return {
    services: services.map(s=>({
      ...s,
      enEspera: queue.filter(t=>t.serviceId===s.id).length,
      tiempoEstimado: computeEstimatedWait(s.id)
    })),
    turnoActual: publicTicket(currentTicket),
    enEspera: queue.map(publicTicket),
    recentCalls,
    ultimosLlamados,
    history: history.slice(-8).reverse().map(publicTicket),
    waitMessages,
    advisor,
    dashboard: buildDashboard(),
    // campos para admin.html nuevo
    totalHoy: hoyHist.length + queue.length,
    atendidos: hoyHist.filter(t=>t.status==='Finalizado').length,
    esperando: queue.length,
    cancelados: hoyHist.filter(t=>t.status==='Cancelado').length,
    ausentes:   hoyHist.filter(t=>t.status==='Ausente').length,
    totalEsperando: queue.length,
    porServicio: services.map(s=>({
      nombre:s.name,
      total: hoyHist.filter(t=>t.serviceId===s.id).length,
      esperando: queue.filter(t=>t.serviceId===s.id).length,
    })),
    modulos: Object.entries(modulos).map(([num,m])=>({modulo:num,...m})),
    generatedAt: nowIso()
  };
}
function emitEstado() {
  if (io) io.emit('estado', buildStatePayload());
}
function registerCall(ticket, type='Llamado') {
  recentCalls.unshift({ id:ticket.id, number:ticket.number, serviceName:ticket.serviceName,
    moduleNumber:ticket.moduleNumber||advisor.moduleNumber, type, timestamp:nowIso() });
  if (recentCalls.length>6) recentCalls.pop();
  ultimosLlamados.unshift({
    codigo: ticket.id, servicioNombre: ticket.serviceName,
    nombre: ticket.nombre||'Cliente',
    modulo: ticket.moduleNumber||advisor.moduleNumber,
    hora: new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})
  });
  if (ultimosLlamados.length>6) ultimosLlamados.pop();
}
function finalizeCurrentTicket(status, notes='') {
  if (!currentTicket) return null;
  currentTicket.status=status; currentTicket.notes=clamp(notes,240);
  currentTicket.attentionFinishedAt=nowIso();
  history.push({...currentTicket});
  const done={...currentTicket}; currentTicket=null;
  return done;
}

// ══════════════════════════════════════════════════════════════════════════════
//  RUTAS PÁGINAS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/',         (req,res)=>res.sendFile(path.join(__dirname,'pages','index.html')));
app.get('/cliente',  (req,res)=>res.sendFile(path.join(__dirname,'pages','cliente.html')));
app.get('/asesor',   (req,res)=>res.sendFile(path.join(__dirname,'pages','asesor.html')));
app.get('/admin',    (req,res)=>res.sendFile(path.join(__dirname,'pages','admin.html')));
app.get('/pantalla', (req,res)=>res.sendFile(path.join(__dirname,'pages','pantalla.html')));

// Compatibilidad con rutas antiguas /pages/
app.get('/pages/index.html',    (req,res)=>res.redirect('/'));
app.get('/pages/cliente.html',  (req,res)=>res.redirect('/cliente'));
app.get('/pages/asesor.html',   (req,res)=>res.redirect('/asesor'));
app.get('/pages/admin.html',    (req,res)=>res.redirect('/admin'));
app.get('/pages/pantalla.html', (req,res)=>res.redirect('/pantalla'));

// ══════════════════════════════════════════════════════════════════════════════
//  API ESTADO (ruta original)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/estado', (req,res)=>res.json(buildStatePayload()));
app.get('/api/pantalla', (req,res)=>res.json({
  ultimosLlamados, esperando: queue.length,
  servicios: services.filter(s=>s.active).map(s=>({
    nombre:s.name, enEspera: queue.filter(t=>t.serviceId===s.id).length
  }))
}));

// ══════════════════════════════════════════════════════════════════════════════
//  API SERVICIOS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/servicios', (req,res)=>res.json(
  services.filter(s=>s.active).map(s=>({
    id:s.id, nombre:s.name, name:s.name, codigo:s.prefix, prefix:s.prefix,
    activo:s.active, active:s.active,
    estimatedMinutes:s.estimatedMinutes,
    enEspera: queue.filter(t=>t.serviceId===s.id).length,
    tiempoEstimado: computeEstimatedWait(s.id)
  }))
));
app.post('/api/servicios', (req,res)=>{
  const name = clamp(req.body.name||req.body.nombre,40);
  if (!name) return res.status(400).json({success:false,error:'Nombre requerido'});
  const s={ id:'s'+Date.now(), name, prefix:(clamp(req.body.prefix||req.body.codigo,4)||'SV').toUpperCase(),
    estimatedMinutes:Math.max(1,Math.min(60,Number(req.body.estimatedMinutes)||5)),
    color:'#8b5cf6', active:true };
  services.push(s); advisor.serviceIds=services.map(x=>x.id); saveState();
  res.status(201).json({success:true,...s,ok:true});
});
app.put('/api/servicios/:id', (req,res)=>{
  const s=services.find(x=>x.id===req.params.id);
  if (!s) return res.status(404).json({error:'No encontrado'});
  if (req.body.nombre||req.body.name) s.name=req.body.nombre||req.body.name;
  if (req.body.codigo||req.body.prefix) s.prefix=(req.body.codigo||req.body.prefix).toUpperCase();
  if (req.body.estimatedMinutes) s.estimatedMinutes=Number(req.body.estimatedMinutes);
  if (req.body.activo!==undefined) s.active=req.body.activo;
  if (req.body.active!==undefined)  s.active=req.body.active;
  saveState(); emitEstado();
  res.json({success:true,...s,ok:true});
});
app.delete('/api/servicios/:id', (req,res)=>{
  if (queue.some(t=>t.serviceId===req.params.id)||(currentTicket&&currentTicket.serviceId===req.params.id))
    return res.status(400).json({error:'Hay turnos activos para este servicio.'});
  services=services.filter(s=>s.id!==req.params.id);
  advisor.serviceIds=advisor.serviceIds.filter(id=>id!==req.params.id);
  if (!advisor.serviceIds.length) advisor.serviceIds=services.map(s=>s.id);
  saveState(); emitEstado();
  res.json({success:true,ok:true});
});

// ══════════════════════════════════════════════════════════════════════════════
//  API TURNOS (clientes)
// ══════════════════════════════════════════════════════════════════════════════

// Crear turno — soporta tanto serviceId (original) como servicioId (nuevo)
app.post('/api/turnos', (req,res)=>{
  const sid = req.body.serviceId || req.body.servicioId;
  const service = services.find(s=>s.id===sid);
  if (!service||!service.active)
    return res.status(400).json({success:false,message:'Selecciona un servicio válido.',error:'Servicio no encontrado'});

  const today = new Date().toDateString();
  if (today!==lastResetDate){ticketCounter=1;lastResetDate=today;}

  const deliveryType = req.body.deliveryType==='digital'?'digital':'impreso';
  const ticket = {
    id: createTicketCode(service),
    number: ticketCounter,
    serviceId: service.id,
    serviceName: service.name,
    nombre: clamp(req.body.nombre||req.body.name||'Cliente',60),
    status: 'Pendiente',
    channel: ['kiosco','web','movil'].includes(req.body.channel)?req.body.channel:'kiosco',
    deliveryType,
    phone: clamp(req.body.phone||req.body.telefono,30),
    email: clamp(req.body.email,80).toLowerCase(),
    language: 'es',
    peopleAhead: queue.length+(currentTicket?1:0),
    estimatedWaitMinutes: computeEstimatedWait(service.id),
    queueEnteredAt: nowIso(),
    calledAt:null, callCount:0, moduleNumber:null,
    attentionStartedAt:null, attentionFinishedAt:null, notes:''
  };
  ticketCounter++;
  queue.push(ticket);
  saveState(); emitEstado();
  res.status(201).json({success:true, ok:true, ticket: publicTicket(ticket),
    turno: publicTicket(ticket) });
});

// Alias nuevo
app.post('/api/turno', (req,res,next)=>{
  req.url='/api/turnos'; next();
});

// Obtener turno por id
app.get('/api/turno/:id', (req,res)=>{
  const id=req.params.id;
  const t=[...queue,...history,(currentTicket?[currentTicket]:[])].flat().find(x=>x.id===id);
  if (!t) return res.status(404).json({error:'No encontrado'});
  res.json(publicTicket(t));
});

// Cancelar turno
app.post('/api/turnos/:id/cancelar', (req,res)=>{
  const idx=queue.findIndex(t=>t.id===req.params.id);
  if (idx===-1) return res.status(404).json({success:false,message:'Turno no encontrado.'});
  const [t]=queue.splice(idx,1);
  t.status='Cancelado'; t.attentionFinishedAt=nowIso();
  history.push(t); saveState(); emitEstado();
  res.json({success:true,ok:true,ticket:publicTicket(t)});
});
// Alias
app.post('/api/turno/:id/cancelar', (req,res,next)=>{
  req.url=`/api/turnos/${req.params.id}/cancelar`; next();
});

// ══════════════════════════════════════════════════════════════════════════════
//  API ASESOR
// ══════════════════════════════════════════════════════════════════════════════

// Login asesor — soporta el formato original (moduleNumber) y nuevo (modulo+password)
app.post('/api/asesor/login', (req,res)=>{
  const modulo = clamp(req.body.modulo||req.body.moduleNumber,12);
  if (!modulo) return res.status(400).json({success:false,ok:false,error:'Ingresa el número de módulo.'});

  // Validación con contraseña (nuevo)
  if (req.body.password) {
    const a=asesores.find(x=>x.modulo===modulo&&x.password===req.body.password);
    if (!a) return res.status(401).json({success:false,ok:false,error:'Módulo o contraseña incorrectos'});
    advisor.loggedIn=true; advisor.moduleNumber=modulo; advisor.paused=false;
    modulos[modulo]={asesorId:a.id,asesorNombre:a.nombre,estado:'disponible',turnoActual:null};
    saveState(); emitEstado();
    return res.json({success:true,ok:true,advisor,asesor:{id:a.id,nombre:a.nombre,modulo}});
  }

  // Validación sin contraseña (original — solo módulo)
  advisor.loggedIn=true; advisor.moduleNumber=modulo; advisor.paused=false;
  modulos[modulo]={asesorNombre:'Asesor '+modulo,estado:'disponible',turnoActual:null};
  saveState(); emitEstado();
  res.json({success:true,ok:true,advisor,asesor:{nombre:'Asesor '+modulo,modulo}});
});

// Pausa
app.post('/api/asesor/pausa', (req,res)=>{
  const modulo=clamp(req.body.modulo||advisor.moduleNumber,12);
  if (req.body.activa!==undefined) {
    advisor.paused=req.body.activa;
    if (modulos[modulo]) modulos[modulo].estado=req.body.activa?'pausa':'disponible';
  } else {
    advisor.paused=!advisor.paused;
    if (modulos[modulo]) modulos[modulo].estado=advisor.paused?'pausa':'disponible';
  }
  saveState(); emitEstado();
  res.json({success:true,ok:true,advisor});
});

// Llamar siguiente turno
app.post('/api/asesor/llamar', (req,res)=>{
  if (!advisor.loggedIn&&!req.body.modulo)
    return res.status(400).json({success:false,ok:false,error:'Inicia sesión primero.'});
  if (advisor.paused)
    return res.status(400).json({success:false,ok:false,error:'El módulo está en pausa.'});
  if (currentTicket)
    return res.status(400).json({success:false,ok:false,error:'Finaliza el turno actual primero.'});

  const sid=req.body.servicioId||req.body.serviceId;
  const idx=sid ? queue.findIndex(t=>t.serviceId===sid) : queue.findIndex(t=>advisor.serviceIds.includes(t.serviceId));
  if (idx===-1)
    return res.status(404).json({success:false,ok:false,error:'No hay turnos en espera.'});

  const [ticket]=queue.splice(idx,1);
  ticket.status='En atencion'; ticket.callCount=1;
  ticket.calledAt=nowIso(); ticket.attentionStartedAt=ticket.calledAt;
  ticket.moduleNumber=req.body.modulo||advisor.moduleNumber;
  currentTicket=ticket;

  const mod=ticket.moduleNumber;
  if (modulos[mod]) { modulos[mod].estado='ocupado'; modulos[mod].turnoActual=ticket.id; }

  registerCall(ticket,'Llamado');
  saveState();
  io.emit('turno-llamado',{turno:publicTicket(ticket),modulo:mod});
  emitEstado();
  res.json({success:true,ok:true,turno:publicTicket(ticket)});
});

// Alias original
app.post('/api/llamar', (req,res,next)=>{ req.url='/api/asesor/llamar'; next(); });

// Rellamar
app.post('/api/asesor/rellamar', (req,res)=>{
  if (!currentTicket) return res.status(400).json({success:false,ok:false,error:'No hay turno activo.'});
  currentTicket.callCount++;
  const mod=req.body.modulo||currentTicket.moduleNumber||advisor.moduleNumber;
  registerCall(currentTicket,'Rellamado');
  saveState();
  io.emit('turno-llamado',{turno:publicTicket(currentTicket),modulo:mod,rellamado:true});
  emitEstado();
  res.json({success:true,ok:true,turno:publicTicket(currentTicket)});
});
app.post('/api/rellamar', (req,res,next)=>{ req.url='/api/asesor/rellamar'; next(); });

// Ausente
app.post('/api/asesor/ausente', (req,res)=>{
  if (!currentTicket) return res.status(400).json({success:false,ok:false,error:'No hay turno activo.'});
  const mod=req.body.modulo||currentTicket.moduleNumber||advisor.moduleNumber;
  if (modulos[mod]) { modulos[mod].estado='disponible'; modulos[mod].turnoActual=null; }
  const t=finalizeCurrentTicket('Ausente');
  saveState(); emitEstado();
  res.json({success:true,ok:true,turno:publicTicket(t)});
});
app.post('/api/ausencia', (req,res,next)=>{ req.url='/api/asesor/ausente'; next(); });

// Finalizar
app.post('/api/asesor/finalizar', (req,res)=>{
  if (!currentTicket) return res.status(400).json({success:false,ok:false,error:'No hay turno activo.'});
  const mod=req.body.modulo||currentTicket.moduleNumber||advisor.moduleNumber;
  if (modulos[mod]) { modulos[mod].estado='disponible'; modulos[mod].turnoActual=null; }
  const t=finalizeCurrentTicket('Finalizado',req.body.notes||req.body.notas);
  // Quitar el turno finalizado de ultimosLlamados para que desaparezca de la pantalla
  if (t) ultimosLlamados=ultimosLlamados.filter(u=>u.codigo!==t.id);
  saveState();
  io.emit('turno-finalizado', { turnoId: t ? t.id : null });
  emitEstado();
  res.json({success:true,ok:true,turno:publicTicket(t)});
});
app.post('/api/finalizar', (req,res,next)=>{ req.url='/api/asesor/finalizar'; next(); });

// Cola asesor
app.get('/api/asesor/cola', (req,res)=>res.json(queue.map(publicTicket)));

// Seleccionar servicios del asesor (original)
app.post('/api/asesor/servicios', (req,res)=>{
  const ids=Array.isArray(req.body.serviceIds)?req.body.serviceIds:[];
  const valid=ids.filter(id=>services.find(s=>s.id===id));
  if (!valid.length) return res.status(400).json({success:false,message:'Selecciona al menos un servicio.'});
  advisor.serviceIds=valid; saveState();
  res.json({success:true,advisor});
});

// ══════════════════════════════════════════════════════════════════════════════
//  API ADMIN
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/admin/login', (req,res)=>{
  const u=adminUsers.find(x=>x.email===req.body.email&&x.password===req.body.password&&x.rol==='admin');
  if (!u) return res.status(401).json({success:false,ok:false,error:'Credenciales incorrectas'});
  res.json({success:true,ok:true,usuario:{id:u.id,nombre:u.nombre,email:u.email,rol:u.rol}});
});

app.get('/api/admin/dashboard', (req,res)=>res.json(buildStatePayload()));

app.get('/api/admin/turnos', (req,res)=>{
  const all=[...history,...queue];
  if (currentTicket) all.push(currentTicket);
  res.json(all.sort((a,b)=>new Date(b.queueEnteredAt)-new Date(a.queueEnteredAt))
    .slice(0,100).map(publicTicket));
});

app.get('/api/admin/servicios', (req,res)=>res.json(services));

app.get('/api/admin/usuarios', (req,res)=>res.json(adminUsers.map(u=>({...u,password:undefined}))));
app.post('/api/admin/usuarios', (req,res)=>{
  const u={id:'u'+Date.now(),...req.body};
  adminUsers.push(u);
  res.json({...u,password:undefined});
});
app.delete('/api/admin/usuarios/:id', (req,res)=>{
  adminUsers=adminUsers.filter(u=>u.id!==req.params.id);
  res.json({ok:true});
});

// Mensajes de espera
app.post('/api/mensajes', (req,res)=>{
  const msgs=Array.isArray(req.body.messages)?req.body.messages.map(m=>clamp(m,140)).filter(Boolean):[];
  if (!msgs.length) return res.status(400).json({success:false,message:'Ingresa al menos un mensaje.'});
  waitMessages=msgs; saveState();
  res.json({success:true,waitMessages});
});

// Reporte CSV
app.get('/api/reportes.csv', (req,res)=>{
  const headers=['Codigo','Servicio','Estado','Canal','Modulo','Ingreso','Llamado','Finalizado','Espera(min)','Atencion(min)','Notas'];
  const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const rows=history.map(t=>[t.id,t.serviceName,t.status,t.channel,t.moduleNumber||'',
    t.queueEnteredAt||'',t.calledAt||'',t.attentionFinishedAt||'',
    minutesBetween(t.queueEnteredAt,t.calledAt),
    minutesBetween(t.attentionStartedAt,t.attentionFinishedAt),t.notes||'']);
  const csv=[headers,...rows].map(r=>r.map(esc).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="reporte-turnos.csv"');
  res.send('\ufeff'+csv);
});

// Login genérico antiguo
app.post('/api/login', (req,res)=>{
  const{username,password}=req.body;
  if (username==='admin'&&password==='admin123') return res.json({success:true,redirect:'/admin'});
  if (username==='asesor01'&&password==='1234')  return res.json({success:true,redirect:'/asesor'});
  res.status(401).json({success:false,message:'Usuario o contraseña incorrectos'});
});

// ══════════════════════════════════════════════════════════════════════════════
//  ERROR HANDLER
// ══════════════════════════════════════════════════════════════════════════════
app.use((err,req,res,next)=>{
  console.error('Error interno:',err);
  res.status(500).json({success:false,message:'Error interno del servidor.'});
});

// ══════════════════════════════════════════════════════════════════════════════
//  INICIO
// ══════════════════════════════════════════════════════════════════════════════
loadState();
server.listen(PORT, ()=>{
  console.log(`🚀 TurnoFlow corriendo en http://localhost:${PORT}`);
  console.log(`   → Cliente:  http://localhost:${PORT}/cliente`);
  console.log(`   → Asesor:   http://localhost:${PORT}/asesor   (módulo 1-3, pass: 1234)`);
  console.log(`   → Admin:    http://localhost:${PORT}/admin    (admin@turnos.com / admin123)`);
  console.log(`   → Pantalla: http://localhost:${PORT}/pantalla`);
});
