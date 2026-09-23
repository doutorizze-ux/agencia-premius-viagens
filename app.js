const state = { view: 'dashboard', dashboard: null, leads: [], excursions: [], selectedLead: null, conversation: [], whatsapp: null, leadFilter: 'Todos', user: null, calendarMonth: new Date('2026-09-01T12:00:00') };
let waPollTimer = null;

const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);
const date = (value) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', '');
const dateTime = (value) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace('.', '');

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir a ação'); error.status = response.status; throw error; }
  return data;
}

function showApp() { $('#auth-root').innerHTML = ''; $('#app-shell').classList.remove('auth-hidden'); }

function renderLogin(message = '') {
  $('#app-shell').classList.add('auth-hidden');
  $('#auth-root').innerHTML = `<main class="auth-page"><section class="auth-card"><div class="auth-brand"><img src="/public/logo.png" alt="Agência Premius" /></div><p class="eyebrow">ACESSO RESTRITO</p><h1>Bem-vindo de volta</h1><p class="auth-copy">Entre para acompanhar seus leads, excursões e resultados.</p><form id="login-form" class="auth-form"><label class="form-label">E-mail<input class="form-control" type="email" name="email" placeholder="admin@agenciapremius.com" autocomplete="username" required /></label><label class="form-label">Senha<input class="form-control" type="password" name="password" placeholder="Digite sua senha" autocomplete="current-password" required /></label>${message ? `<div class="auth-error">${esc(message)}</div>` : ''}<button class="primary-button" type="submit">Entrar no painel <span>→</span></button></form><p class="auth-footnote">Acesso protegido para a equipe da Agência Premius.</p></section></main>`;
}

async function login(input) {
  const button = $('#login-form button[type="submit"]');
  button.disabled = true; button.textContent = 'Entrando…';
  try { const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }); state.user = result.user; showApp(); await loadData(); renderDashboard(); }
  catch (error) { renderLogin(error.message); }
}

function toast(message, error = false) {
  const root = $('#toast-root'); root.innerHTML = `<div class="toast ${error ? 'error' : ''}">${esc(message)}</div>`;
  setTimeout(() => { root.innerHTML = ''; }, 3600);
}

function setActiveNav() {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === state.view));
  const labels = { dashboard: 'Visão geral', leads: 'Leads', excursions: 'Excursões', whatsapp: 'WhatsApp', calendar: 'Calendário', reports: 'Relatórios' };
  $('#page-breadcrumb').textContent = labels[state.view] || 'Visão geral';
  document.querySelector('.sidebar')?.classList.remove('open');
}

function pageHeading(eyebrow, title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${subtitle ? `<p class="muted" style="margin:8px 0 0">${subtitle}</p>` : ''}</div>${action}</div>`;
}

function renderShell(content) { $('#view-container').innerHTML = `<div class="page">${content}</div>`; setActiveNav(); }

function metricCard(icon, color, label, value, trend, muted = false) { return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-trend ${muted ? 'muted-trend' : ''}">${trend}</div></div>`; }

function renderDashboard() {
  const data = state.dashboard || { stats: { activeExcursions: 0, totalLeads: 0, newLeads: 0, occupancy: 0, revenue: 0 }, upcoming: [], recentLeads: [] };
  const s = data.stats;
  const bars = [42, 57, 48, 73, 67, 88, 54].map((value, index) => `<div class="bar-col ${index === 5 ? 'today' : ''}"><div class="bar-stack" style="--height:${value + 35}px; --fill:${value}%"><i></i></div><span>${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][index]}</span></div>`).join('');
  const excursions = data.upcoming.map((item) => `<div class="upcoming-row"><div class="trip-icon ${item.color}">✦</div><div class="trip-info"><strong>${esc(item.title.split(' · ')[0])}</strong><small>${esc(item.destination)} · ${item.reserved}/${item.seats} lugares</small><div class="occupancy"><i style="width:${Math.min(100, (item.reserved / item.seats) * 100)}%"></i></div></div><div class="trip-date">saída<b>${date(item.date)}</b></div></div>`).join('');
  const leads = data.recentLeads.map((lead) => leadRow(lead, true)).join('');
  renderShell(`${pageHeading('QUARTA-FEIRA · 23 SET 2026', 'Bom dia, Eduardo <span style="color:var(--lime-deep)">✦</span>', 'Aqui está o pulso da sua operação hoje.', '<button class="primary-button" data-action="new-excursion">＋ Nova excursão</button>')}<div class="stats-grid">${metricCard('✦', 'blue', 'Excursões ativas', s.activeExcursions, '↑ 2 este mês')}${metricCard('◒', 'lime', 'Leads no funil', s.totalLeads, `↑ ${s.newLeads} novos hoje`)}${metricCard('♧', 'orange', 'Ocupação média', `${s.occupancy}%`, '↑ 8% vs. mês anterior')}${metricCard('R$', 'purple', 'Vendas em aberto', money(s.revenue), 'meta em andamento', true)}</div><div class="dashboard-grid"><section class="panel chart-panel"><div class="panel-header"><div class="panel-title"><h2>Ritmo de vendas</h2><span class="muted">últimos 7 dias</span></div><button class="panel-link" data-view="reports">Ver relatório →</button></div><div class="chart-wrap"><div class="chart-y"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><div class="chart"><div class="chart-lines"><i></i><i></i><i></i><i></i><i></i></div><div class="bars">${bars}</div></div></div><div class="chart-legend"><span><i class="legend-dot"></i>reservas</span><span><i class="legend-dot blue-dot"></i>novos leads</span></div></section><section class="panel upcoming-panel"><div class="panel-header"><div class="panel-title"><h2>Próximas saídas</h2><span class="muted">${data.upcoming.length} roteiros</span></div><button class="panel-link" data-view="excursions">Ver todas →</button></div><div class="upcoming-list">${excursions || '<div class="empty-card" style="border:0;border-radius:0;min-height:180px"><div><span>✦</span><strong>Nenhum roteiro</strong><p>Cadastre a primeira excursão.</p></div></div>'}</div></section><section class="panel leads-panel"><div class="panel-header"><div class="panel-title"><h2>Leads que pedem atenção</h2><span class="muted">priorizados pelo Jev</span></div><button class="panel-link" data-view="leads">Abrir central de leads →</button></div><table class="leads-table"><thead><tr><th>Contato</th><th>Excursão de interesse</th><th>Etapa</th><th>Última mensagem</th><th>Score Jev</th></tr></thead><tbody>${leads || '<tr><td colspan="5">Sem leads recentes.</td></tr>'}</tbody></table></section></div>`);
}

function leadAvatar(lead) { const tone = lead.analysis?.temperature === 'hot' ? '' : lead.analysis?.temperature === 'warm' ? 'blue' : 'purple'; return `<span class="lead-avatar ${tone}">${esc(lead.avatar || lead.name.split(' ').map((part) => part[0]).slice(0, 2).join(''))}</span>`; }
function score(lead) { const temp = lead.analysis?.temperature || (lead.score > 80 ? 'hot' : lead.score > 60 ? 'warm' : 'cold'); return `<span class="lead-score"><span class="score-ring ${temp === 'warm' ? 'warm' : temp === 'cold' ? 'cold' : ''}">${lead.score || '—'}</span></span>`; }
function stageBadge(stage) { const cls = stage === 'Em conversa' || stage === 'Proposta enviada' ? 'blue-stage' : stage === 'Aguardando' ? 'orange-stage' : stage === 'Fechado' ? 'gray-stage' : ''; return `<span class="stage-badge ${cls}"><i></i>${esc(stage)}</span>`; }
function tag(lead) { const cls = lead.tag?.includes('Orçamento') ? 'orange-tag' : lead.tag?.includes('Retorno') ? 'purple-tag' : lead.tag?.includes('Follow') ? 'gray-tag' : ''; return `<span class="tag ${cls}">${esc(lead.tag || 'Novo lead')}</span>`; }
function leadRow(lead, table = false) { const row = `<div class="lead-person">${leadAvatar(lead)}<span><strong>${esc(lead.name)}</strong><small>${esc(lead.source || 'WhatsApp')} · ${lead.phone ? `+${lead.phone.slice(0, 2)} (${lead.phone.slice(2, 4)}) ${lead.phone.slice(4, 9)}-${lead.phone.slice(9)}` : 'contato'}</small></span></div>`; if (table) return `<tr data-lead-id="${lead.id}"><td>${row}</td><td>${esc(lead.excursion || 'Sem excursão')}</td><td>${stageBadge(lead.stage)}</td><td style="max-width:290px"><span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lead.lastMessage)}</span><small style="display:block;color:#a5afb2;margin-top:4px;font-size:9px">${dateTime(lead.lastAt)}</small></td><td>${score(lead)}</td></tr>`; return row; }

function renderLeads() {
  const filtered = state.leads.filter((lead) => state.leadFilter === 'Todos' || (state.leadFilter === 'Quentes' ? lead.analysis?.temperature === 'hot' : lead.stage === state.leadFilter));
  const selected = state.selectedLead || filtered[0] || state.leads[0];
  if (selected && (!state.selectedLead || state.selectedLead.id !== selected.id)) state.selectedLead = selected;
  const list = filtered.map((lead) => `<div class="lead-row ${lead.id === selected?.id ? 'selected' : ''}" data-lead-id="${lead.id}">${leadAvatar(lead)}<div class="lead-row-main"><strong>${esc(lead.name)} ${lead.unread ? '<span style="color:#df8d69;font-size:10px">●</span>' : ''}</strong><small>${esc(lead.lastMessage)}</small></div><div class="lead-row-meta"><time>${dateTime(lead.lastAt)}</time>${tag(lead)}</div></div>`).join('');
  const detail = selected ? renderLeadDetail(selected) : '<div class="empty-card" style="border:0"><div><span>◒</span><strong>Selecione um lead</strong><p>Os detalhes aparecem aqui.</p></div></div>';
  renderShell(`${pageHeading('RELACIONAMENTO', 'Central de leads', 'Cada conversa organizada para virar uma próxima viagem.', '<button class="primary-button" data-action="new-lead">＋ Cadastrar lead</button>')}<div class="toolbar"><div class="search-field"><span>⌕</span><input id="lead-search" placeholder="Buscar por nome ou mensagem" value="" /></div><div class="view-tabs">${['Todos', 'Quentes', 'Novo', 'Em conversa', 'Aguardando'].map((item) => `<button class="${state.leadFilter === item ? 'active' : ''}" data-lead-filter="${item}">${item}</button>`).join('')}</div></div><div class="leads-view-grid"><section class="panel lead-list-panel"><div class="panel-header"><div class="panel-title"><h2>${filtered.length} contatos</h2><span class="muted">ordenados por prioridade</span></div><button class="icon-button" title="Atualizar" data-action="refresh">↻</button></div><div id="lead-list">${list || '<div class="empty-card" style="border:0"><div><span>◒</span><strong>Nenhum lead nesta etapa</strong><p>Altere o filtro ou cadastre um contato.</p></div></div>'}</div></section><section class="panel detail-panel" id="lead-detail">${detail}</section></div>`);
}

function renderLeadDetail(lead) {
  const excursion = state.excursions.find((item) => item.id === lead.excursionId); const analysis = lead.analysis || {};
  const intent = { booking: 'reserva / fechamento', price: 'preço e condições', question: 'informações do roteiro', other: 'conversa geral' }[analysis.intent] || 'aguardando análise';
  const tempLabel = { hot: 'Lead quente', warm: 'Em avaliação', cold: 'Nutrição' }[analysis.temperature] || 'Sem análise';
  return `<div class="detail-header"><div class="detail-person">${leadAvatar(lead)}<div><strong>${esc(lead.name)}</strong><small>${lead.phone ? `+${lead.phone}` : 'Contato sem telefone'} · entrou pelo ${esc(lead.source || 'WhatsApp')}</small></div><button class="icon-button" style="margin-left:auto" title="Mais opções">•••</button></div></div><div class="detail-body"><div class="detail-section"><p class="detail-section-label">Etapa do funil</p><select class="stage-select" id="lead-stage"><option ${lead.stage === 'Novo' ? 'selected' : ''}>Novo</option><option ${lead.stage === 'Em conversa' ? 'selected' : ''}>Em conversa</option><option ${lead.stage === 'Proposta enviada' ? 'selected' : ''}>Proposta enviada</option><option ${lead.stage === 'Aguardando' ? 'selected' : ''}>Aguardando</option><option ${lead.stage === 'Fechado' ? 'selected' : ''}>Fechado</option></select></div><div class="detail-section"><p class="detail-section-label">Interesse identificado</p><div class="detail-line"><span>Excursão</span><b>${esc(excursion?.title || 'Não definido')}</b></div><div class="detail-line"><span>Principal intenção</span><b>${intent}</b></div><div class="detail-line"><span>Último contato</span><b>${dateTime(lead.lastAt)}</b></div></div><div class="detail-section"><div class="ai-box"><div class="ai-box-head"><span>✦ Jev · ${tempLabel}</span><span>${Math.round((analysis.confidence || 0) * 100)}%</span></div><p>${analysis.temperature === 'hot' ? 'A mensagem demonstra intenção clara de fechar. Priorize um retorno agora e facilite a reserva.' : analysis.temperature === 'warm' ? 'A pessoa está comparando opções. Responda a dúvida principal e conduza para uma decisão.' : 'Ainda não há intenção clara. Mantenha a conversa leve e programe um novo contato.'}</p><div class="confidence"><i style="width:${Math.max(8, (analysis.confidence || .5) * 100)}%"></i></div></div></div><div class="detail-actions"><button class="secondary-button" data-action="open-conversation" data-lead-id="${lead.id}">Abrir conversa</button><button class="primary-button" data-action="analyze-lead" data-lead-id="${lead.id}">✦ Reanalisar</button></div></div>`;
}

function pollWhatsAppStatus(attempt = 0) {
  clearTimeout(waPollTimer);
  if (state.view !== 'whatsapp' || attempt > 40) return;
  waPollTimer = setTimeout(async () => {
    try { state.whatsapp = await api('/api/whatsapp/status'); await renderWhatsApp(); if (state.whatsapp.status === 'connecting') pollWhatsAppStatus(attempt + 1); }
    catch (error) { toast(error.message, true); }
  }, 1500);
}

function renderExcursions() {
  const cards = state.excursions.map((item) => `<article class="excursion-card"><div class="excursion-banner ${item.color}"><span>${esc(item.status)}</span></div><div class="excursion-card-body"><h3>${esc(item.title)}</h3><div class="destination">⌖ ${esc(item.destination)}</div><div class="excursion-meta"><span>Saída<b>${date(item.date)}</b></span><span>Investimento<b>${money(item.price)}</b></span></div><div class="excursion-footer"><div class="muted">${item.reserved} de ${item.seats} lugares<div class="progress-line"><i style="width:${Math.min(100, item.reserved / item.seats * 100)}%"></i></div></div><button class="secondary-button" style="padding:7px 9px;font-size:10px" data-action="edit-excursion" data-id="${item.id}">Detalhes</button></div></div></article>`).join('');
  renderShell(`${pageHeading('PRODUTO & OPERAÇÃO', 'Suas excursões', 'Roteiros, lotação e vendas em um só lugar.', '<button class="primary-button" data-action="new-excursion">＋ Nova excursão</button>')}<div class="toolbar"><div class="view-tabs"><button class="active">Todos os roteiros</button><button>Vendas abertas</button><button>Encerrados</button></div><button class="secondary-button" style="margin-left:auto">⌗ Exportar</button></div><div class="excursions-grid">${cards}<button class="empty-card" data-action="new-excursion"><div><span>＋</span><strong>Criar nova excursão</strong><p>Adicione destino, datas e lotação.</p></div></button></div>`);
}

async function renderWhatsApp() {
  if (!state.whatsapp) state.whatsapp = await api('/api/whatsapp/status');
  if (!state.selectedLead) state.selectedLead = state.leads.find((lead) => lead.source === 'WhatsApp') || state.leads[0];
  if (state.selectedLead && !state.conversation.length) state.conversation = await api(`/api/conversations/${state.selectedLead.id}`);
  const wa = state.whatsapp; const connected = wa.status === 'connected'; const lead = state.selectedLead;
  const msgs = state.conversation.map((msg) => `<div class="message ${msg.from}">${esc(msg.text)}<time>${msg.time}</time></div>`).join('');
  const badge = `<span class="tag ${connected ? '' : 'gray-tag'}">${connected ? '● conectado' : '○ desconectado'}</span>`;
  const statusText = connected ? 'Número conectado e pronto para atender' : wa.status === 'error' ? `Não foi possível iniciar o Baileys${wa.lastError ? ` · ${wa.lastError}` : ''}` : wa.status === 'logged_out' ? 'Sessão encerrada · gere um novo QR Code' : wa.mode === 'demo' ? 'Modo demonstração · pronto para testar' : 'Aguardando conexão';
  const qrMarkup = wa.qr ? `<img src="${wa.qr}" alt="QR Code de conexão do WhatsApp" />` : `<div class="qr-placeholder"><span>▦</span>${connected ? 'WhatsApp conectado' : 'Clique em conectar para gerar o QR Code'}</div>`;
  const waAction = connected ? '<button class="secondary-button" data-action="disconnect-wa">Desconectar número</button>' : wa.status === 'logged_out' ? '<button class="primary-button" data-action="reset-wa">↻ Limpar sessão e gerar QR</button>' : '<button class="primary-button" data-action="connect-wa">◉ Gerar QR Code</button>';
  renderShell(`${pageHeading('CANAL DE ATENDIMENTO', 'WhatsApp da agência', 'Conecte seu número e transforme conversas em reservas.', badge)}<div class="wa-layout"><section class="panel wa-connect-card"><h2>Conexão Baileys</h2><div class="wa-status ${connected ? 'connected' : ''}"><i></i>${esc(statusText)}</div><div class="qr-wrap">${qrMarkup}</div><p class="wa-instructions">Abra o WhatsApp no celular, vá em <b>Aparelhos conectados</b> e escaneie o QR Code. A sessão fica guardada no servidor.</p>${waAction}<div class="wa-trust"><span>✓</span><div><b>Sessão protegida</b>O histórico e a autenticação ficam no volume seguro do servidor.</div></div></section><section class="panel conversation-panel"><div class="conversation-head">${lead ? `${leadAvatar(lead)}<div><strong>${esc(lead.name)}</strong><small>${esc(lead.lastMessage)}</small></div>` : '<div><strong>Nenhuma conversa</strong></div>'}<span class="wa-status ${connected ? 'connected' : ''}"><i></i>${connected ? 'online' : 'offline'}</span></div><div class="messages" id="messages">${msgs || '<div class="empty-card" style="border:0;background:transparent;min-height:200px"><div><span>◉</span><strong>Escolha um lead para conversar</strong><p>A caixa de entrada aparecerá aqui.</p></div></div>'}</div><form class="compose" id="compose-form"><input id="message-input" placeholder="Escreva uma mensagem..." autocomplete="off" /><button title="Enviar">➤</button></form></section></div>`);
}

function calendarMonthLabel(value) { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(value).replace(/^./, (char) => char.toUpperCase()); }

function renderCalendar() {
  const month = new Date(state.calendarMonth); const year = month.getFullYear(); const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay(); const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = []; const weekday = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  for (let i = 0; i < firstDay; i += 1) cells.push('<div class="calendar-day muted-day"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = state.excursions.filter((item) => item.date <= key && (item.endDate || item.date) >= key);
    const isToday = key === new Date().toISOString().slice(0, 10);
    cells.push(`<div class="calendar-day ${isToday ? 'today' : ''}"><span class="calendar-number">${day}</span><div class="calendar-events">${events.slice(0, 3).map((item) => `<button class="calendar-event ${item.color}" data-view="excursions" title="${esc(item.title)}"><b>${esc(item.title.split(' · ')[0])}</b><small>${esc(item.destination)}</small></button>`).join('')}${events.length > 3 ? `<span class="calendar-more">+${events.length - 3} roteiros</span>` : ''}</div></div>`);
  }
  while (cells.length < 42) cells.push('<div class="calendar-day muted-day"></div>');
  const upcoming = state.excursions.filter((item) => item.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  renderShell(`${pageHeading('PLANEJAMENTO', 'Calendário de saídas', 'Visualize roteiros, datas e lotação da operação.', '<button class="primary-button" data-action="new-excursion">＋ Nova excursão</button>')}<div class="calendar-toolbar"><div class="calendar-nav"><button class="secondary-button" data-calendar-nav="prev">←</button><button class="calendar-title" data-calendar-nav="today">${calendarMonthLabel(month)}</button><button class="secondary-button" data-calendar-nav="next">→</button></div><span class="muted">${state.excursions.length} roteiros cadastrados</span></div><section class="calendar-layout"><div class="panel calendar-panel"><div class="calendar-weekdays">${weekday.map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div></div><aside class="panel agenda-panel"><div class="panel-header"><div class="panel-title"><h2>Próximas saídas</h2><span class="muted">agenda</span></div></div><div class="agenda-list">${upcoming.map((item) => `<button class="agenda-item" data-view="excursions"><span class="agenda-date">${date(item.date)}<small>${item.date.slice(0, 4)}</small></span><span class="agenda-info"><b>${esc(item.title)}</b><small>${esc(item.destination)} · ${item.reserved}/${item.seats} lugares</small></span><span class="agenda-arrow">→</span></button>`).join('') || '<div class="empty-card" style="border:0;min-height:180px"><div><span>▦</span><strong>Sem próximas saídas</strong><p>Cadastre um novo roteiro.</p></div></div>'}</div></aside></section>`);
}

function renderReports() {
  const totalLeads = state.leads.length; const closed = state.leads.filter((lead) => lead.stage === 'Fechado').length;
  const revenue = state.excursions.reduce((sum, item) => sum + Number(item.reserved || 0) * Number(item.price || 0), 0);
  const capacity = state.excursions.reduce((sum, item) => sum + Number(item.seats || 0), 0); const reserved = state.excursions.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const occupancy = capacity ? Math.round(reserved / capacity * 100) : 0; const conversion = totalLeads ? Math.round(closed / totalLeads * 100) : 0;
  const sources = [...new Set(state.leads.map((lead) => lead.source || 'Outros'))].map((source) => ({ source, total: state.leads.filter((lead) => (lead.source || 'Outros') === source).length })).sort((a, b) => b.total - a.total);
  const maxSource = Math.max(1, ...sources.map((item) => item.total));
  const ranking = [...state.excursions].sort((a, b) => (b.reserved * b.price) - (a.reserved * a.price));
  renderShell(`${pageHeading('INTELIGÊNCIA DA OPERAÇÃO', 'Relatórios', 'Decisões melhores com uma leitura simples dos seus números.', '<button class="primary-button" data-action="export-report">⇩ Exportar CSV</button>')}<div class="report-period"><span>Período analisado</span><b>Todos os dados cadastrados</b><span class="report-live">● Atualizado agora</span></div><div class="stats-grid report-stats">${metricCard('R$', 'purple', 'Receita estimada', money(revenue), 'reservas confirmadas')}${metricCard('◒', 'lime', 'Conversão de leads', `${conversion}%`, `${closed} vendas fechadas`)}${metricCard('♧', 'orange', 'Ocupação geral', `${occupancy}%`, `${reserved} lugares reservados`)}${metricCard('✦', 'blue', 'Ticket médio', money(closed ? revenue / closed : 0), 'por venda fechada')}</div><div class="reports-grid"><section class="panel report-panel"><div class="panel-header"><div class="panel-title"><h2>Desempenho por excursão</h2><span class="muted">receita potencial</span></div></div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Roteiro</th><th>Saída</th><th>Ocupação</th><th>Receita</th></tr></thead><tbody>${ranking.map((item) => `<tr><td><b>${esc(item.title)}</b><small>${esc(item.destination)}</small></td><td>${date(item.date)}</td><td><span class="report-progress"><i style="width:${Math.min(100, item.reserved / Math.max(1, item.seats) * 100)}%"></i></span><small>${item.reserved}/${item.seats}</small></td><td><b>${money(item.reserved * item.price)}</b></td></tr>`).join('') || '<tr><td colspan="4">Nenhum dado ainda.</td></tr>'}</tbody></table></div></section><section class="panel report-panel"><div class="panel-header"><div class="panel-title"><h2>Origem dos leads</h2><span class="muted">volume por canal</span></div></div><div class="source-list">${sources.map((item) => `<div class="source-row"><div><b>${esc(item.source)}</b><small>${item.total} lead${item.total === 1 ? '' : 's'}</small></div><div class="source-bar"><i style="width:${item.total / maxSource * 100}%"></i></div><strong>${Math.round(item.total / Math.max(1, totalLeads) * 100)}%</strong></div>`).join('') || '<div class="empty-card" style="border:0;min-height:170px"><div><span>◒</span><strong>Sem leads</strong><p>Os canais aparecerão aqui.</p></div></div>'}</div></section></div>`);
}

async function loadData() { [state.dashboard, state.leads, state.excursions] = await Promise.all([api('/api/dashboard'), api('/api/leads'), api('/api/excursions')]); state.dashboard = state.dashboard; $('#nav-leads-count').textContent = state.leads.filter((lead) => lead.unread).length; }
async function navigate(view) { if (view !== 'whatsapp') clearTimeout(waPollTimer); state.view = view; if (view === 'dashboard') renderDashboard(); else if (view === 'leads') renderLeads(); else if (view === 'excursions') renderExcursions(); else if (view === 'whatsapp') { state.conversation = []; await renderWhatsApp(); } else if (view === 'calendar') renderCalendar(); else if (view === 'reports') renderReports(); }

function openExcursionModal() {
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><form class="modal" id="excursion-form"><div class="modal-header"><h2>Nova excursão</h2><button type="button" data-action="close-modal">×</button></div><div class="modal-body"><label class="form-label">Nome do roteiro<input class="form-control" name="title" placeholder="Ex.: Serra da Canastra · Feriado" required /></label><label class="form-label">Destino<input class="form-control" name="destination" placeholder="Cidade / estado" required /></label><div class="form-grid"><label class="form-label">Data de saída<input class="form-control" type="date" name="date" required /></label><label class="form-label">Data de retorno<input class="form-control" type="date" name="endDate" required /></label></div><div class="form-grid"><label class="form-label">Valor por pessoa<input class="form-control" type="number" name="price" placeholder="690" required /></label><label class="form-label">Lugares<input class="form-control" type="number" name="seats" placeholder="40" required /></label></div><label class="form-label">Descrição curta<textarea class="form-control" name="description" rows="3" placeholder="O que está incluso no pacote?"></textarea></label></div><div class="modal-footer"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button">Salvar excursão</button></div></form></div>`;
}

function openLeadModal() { $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-header"><h2>Cadastrar lead</h2><button data-action="close-modal">×</button></div><div class="modal-body"><p class="muted" style="margin:0">O cadastro manual estará conectado à agenda de atendimento na próxima etapa. Por enquanto, a central está recebendo leads do WhatsApp e das redes sociais automaticamente.</p></div><div class="modal-footer"><button class="primary-button" data-action="close-modal">Entendi</button></div></div></div>`; }

document.addEventListener('click', async (event) => {
  const calendarNav = event.target.closest('[data-calendar-nav]');
  if (calendarNav) {
    const action = calendarNav.dataset.calendarNav;
    if (action === 'today') state.calendarMonth = new Date();
    if (action === 'prev') state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
    if (action === 'next') state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
    renderCalendar(); return;
  }
  const nav = event.target.closest('[data-view]'); if (nav) { await navigate(nav.dataset.view); return; }
  const leadFilter = event.target.closest('[data-lead-filter]'); if (leadFilter) { state.leadFilter = leadFilter.dataset.leadFilter; renderLeads(); return; }
  const leadRowEl = event.target.closest('[data-lead-id]'); if (leadRowEl && !event.target.closest('[data-action]')) { state.selectedLead = state.leads.find((lead) => lead.id === leadRowEl.dataset.leadId); if (state.view === 'whatsapp') { state.conversation = await api(`/api/conversations/${state.selectedLead.id}`); } else renderLeads(); return; }
  const action = event.target.closest('[data-action]'); if (!action) return;
  const type = action.dataset.action;
  try {
    if (type === 'new-excursion') openExcursionModal();
    if (type === 'new-lead') openLeadModal();
    if (type === 'close-modal') $('#modal-root').innerHTML = '';
    if (type === 'refresh') { await loadData(); toast('Leads atualizados'); if (state.view === 'leads') renderLeads(); }
    if (type === 'analyze-lead') { action.disabled = true; action.textContent = '✦ Analisando…'; const updated = await api(`/api/leads/${action.dataset.leadId}/analyze`, { method: 'POST' }); state.leads = state.leads.map((lead) => lead.id === updated.id ? { ...updated, excursion: state.excursions.find((item) => item.id === updated.excursionId)?.title } : lead); state.selectedLead = updated; toast(updated.analysis.source === 'jev' ? 'Lead reanalisado com Jev' : 'Lead analisado com regras locais'); renderLeads(); }
    if (type === 'open-conversation') { state.selectedLead = state.leads.find((lead) => lead.id === action.dataset.leadId); state.conversation = await api(`/api/conversations/${state.selectedLead.id}`); await navigate('whatsapp'); }
    if (type === 'connect-wa') { action.disabled = true; action.textContent = 'Gerando QR…'; state.whatsapp = await api('/api/whatsapp/connect', { method: 'POST' }); toast(state.whatsapp.mode === 'demo' ? 'QR de demonstração gerado' : 'Conexão iniciada — aguardando QR'); await renderWhatsApp(); if (state.whatsapp.status === 'connecting') pollWhatsAppStatus(); }
    if (type === 'disconnect-wa') { state.whatsapp = await api('/api/whatsapp/disconnect', { method: 'POST' }); toast('WhatsApp desconectado'); await renderWhatsApp(); }
    if (type === 'reset-wa') { action.disabled = true; action.textContent = 'Limpando sessão…'; state.whatsapp = await api('/api/whatsapp/reset', { method: 'POST' }); toast('Sessão antiga removida — escaneie o novo QR'); await renderWhatsApp(); if (state.whatsapp.status === 'connecting') pollWhatsAppStatus(); }
    if (type === 'edit-excursion') { const item = state.excursions.find((excursion) => excursion.id === action.dataset.id); toast(`${item.title} · ${item.reserved}/${item.seats} lugares reservados`); }
    if (type === 'export-report') {
      const rows = [['Roteiro', 'Destino', 'Saida', 'Lugares', 'Reservados', 'Valor por pessoa', 'Receita estimada'], ...state.excursions.map((item) => [item.title, item.destination, item.date, item.seats, item.reserved, item.price, item.reserved * item.price])];
      const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `relatorio-premius-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); toast('Relatório exportado');
    }
    if (type === 'logout') { await api('/api/auth/logout', { method: 'POST' }); state.user = null; renderLogin(); }
  } catch (error) { toast(error.message, true); }
});

document.addEventListener('change', async (event) => {
  if (event.target.id === 'lead-stage' && state.selectedLead) { try { const updated = await api(`/api/leads/${state.selectedLead.id}`, { method: 'PATCH', body: JSON.stringify({ stage: event.target.value }) }); state.selectedLead = updated; state.leads = state.leads.map((lead) => lead.id === updated.id ? { ...lead, ...updated } : lead); toast('Etapa atualizada'); } catch (error) { toast(error.message, true); } }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'login-form') { event.preventDefault(); await login(Object.fromEntries(new FormData(event.target).entries())); return; }
  if (event.target.id === 'excursion-form') { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target).entries()); try { await api('/api/excursions', { method: 'POST', body: JSON.stringify(input) }); $('#modal-root').innerHTML = ''; await loadData(); toast('Excursão criada com sucesso'); navigate('excursions'); } catch (error) { toast(error.message, true); } }
  if (event.target.id === 'compose-form') { event.preventDefault(); const input = $('#message-input'); if (!input.value.trim() || !state.selectedLead) return; try { const message = await api(`/api/conversations/${state.selectedLead.id}/messages`, { method: 'POST', body: JSON.stringify({ text: input.value }) }); state.conversation.push(message); input.value = ''; const box = $('#messages'); box.insertAdjacentHTML('beforeend', `<div class="message agent">${esc(message.text)}<time>${message.time}</time></div>`); box.scrollTop = box.scrollHeight; } catch (error) { toast(error.message, true); } }
});

$('#mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
$('#open-search').addEventListener('click', () => { if (state.view !== 'leads') navigate('leads'); setTimeout(() => $('#lead-search')?.focus(), 50); });

async function boot() {
  try { const session = await api('/api/auth/me'); state.user = session.user; showApp(); await loadData(); renderDashboard(); }
  catch (error) { if (error.status === 401 || error.status === 503) renderLogin(); else renderLogin('Não foi possível conectar ao servidor.'); }
}

boot();
