import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'premius.json');
const AUTH_DIR = path.resolve(process.env.BAILEYS_AUTH_DIR || path.join(DATA_DIR, 'whatsapp-auth'));
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@agenciapremius.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_COOKIE = 'premius_session';
const sessions = new Map();

const seed = {
  excursions: [
    { id: 'exc-001', title: 'Caldas Novas · Águas Quentes', destination: 'Caldas Novas, GO', date: '2026-10-18', endDate: '2026-10-20', price: 689, seats: 46, reserved: 32, status: 'Confirmada', color: 'lime', description: 'Fim de semana completo com transporte executivo e ingresso para o parque.' },
    { id: 'exc-002', title: 'Pirenópolis · Festival de Inverno', destination: 'Pirenópolis, GO', date: '2026-07-12', endDate: '2026-07-13', price: 389, seats: 32, reserved: 27, status: 'Quase lotada', color: 'blue', description: 'Cultura, gastronomia e cachoeiras em um roteiro de um dia e meio.' },
    { id: 'exc-003', title: 'Aparecida do Norte', destination: 'Aparecida, SP', date: '2026-11-06', endDate: '2026-11-08', price: 849, seats: 40, reserved: 18, status: 'Vendas abertas', color: 'orange', description: 'Roteiro de fé e acolhimento com hotel, ônibus leito e café da manhã.' },
    { id: 'exc-004', title: 'Chapada dos Veadeiros', destination: 'Alto Paraíso, GO', date: '2026-12-04', endDate: '2026-12-07', price: 1240, seats: 24, reserved: 9, status: 'Vendas abertas', color: 'purple', description: 'Quatro dias de natureza, trilhas guiadas e hospedagem selecionada.' }
  ],
  leads: [
    { id: 'lead-001', name: 'Mariana Alves', phone: '5562998765432', avatar: 'MA', excursionId: 'exc-001', source: 'WhatsApp', lastMessage: 'Oi! Ainda tem vaga para Caldas em outubro? Vou com meu marido.', lastAt: '2026-09-23T08:42:00-03:00', stage: 'Novo', tag: 'Alta intenção', score: 92, unread: true, analysis: { temperature: 'hot', intent: 'booking', confidence: 0.92 } },
    { id: 'lead-002', name: 'Carlos Henrique', phone: '5562987654321', avatar: 'CH', excursionId: 'exc-002', source: 'Instagram', lastMessage: 'Qual o valor por pessoa e o que está incluso?', lastAt: '2026-09-23T08:17:00-03:00', stage: 'Em conversa', tag: 'Orçamento', score: 76, unread: true, analysis: { temperature: 'warm', intent: 'price', confidence: 0.81 } },
    { id: 'lead-003', name: 'Renata Lima', phone: '5562981122334', avatar: 'RL', excursionId: 'exc-004', source: 'WhatsApp', lastMessage: 'Pode me mandar o roteiro completo da Chapada?', lastAt: '2026-09-22T17:30:00-03:00', stage: 'Proposta enviada', tag: 'Retorno hoje', score: 68, unread: false, analysis: { temperature: 'warm', intent: 'question', confidence: 0.74 } },
    { id: 'lead-004', name: 'João Pedro', phone: '5562989988776', avatar: 'JP', excursionId: 'exc-003', source: 'Facebook', lastMessage: 'Vou confirmar com a família e te aviso.', lastAt: '2026-09-22T15:10:00-03:00', stage: 'Aguardando', tag: 'Follow-up', score: 48, unread: false, analysis: { temperature: 'cold', intent: 'question', confidence: 0.67 } },
    { id: 'lead-005', name: 'Bianca Souza', phone: '5562992233445', avatar: 'BS', excursionId: 'exc-001', source: 'WhatsApp', lastMessage: 'Fechamos duas poltronas! Como faço o pagamento?', lastAt: '2026-09-22T13:48:00-03:00', stage: 'Fechado', tag: 'Venda ganha', score: 98, unread: false, analysis: { temperature: 'hot', intent: 'booking', confidence: 0.98 } }
  ],
  conversations: {
    'lead-001': [
      { id: 1, from: 'lead', text: 'Oi, bom dia! Vi a excursão para Caldas Novas.', time: '08:38' },
      { id: 2, from: 'lead', text: 'Ainda tem vaga para outubro? Vou com meu marido.', time: '08:42' },
      { id: 3, from: 'agent', text: 'Bom dia, Mariana! Tem sim 😊 A saída é dia 18/10 e o pacote inclui transporte, hotel e ingresso do parque.', time: '08:45' }
    ],
    'lead-002': [
      { id: 1, from: 'lead', text: 'Olá! Vi o passeio de Pirenópolis no Instagram.', time: '08:11' },
      { id: 2, from: 'lead', text: 'Qual o valor por pessoa e o que está incluso?', time: '08:17' }
    ]
  }
};

let db = structuredClone(seed);
let whatsapp = { status: 'disconnected', qr: null, mode: process.env.BAILEYS_ENABLED === 'true' ? 'baileys' : 'demo', lastConnectedAt: null, socket: null };

async function loadDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (existsSync(DB_FILE)) {
    try { db = JSON.parse(await readFile(DB_FILE, 'utf8')); } catch { await persist(); }
  } else await persist();
}

async function persist() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [index === -1 ? part : part.slice(0, index), index === -1 ? '' : decodeURIComponent(part.slice(index + 1))];
  }));
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return { email: ADMIN_EMAIL, name: 'Eduardo Bueno', role: 'Administrador' };
}

function setSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600`);
}

function clearSession(res, req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function isProtectedApi(pathname) {
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function getLead(id) { return db.leads.find((lead) => lead.id === id); }
function getExcursion(id) { return db.excursions.find((excursion) => excursion.id === id); }

function fallbackAnalysis(lead) {
  const text = `${lead.lastMessage} ${lead.name}`.toLowerCase();
  const booking = /(fech|reserv|vaga|poltrona|pagamento|quero ir|vou com)/.test(text);
  const price = /(valor|preço|preco|quanto|orçamento|orcamento)/.test(text);
  const question = /\?|roteiro|inclui|informação|informacao/.test(text);
  const temperature = booking ? 'hot' : price || question ? 'warm' : 'cold';
  const intent = booking ? 'booking' : price ? 'price' : question ? 'question' : 'other';
  return { temperature, intent, confidence: booking ? 0.9 : price || question ? 0.78 : 0.64, source: 'fallback' };
}

async function jevAnalysis(lead) {
  if (!process.env.TYPESAFE_API_KEY) return fallbackAnalysis(lead);
  const excursion = getExcursion(lead.excursionId);
  const state = { lead: { name: lead.name, message: lead.lastMessage, source: lead.source }, excursion: excursion ? { title: excursion.title, price: excursion.price, date: excursion.date } : null };
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state,
      questions: {
        temperature: { type: 'choice', instructions: 'Qual a temperatura comercial desta pessoa para uma excursão turística?', criteria: { hot: 'Intenção clara de reservar, pagar ou confirmar vaga.', warm: 'Está avaliando preço, roteiro ou demonstrou interesse, mas ainda não decidiu.', cold: 'Mensagem vaga, sem intenção comercial clara ou apenas acompanhamento.' } },
        intent: { type: 'choice', instructions: 'Qual é a principal intenção da mensagem?', criteria: { booking: 'Quer reservar, fechar, pagar ou confirmar lugares.', price: 'Quer saber preço, condições, parcelamento ou orçamento.', question: 'Quer saber roteiro, data, itens inclusos ou detalhes da viagem.', other: 'Não se encaixa nas outras opções.' } },
        needsFollowup: { type: 'noul', instructions: 'Esta conversa precisa de um retorno humano nas próximas horas para não perder a oportunidade?' }
      }
    })
  });
  if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
  const result = await response.json();
  const temp = result.answers?.temperature;
  const intent = result.answers?.intent;
  return { temperature: temp?.choice || 'warm', intent: intent?.choice || 'question', confidence: Math.max(temp?.confidence || 0, intent?.confidence || 0), needsFollowup: Boolean(result.answers?.needsFollowup?.noul), source: 'jev', model: result.model };
}

function messageText(message) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || message?.documentMessage?.caption
    || '';
}

function phoneFromJid(jid) { return String(jid || '').split('@')[0].replace(/\D/g, ''); }

async function upsertWhatsAppLead(incoming) {
  const jid = incoming.key?.remoteJid;
  const text = messageText(incoming.message);
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || incoming.key?.fromMe || !text.trim()) return null;
  const phone = phoneFromJid(jid);
  let lead = db.leads.find((item) => item.whatsappJid === jid || (phone && String(item.phone || '').replace(/\D/g, '') === phone));
  if (!lead) {
    const name = incoming.pushName || phone || 'Novo contato';
    lead = { id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, phone, avatar: name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(), excursionId: null, source: 'WhatsApp', lastMessage: text.trim(), lastAt: new Date().toISOString(), stage: 'Novo', tag: 'Novo lead', score: 0, unread: true, whatsappJid: jid, analysis: null };
    db.leads.unshift(lead);
  } else {
    lead.whatsappJid = jid; lead.lastMessage = text.trim(); lead.lastAt = new Date().toISOString(); lead.unread = true;
  }
  if (!db.conversations[lead.id]) db.conversations[lead.id] = [];
  const messageId = incoming.key?.id || `${Date.now()}`;
  if (!db.conversations[lead.id].some((item) => item.externalId === messageId)) db.conversations[lead.id].push({ id: Date.now(), externalId: messageId, from: 'lead', text: text.trim(), time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
  try { lead.analysis = await jevAnalysis(lead); lead.score = Math.round((lead.analysis.confidence || 0.6) * 100); lead.tag = lead.analysis.temperature === 'hot' ? 'Alta intenção' : lead.analysis.temperature === 'warm' ? 'Em avaliação' : 'Nutrição'; } catch (error) { console.error('Jev não analisou lead do WhatsApp:', error.message); }
  await persist();
  return lead;
}

async function sendWhatsAppMessage(lead, text) {
  if (whatsapp.mode === 'baileys') {
    if (!whatsapp.socket || whatsapp.status !== 'connected') throw new Error('WhatsApp ainda não está conectado');
    const jid = lead.whatsappJid || `${String(lead.phone || '').replace(/\D/g, '')}@s.whatsapp.net`;
    if (!jid || jid === '@s.whatsapp.net') throw new Error('Este lead não possui um número de WhatsApp válido');
    await whatsapp.socket.sendMessage(jid, { text });
  }
}

async function startBaileys() {
  if (whatsapp.mode !== 'baileys') return;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    const pino = (await import('pino')).default;
    const { state, saveCreds } = await baileys.useMultiFileAuthState(AUTH_DIR);
    const socket = baileys.default({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }), browser: ['Premius Viagens', 'Chrome', '1.0.0'] });
    whatsapp.socket = socket;
    whatsapp.status = 'connecting';
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const incoming of messages || []) await upsertWhatsAppLead(incoming);
    });
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) whatsapp.qr = await (await import('qrcode')).toDataURL(qr, { width: 280, margin: 1 });
      if (connection === 'open') { whatsapp.status = 'connected'; whatsapp.qr = null; whatsapp.lastConnectedAt = new Date().toISOString(); }
      if (connection === 'close') {
        whatsapp.status = 'disconnected';
        whatsapp.qr = null;
        whatsapp.socket = null;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys.DisconnectReason.loggedOut;
        if (shouldReconnect) setTimeout(startBaileys, 3000);
      }
    });
  } catch (error) {
    console.error('Baileys indisponível:', error.message);
    whatsapp.status = 'error';
    whatsapp.qr = null;
    whatsapp.socket = null;
  }
}

async function connectWhatsApp() {
  if (whatsapp.mode === 'baileys') { if (!whatsapp.socket) await startBaileys(); return; }
  whatsapp.status = 'connecting';
  whatsapp.qr = await (await import('qrcode')).toDataURL(`premius-demo-${Date.now()}`, { width: 280, margin: 1 });
  setTimeout(() => { if (whatsapp.status === 'connecting') { whatsapp.status = 'connected'; whatsapp.qr = null; whatsapp.lastConnectedAt = new Date().toISOString(); } }, 4500);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' }); return res.end(); }
  try {
    if (pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', service: 'agencia-premius' });
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = currentUser(req);
      return user ? json(res, 200, { authenticated: true, user }) : json(res, 401, { error: 'Não autenticado' });
    }
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!ADMIN_PASSWORD) return json(res, 503, { error: 'Login ainda não configurado no servidor. Defina ADMIN_PASSWORD no Coolify.' });
      const input = await body(req);
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return json(res, 401, { error: 'E-mail ou senha inválidos' });
      setSession(res);
      return json(res, 200, { authenticated: true, user: { email: ADMIN_EMAIL, name: 'Eduardo Bueno', role: 'Administrador' } });
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') { clearSession(res, req); return json(res, 200, { ok: true }); }
    if (isProtectedApi(pathname) && !currentUser(req)) return json(res, 401, { error: 'Sessão expirada. Faça login novamente.' });
    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const reserved = db.excursions.reduce((sum, item) => sum + item.reserved, 0);
      const capacity = db.excursions.reduce((sum, item) => sum + item.seats, 0);
      return json(res, 200, { stats: { activeExcursions: db.excursions.filter((item) => item.status !== 'Encerrada').length, totalLeads: db.leads.length, newLeads: db.leads.filter((lead) => lead.stage === 'Novo').length, occupancy: Math.round((reserved / capacity) * 100), revenue: db.excursions.reduce((sum, item) => sum + item.reserved * item.price, 0) }, upcoming: db.excursions.slice(0, 3), recentLeads: db.leads.slice(0, 5).map((lead) => ({ ...lead, excursion: getExcursion(lead.excursionId)?.title || 'Sem excursão' })) });
    }
    if (pathname === '/api/excursions' && req.method === 'GET') return json(res, 200, db.excursions);
    if (pathname === '/api/excursions' && req.method === 'POST') {
      const input = await body(req); const excursion = { id: `exc-${Date.now()}`, title: input.title || 'Nova excursão', destination: input.destination || '', date: input.date || new Date().toISOString().slice(0, 10), endDate: input.endDate || input.date, price: Number(input.price || 0), seats: Number(input.seats || 20), reserved: 0, status: 'Vendas abertas', color: input.color || 'blue', description: input.description || '' };
      db.excursions.unshift(excursion); await persist(); return json(res, 201, excursion);
    }
    if (pathname === '/api/leads' && req.method === 'GET') return json(res, 200, db.leads.map((lead) => ({ ...lead, excursion: getExcursion(lead.excursionId)?.title || 'Sem excursão' })));
    const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)(?:\/(analyze))?$/);
    if (leadMatch) {
      const lead = getLead(leadMatch[1]); if (!lead) return json(res, 404, { error: 'Lead não encontrado' });
      if (req.method === 'PATCH') { const input = await body(req); if (input.stage) lead.stage = input.stage; if (input.unread !== undefined) lead.unread = input.unread; await persist(); return json(res, 200, lead); }
      if (req.method === 'POST' && leadMatch[2] === 'analyze') { try { lead.analysis = await jevAnalysis(lead); lead.score = Math.round((lead.analysis.confidence || 0.6) * 100); lead.tag = lead.analysis.temperature === 'hot' ? 'Alta intenção' : lead.analysis.temperature === 'warm' ? 'Em avaliação' : 'Nutrição'; await persist(); return json(res, 200, lead); } catch (error) { return json(res, 502, { error: 'Não foi possível consultar o Jev', details: error.message }); } }
    }
    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)(?:\/messages)?$/);
    if (convMatch) {
      const id = convMatch[1]; if (!db.conversations[id]) db.conversations[id] = [];
      if (req.method === 'GET') return json(res, 200, db.conversations[id]);
      if (req.method === 'POST' && pathname.endsWith('/messages')) { const input = await body(req); const text = String(input.text || '').trim(); if (!text) return json(res, 400, { error: 'Mensagem vazia' }); const lead = getLead(id); if (!lead) return json(res, 404, { error: 'Lead não encontrado' }); await sendWhatsAppMessage(lead, text); const message = { id: Date.now(), from: 'agent', text, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }; db.conversations[id].push(message); lead.lastMessage = text; lead.lastAt = new Date().toISOString(); lead.unread = false; await persist(); return json(res, 201, message); }
    }
    if (pathname === '/api/whatsapp/status' && req.method === 'GET') return json(res, 200, { status: whatsapp.status, qr: whatsapp.qr, mode: whatsapp.mode, lastConnectedAt: whatsapp.lastConnectedAt });
    if (pathname === '/api/whatsapp/connect' && req.method === 'POST') { await connectWhatsApp(); return json(res, 200, { status: whatsapp.status, qr: whatsapp.qr, mode: whatsapp.mode }); }
    if (pathname === '/api/whatsapp/qr' && req.method === 'GET') return json(res, 200, { status: whatsapp.status, qr: whatsapp.qr, mode: whatsapp.mode });
    if (pathname === '/api/whatsapp/disconnect' && req.method === 'POST') { try { await whatsapp.socket?.logout(); } catch {} whatsapp.status = 'disconnected'; whatsapp.qr = null; whatsapp.socket = null; return json(res, 200, { status: whatsapp.status }); }
    return serveStatic(pathname, res);
  } catch (error) { console.error(error); return json(res, 500, { error: 'Erro interno', details: error.message }); }
}

async function serveStatic(pathname, res) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(__dirname, `.${requested}`);
  if (!file.startsWith(__dirname) || !existsSync(file)) return json(res, 404, { error: 'Não encontrado' });
  const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(await readFile(file));
}

await loadDb();
const server = http.createServer(route);
server.listen(PORT, '0.0.0.0', () => console.log(`Agência Premius rodando em http://localhost:${PORT}`));
if (whatsapp.mode === 'baileys') startBaileys();
