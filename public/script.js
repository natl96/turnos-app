const appState = {
    page: document.body.dataset.page,
    data: null,
    language: 'es',
    currentTicketId: '',
    inactivityTimer: null,
    messageInterval: null,
    messageSignature: '',
    lastChimeKey: ''
};

const copy = {
    es: {
        'client.title': 'Solicita tu turno sin filas confusas',
        'client.subtitle': 'El flujo prioriza una sola accion principal, alto contraste y una lectura inmediata del estado del servicio.',
        'client.metricQueue': 'personas en espera',
        'client.metricEstimate': 'espera estimada',
        'client.metricCall': 'ultimo llamado',
        'client.highContrast': 'Alto contraste',
        'client.language': 'Idioma',
        'client.quickAccess': 'Acceso rapido desde movil',
        'client.primaryAction': 'Solicitar turno',
        'client.primaryHelp': 'Selecciona un servicio, define el canal y elige si quieres ticket impreso o digital.',
        'client.channel': 'Canal',
        'client.delivery': 'Entrega',
        'client.printed': 'Ticket impreso',
        'client.digital': 'Ticket digital',
        'client.phone': 'Telefono',
        'client.email': 'Correo',
        'client.generate': 'Generar ticket',
        'client.ticketReady': 'Ticket generado',
        'client.cancelTurn': 'Cancelar turno',
        'client.createdAt': 'Creado',
        'client.waitingPeople': 'Personas adelante',
        'client.waitEstimate': 'Espera estimada',
        'client.autoReset': 'La pantalla vuelve al inicio tras 15 segundos de inactividad.',
        'client.liveStatus': 'Estado en tiempo real',
        'client.liveHelp': 'Informacion visible para reducir incertidumbre y facilitar la decision.',
        'client.averageWait': 'Promedio actual',
        'client.activeService': 'Servicio recomendado',
        'client.currentModule': 'Modulo activo',
        'client.cancelTitle': 'Cancelar solicitud',
        'client.cancelHelp': 'Puedes anular un turno pendiente con tu codigo.',
        'client.ticketCode': 'Codigo del turno',
        'client.phonePlaceholder': '3001234567',
        'client.emailPlaceholder': 'cliente@correo.com',
        'client.ticketPhysical': 'Ticket impreso para sala',
        'client.ticketDigital': 'Ticket digital enviado al contacto',
        'client.resetMessage': 'La pantalla volvio al inicio por inactividad.',
        'client.createdMessage': 'Turno generado correctamente.',
        'client.cancelledMessage': 'Turno cancelado correctamente.'
    },
    en: {
        'client.title': 'Request your turn without confusing queues',
        'client.subtitle': 'The flow highlights one primary action, strong contrast and a fast reading of the service status.',
        'client.metricQueue': 'people waiting',
        'client.metricEstimate': 'estimated wait',
        'client.metricCall': 'latest call',
        'client.highContrast': 'High contrast',
        'client.language': 'Language',
        'client.quickAccess': 'Quick mobile access',
        'client.primaryAction': 'Request a ticket',
        'client.primaryHelp': 'Choose a service, define the channel and decide if you want a printed or digital ticket.',
        'client.channel': 'Channel',
        'client.delivery': 'Delivery',
        'client.printed': 'Printed ticket',
        'client.digital': 'Digital ticket',
        'client.phone': 'Phone',
        'client.email': 'Email',
        'client.generate': 'Generate ticket',
        'client.ticketReady': 'Ticket ready',
        'client.cancelTurn': 'Cancel turn',
        'client.createdAt': 'Created',
        'client.waitingPeople': 'People ahead',
        'client.waitEstimate': 'Estimated wait',
        'client.autoReset': 'The screen returns to start after 15 seconds of inactivity.',
        'client.liveStatus': 'Live status',
        'client.liveHelp': 'Visible information reduces uncertainty and supports better decisions.',
        'client.averageWait': 'Current average',
        'client.activeService': 'Recommended service',
        'client.currentModule': 'Active module',
        'client.cancelTitle': 'Cancel request',
        'client.cancelHelp': 'You can cancel a pending turn using its code.',
        'client.ticketCode': 'Turn code',
        'client.phonePlaceholder': '3001234567',
        'client.emailPlaceholder': 'customer@email.com',
        'client.ticketPhysical': 'Printed ticket for lobby',
        'client.ticketDigital': 'Digital ticket sent to contact',
        'client.resetMessage': 'The screen returned to the start due to inactivity.',
        'client.createdMessage': 'Ticket created successfully.',
        'client.cancelledMessage': 'Ticket cancelled successfully.'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (appState.page === 'client') {
        initClient();
    } else if (appState.page === 'advisor') {
        initAdvisor();
    } else if (appState.page === 'admin') {
        initAdmin();
    }
});

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function t(key) {
    return copy[appState.language]?.[key] || copy.es[key] || key;
}

function formatDateTime(iso, language = appState.language) {
    if (!iso) {
        return '--';
    }

    const locale = language === 'en' ? 'en-US' : 'es-CO';
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(iso));
}

function formatMinutes(value) {
    const minutes = Number(value) || 0;
    return `${minutes} min`;
}

function setFeedback(id, message = '', type = 'info') {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = `feedback ${message ? type : ''}`.trim();
}

async function apiRequest(url, options = {}) {
    const requestOptions = {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'No fue posible completar la accion.');
    }

    return payload;
}

async function fetchState() {
    const data = await apiRequest('/api/estado');
    appState.data = data;
    return data;
}

function getSelectedServiceId() {
    return document.querySelector('input[name="serviceId"]:checked')?.value || '';
}

function setLanguage(language) {
    appState.language = language;

    document.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    });

    if (appState.page === 'client' && appState.data) {
        renderClientStats(appState.data);
    }
}

function toggleContrast() {
    document.body.classList.toggle('high-contrast');
}

function initClient() {
    setLanguage('es');
    document.getElementById('language-select').addEventListener('change', (event) => {
        setLanguage(event.target.value);
    });
    document.getElementById('contrast-toggle').addEventListener('click', toggleContrast);
    document.getElementById('ticket-form').addEventListener('submit', handleTicketRequest);
    document.getElementById('cancel-form').addEventListener('submit', handleTicketCancel);
    document.getElementById('ticket-cancel-btn').addEventListener('click', async () => {
        if (appState.currentTicketId) {
            await cancelTicketById(appState.currentTicketId);
        }
    });

    document.addEventListener('click', resetInactivityTimer, true);
    document.addEventListener('keydown', resetInactivityTimer, true);
    document.addEventListener('touchstart', resetInactivityTimer, true);

    configureQuickAccess();
    refreshClient();
    setInterval(refreshClient, 5000);
    resetInactivityTimer();
}

function configureQuickAccess() {
    const url = window.location.href;
    const link = document.getElementById('quick-link');
    const qrImage = document.getElementById('qr-access');
    const fallback = document.getElementById('qr-fallback');

    link.href = url;
    link.textContent = url.replace(/^https?:\/\//, '');
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
    qrImage.addEventListener('error', () => {
        fallback.classList.remove('hidden');
    }, { once: true });
}

function resetInactivityTimer() {
    if (appState.page !== 'client') {
        return;
    }

    window.clearTimeout(appState.inactivityTimer);
    appState.inactivityTimer = window.setTimeout(() => {
        resetClientView(true);
    }, 15000);
}

function resetClientView(showMessage = false) {
    const form = document.getElementById('ticket-form');
    form.reset();
    appState.currentTicketId = '';
    document.getElementById('ticket-result').classList.add('hidden');
    document.getElementById('cancel-ticket-id').value = '';
    renderClientServices(appState.data?.services || []);
    renderClientStats(appState.data || {
        enEspera: [],
        recentCalls: [],
        dashboard: {},
        services: []
    });
    setFeedback('client-feedback', showMessage ? t('client.resetMessage') : '', 'info');
}

async function refreshClient() {
    try {
        const data = await fetchState();
        renderClientServices(data.services);
        renderClientStats(data);
    } catch (error) {
        setFeedback('client-feedback', error.message, 'error');
    }
}

function renderClientServices(services) {
    const container = document.getElementById('service-options');
    const selectedServiceId = getSelectedServiceId() || services[0]?.id;

    container.innerHTML = services.map((service) => `
        <div class="service-option">
            <input type="radio" name="serviceId" id="service-${escapeHtml(service.id)}" value="${escapeHtml(service.id)}" ${service.id === selectedServiceId ? 'checked' : ''}>
            <label for="service-${escapeHtml(service.id)}">
                <span class="service-prefix">${escapeHtml(service.prefix)}</span>
                <span class="service-name">${escapeHtml(service.name)}</span>
                <span class="service-estimate">${formatMinutes(service.estimatedMinutes)}</span>
            </label>
        </div>
    `).join('');

    container.querySelectorAll('input[name="serviceId"]').forEach((input) => {
        input.addEventListener('change', () => renderClientStats(appState.data));
    });
}

function renderClientStats(data) {
    const selectedService = data.services.find((service) => service.id === getSelectedServiceId()) || data.services[0];
    const latestCall = data.recentCalls[0];
    const queueCount = data.enEspera.length;
    const moduleLabel = data.turnoActual?.moduleNumber ? `Modulo ${data.turnoActual.moduleNumber}` : '--';

    document.getElementById('client-queue-count').textContent = String(queueCount);
    document.getElementById('client-last-call').textContent = latestCall?.id || '---';
    document.getElementById('client-estimate').textContent = selectedService
        ? formatMinutes((selectedService.estimatedMinutes || 0) * Math.max(1, queueCount + (data.turnoActual ? 1 : 0)))
        : '--';
    document.getElementById('client-average-wait').textContent = formatMinutes(data.dashboard.avgWaitMinutes || 0);
    document.getElementById('client-selected-service').textContent = selectedService?.name || '--';
    document.getElementById('client-current-module').textContent = moduleLabel;

    if (appState.currentTicketId) {
        document.getElementById('cancel-ticket-id').value = appState.currentTicketId;
    }
}

async function handleTicketRequest(event) {
    event.preventDefault();
    const deliveryType = document.querySelector('input[name="deliveryType"]:checked')?.value || 'impreso';

    try {
        const ticket = await apiRequest('/api/turnos', {
            method: 'POST',
            body: JSON.stringify({
                serviceId: getSelectedServiceId(),
                channel: document.getElementById('channel-input').value,
                deliveryType,
                phone: document.getElementById('phone-input').value,
                email: document.getElementById('email-input').value,
                language: appState.language
            })
        });

        appState.currentTicketId = ticket.id;
        document.getElementById('cancel-ticket-id').value = ticket.id;
        renderTicket(ticket);
        setFeedback('client-feedback', t('client.createdMessage'), 'success');
        await refreshClient();
    } catch (error) {
        setFeedback('client-feedback', error.message, 'error');
    }
}

function renderTicket(ticket) {
    document.getElementById('ticket-result').classList.remove('hidden');
    document.getElementById('ticket-number').textContent = ticket.id;
    document.getElementById('ticket-service').textContent = ticket.serviceName;
    document.getElementById('ticket-created').textContent = formatDateTime(ticket.queueEnteredAt);
    document.getElementById('ticket-people').textContent = String(ticket.peopleAhead);
    document.getElementById('ticket-wait').textContent = formatMinutes(ticket.estimatedWaitMinutes);
    document.getElementById('ticket-delivery').textContent = ticket.deliveryType === 'digital'
        ? t('client.ticketDigital')
        : t('client.ticketPhysical');

    const contactMessage = ticket.deliveryType === 'digital'
        ? `${ticket.phone || '--'}${ticket.email ? ` | ${ticket.email}` : ''}`
        : t('client.ticketPhysical');
    document.getElementById('ticket-contact').textContent = contactMessage;
}

async function handleTicketCancel(event) {
    event.preventDefault();
    const ticketId = document.getElementById('cancel-ticket-id').value.trim();
    await cancelTicketById(ticketId);
}

async function cancelTicketById(ticketId) {
    if (!ticketId) {
        setFeedback('client-feedback', 'Ingresa un codigo de turno valido.', 'error');
        return;
    }

    try {
        await apiRequest(`/api/turnos/${encodeURIComponent(ticketId)}/cancelar`, { method: 'POST' });
        appState.currentTicketId = '';
        document.getElementById('ticket-result').classList.add('hidden');
        document.getElementById('cancel-ticket-id').value = '';
        setFeedback('client-feedback', t('client.cancelledMessage'), 'success');
        await refreshClient();
    } catch (error) {
        setFeedback('client-feedback', error.message, 'error');
    }
}

function initAdvisor() {
    document.getElementById('advisor-login-form').addEventListener('submit', handleAdvisorLogin);
    document.getElementById('call-next-btn').addEventListener('click', () => advisorAction('/api/llamar', 'Llamado realizado.'));
    document.getElementById('recall-btn').addEventListener('click', () => advisorAction('/api/rellamar', 'Turno rellamado.'));
    document.getElementById('absent-btn').addEventListener('click', () => advisorAction('/api/ausencia', 'Turno marcado como ausente.'));
    document.getElementById('pause-btn').addEventListener('click', () => advisorAction('/api/asesor/pausa', 'Estado del modulo actualizado.'));
    document.getElementById('finish-btn').addEventListener('click', handleFinishAttention);
    document.getElementById('advisor-service-scope').addEventListener('change', handleServiceScopeChange);

    refreshAdvisor();
    setInterval(refreshAdvisor, 3000);
}

async function refreshAdvisor() {
    try {
        const data = await fetchState();
        renderAdvisorState(data);
    } catch (error) {
        setFeedback('advisor-feedback', error.message, 'error');
    }
}

function renderAdvisorState(data) {
    const advisorLabel = data.advisor.loggedIn ? 'Activo' : 'Sin sesion';
    document.getElementById('advisor-status-label').textContent = advisorLabel;
    document.getElementById('advisor-module-chip').textContent = data.advisor.loggedIn
        ? `Modulo ${data.advisor.moduleNumber}`
        : 'Sin modulo';
    document.getElementById('advisor-scope-summary').textContent = data.services
        .filter((service) => data.advisor.serviceIds.includes(service.id))
        .map((service) => service.prefix)
        .join(', ') || 'Todos';

    const current = data.turnoActual;
    document.getElementById('advisor-current-code').textContent = current?.id || '---';
    document.getElementById('advisor-current-service').textContent = current
        ? `${current.serviceName} | ${current.status}`
        : 'Esperando siguiente turno';
    document.getElementById('advisor-call-count').textContent = `Llamados: ${current?.callCount || 0}`;
    document.getElementById('advisor-current-time').textContent = `Inicio: ${formatDateTime(current?.attentionStartedAt || current?.calledAt, 'es')}`;
    document.getElementById('advisor-queue-badge').textContent = `${data.enEspera.length} pendientes`;
    document.getElementById('advisor-kpi-queue').textContent = String(data.dashboard.queueTotal || 0);
    document.getElementById('advisor-kpi-wait').textContent = formatMinutes(data.dashboard.avgWaitMinutes || 0);
    document.getElementById('advisor-kpi-done').textContent = String(data.dashboard.completedCount || 0);
    document.getElementById('advisor-kpi-absent').textContent = String(data.dashboard.absentCount || 0);

    renderAdvisorQueue(data.enEspera);
    renderAdvisorServices(data.services, data.advisor.serviceIds);

    const controlsDisabled = !data.advisor.loggedIn;
    document.getElementById('call-next-btn').disabled = controlsDisabled || data.advisor.paused || Boolean(current);
    document.getElementById('recall-btn').disabled = controlsDisabled || !current;
    document.getElementById('absent-btn').disabled = controlsDisabled || !current;
    document.getElementById('finish-btn').disabled = controlsDisabled || !current;
    document.getElementById('pause-btn').disabled = controlsDisabled;
    document.getElementById('pause-btn').textContent = data.advisor.paused ? 'Reanudar modulo' : 'Poner en pausa';

    if (data.advisor.loggedIn && !document.getElementById('module-input').value) {
        document.getElementById('module-input').value = data.advisor.moduleNumber;
    }
}

function renderAdvisorQueue(queue) {
    const container = document.getElementById('advisor-queue');

    if (!queue.length) {
        container.innerHTML = '<div class="queue-item"><div class="queue-main"><strong>No hay turnos pendientes.</strong><span class="muted">La cola esta vacia por ahora.</span></div></div>';
        return;
    }

    container.innerHTML = queue.map((ticket) => `
        <div class="queue-item">
            <div class="queue-main">
                <strong class="queue-code">${escapeHtml(ticket.id)}</strong>
                <span>${escapeHtml(ticket.serviceName)}</span>
            </div>
            <div class="queue-side">
                <div>${formatDateTime(ticket.queueEnteredAt, 'es')}</div>
                <div>${formatMinutes(ticket.estimatedWaitMinutes)}</div>
            </div>
        </div>
    `).join('');
}

function renderAdvisorServices(services, activeServiceIds) {
    const container = document.getElementById('advisor-service-scope');
    container.innerHTML = services.map((service) => `
        <label class="toggle-item">
            <span>${escapeHtml(service.name)} <small class="muted">(${formatMinutes(service.estimatedMinutes)})</small></span>
            <input type="checkbox" value="${escapeHtml(service.id)}" ${activeServiceIds.includes(service.id) ? 'checked' : ''}>
        </label>
    `).join('');
}

async function handleAdvisorLogin(event) {
    event.preventDefault();

    try {
        await apiRequest('/api/asesor/login', {
            method: 'POST',
            body: JSON.stringify({ moduleNumber: document.getElementById('module-input').value })
        });
        setFeedback('advisor-feedback', 'Sesion iniciada correctamente.', 'success');
        await refreshAdvisor();
    } catch (error) {
        setFeedback('advisor-feedback', error.message, 'error');
    }
}

async function advisorAction(url, successMessage) {
    try {
        await apiRequest(url, { method: 'POST' });
        setFeedback('advisor-feedback', successMessage, 'success');
        await refreshAdvisor();
    } catch (error) {
        setFeedback('advisor-feedback', error.message, 'error');
    }
}

async function handleServiceScopeChange() {
    const serviceIds = Array.from(document.querySelectorAll('#advisor-service-scope input:checked')).map((input) => input.value);

    try {
        await apiRequest('/api/asesor/servicios', {
            method: 'POST',
            body: JSON.stringify({ serviceIds })
        });
        setFeedback('advisor-feedback', 'Servicios del modulo actualizados.', 'success');
        await refreshAdvisor();
    } catch (error) {
        setFeedback('advisor-feedback', error.message, 'error');
    }
}

async function handleFinishAttention() {
    try {
        await apiRequest('/api/finalizar', {
            method: 'POST',
            body: JSON.stringify({ notes: document.getElementById('notes-input').value })
        });
        document.getElementById('notes-input').value = '';
        setFeedback('advisor-feedback', 'Atencion finalizada y registrada.', 'success');
        await refreshAdvisor();
    } catch (error) {
        setFeedback('advisor-feedback', error.message, 'error');
    }
}

function initAdmin() {
    document.getElementById('service-form').addEventListener('submit', handleServiceSave);
    document.getElementById('service-reset-btn').addEventListener('click', resetServiceForm);
    document.getElementById('save-messages-btn').addEventListener('click', handleSaveMessages);
    document.getElementById('admin-service-list').addEventListener('click', handleServiceListClick);

    refreshAdmin();
    setInterval(refreshAdmin, 3000);
}

async function refreshAdmin() {
    try {
        const data = await fetchState();
        renderAdminState(data);
    } catch (error) {
        setFeedback('admin-feedback', error.message, 'error');
    }
}

function renderAdminState(data) {
    document.getElementById('admin-kpi-queue').textContent = String(data.dashboard.queueTotal || 0);
    document.getElementById('admin-kpi-wait').textContent = formatMinutes(data.dashboard.avgWaitMinutes || 0);
    document.getElementById('admin-kpi-done').textContent = String(data.dashboard.completedCount || 0);
    document.getElementById('admin-kpi-alert').textContent = data.dashboard.congestion ? 'Congestion' : 'Normal';
    document.getElementById('admin-board-badge').textContent = data.dashboard.congestion ? 'Fila saturada' : 'Operacion estable';
    document.getElementById('admin-current-code').textContent = data.turnoActual?.id || '---';
    document.getElementById('admin-current-service').textContent = data.turnoActual
        ? `${data.turnoActual.serviceName} | En atencion`
        : 'Esperando siguiente llamado';
    document.getElementById('admin-current-module').textContent = `Modulo: ${data.turnoActual?.moduleNumber || '--'}`;
    document.getElementById('admin-queue-total').textContent = `${data.enEspera.length} personas en espera`;

    const latestCallKey = data.recentCalls[0] ? `${data.recentCalls[0].id}-${data.recentCalls[0].timestamp}-${data.recentCalls[0].type}` : '';
    if (latestCallKey && latestCallKey !== appState.lastChimeKey) {
        appState.lastChimeKey = latestCallKey;
        playChime();
    }

    renderRecentCalls(data.recentCalls);
    renderServiceBars(data.dashboard.serviceLoad);
    renderServiceList(data.services);
    renderHistory(data.history);
    rotateMessages(data.waitMessages);

    const messageInput = document.getElementById('message-input');
    if (document.activeElement !== messageInput) {
        messageInput.value = data.waitMessages.join('\n');
    }
}

function renderRecentCalls(recentCalls) {
    const container = document.getElementById('admin-recent-calls');

    if (!recentCalls.length) {
        container.innerHTML = '<div class="call-entry">Sin llamados recientes.</div>';
        return;
    }

    container.innerHTML = recentCalls.map((call) => `
        <div class="call-entry">
            <div class="service-main">
                <strong>${escapeHtml(call.id)}</strong>
                <span>${escapeHtml(call.serviceName)} | ${escapeHtml(call.type)}</span>
            </div>
            <div class="queue-side">
                <div>Modulo ${escapeHtml(call.moduleNumber || '--')}</div>
                <div>${formatDateTime(call.timestamp, 'es')}</div>
            </div>
        </div>
    `).join('');
}

function renderServiceBars(serviceLoad) {
    const container = document.getElementById('admin-service-bars');
    const maxPending = Math.max(...serviceLoad.map((service) => service.pendingCount), 1);

    container.innerHTML = serviceLoad.map((service) => `
        <div class="bar-row">
            <strong>${escapeHtml(service.name)}</strong>
            <div class="bar-track">
                <div class="bar-fill" style="width:${(service.pendingCount / maxPending) * 100}%"></div>
            </div>
            <span>${service.pendingCount} en espera / ${service.completedCount} atendidos</span>
        </div>
    `).join('');
}

function renderServiceList(services) {
    const container = document.getElementById('admin-service-list');
    container.innerHTML = services.map((service) => `
        <div class="service-row">
            <div class="service-main">
                <strong>${escapeHtml(service.name)}</strong>
                <span>${escapeHtml(service.prefix)} | ${formatMinutes(service.estimatedMinutes)}</span>
            </div>
            <div class="button-group">
                <button type="button" class="ghost-button" data-action="edit-service" data-id="${escapeHtml(service.id)}">Editar</button>
                <button type="button" class="danger-button" data-action="delete-service" data-id="${escapeHtml(service.id)}">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function renderHistory(history) {
    const container = document.getElementById('admin-history');

    if (!history.length) {
        container.innerHTML = '<div class="history-entry"><div class="history-main"><strong>Sin historico todavia.</strong><span class="muted">Los cierres y cancelaciones apareceran aqui.</span></div></div>';
        return;
    }

    container.innerHTML = history.map((ticket) => `
        <div class="history-entry">
            <div class="history-main">
                <strong>${escapeHtml(ticket.id)}</strong>
                <span>${escapeHtml(ticket.serviceName)} | ${escapeHtml(ticket.status)}</span>
                <span class="muted">${escapeHtml(ticket.notes || 'Sin notas registradas.')}</span>
            </div>
            <div class="history-side">
                <div>${ticket.moduleNumber ? `Modulo ${escapeHtml(ticket.moduleNumber)}` : 'Sin modulo'}</div>
                <div>${formatDateTime(ticket.attentionFinishedAt || ticket.queueEnteredAt, 'es')}</div>
            </div>
        </div>
    `).join('');
}

function rotateMessages(messages) {
    const signature = messages.join('|');
    if (signature === appState.messageSignature) {
        return;
    }

    appState.messageSignature = signature;
    window.clearInterval(appState.messageInterval);
    let index = 0;
    const view = document.getElementById('admin-message-view');

    const showMessage = () => {
        view.textContent = messages.length ? messages[index % messages.length] : 'Sin mensajes configurados.';
        index += 1;
    };

    showMessage();
    appState.messageInterval = window.setInterval(showMessage, 4000);
}

async function handleServiceSave(event) {
    event.preventDefault();
    const editId = document.getElementById('service-edit-id').value;
    const payload = {
        name: document.getElementById('service-name-input').value,
        prefix: document.getElementById('service-prefix-input').value,
        estimatedMinutes: document.getElementById('service-time-input').value
    };

    try {
        await apiRequest(editId ? `/api/servicios/${encodeURIComponent(editId)}` : '/api/servicios', {
            method: editId ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        setFeedback('admin-feedback', 'Servicio guardado correctamente.', 'success');
        resetServiceForm();
        await refreshAdmin();
    } catch (error) {
        setFeedback('admin-feedback', error.message, 'error');
    }
}

function resetServiceForm() {
    document.getElementById('service-edit-id').value = '';
    document.getElementById('service-form').reset();
    document.getElementById('service-time-input').value = 5;
}

async function handleServiceListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    const service = appState.data?.services.find((item) => item.id === button.dataset.id);
    if (!service) {
        return;
    }

    if (button.dataset.action === 'edit-service') {
        document.getElementById('service-edit-id').value = service.id;
        document.getElementById('service-name-input').value = service.name;
        document.getElementById('service-prefix-input').value = service.prefix;
        document.getElementById('service-time-input').value = service.estimatedMinutes;
        setFeedback('admin-feedback', 'Editando servicio seleccionado.', 'info');
        return;
    }

    try {
        await apiRequest(`/api/servicios/${encodeURIComponent(service.id)}`, { method: 'DELETE' });
        setFeedback('admin-feedback', 'Servicio eliminado correctamente.', 'success');
        await refreshAdmin();
    } catch (error) {
        setFeedback('admin-feedback', error.message, 'error');
    }
}

async function handleSaveMessages() {
    const messages = document.getElementById('message-input').value
        .split('\n')
        .map((message) => message.trim())
        .filter(Boolean);

    try {
        await apiRequest('/api/mensajes', {
            method: 'POST',
            body: JSON.stringify({ messages })
        });
        setFeedback('admin-feedback', 'Mensajes actualizados correctamente.', 'success');
        await refreshAdmin();
    } catch (error) {
        setFeedback('admin-feedback', error.message, 'error');
    }
}

function playChime() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return;
        }

        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.24);

        gainNode.gain.setValueAtTime(0.0001, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.38);
    } catch (error) {
        console.warn('No fue posible reproducir la alerta sonora.', error);
    }
}
