const IS_SERVER = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.origin.includes('3000');

const API = (() => {
  const BASE = '';
  async function get(path) { const r = await fetch(`${BASE}${path}`); if (!r.ok) throw new Error(`GET ${path} failed`); return r.json(); }
  async function post(path, body) { const r = await fetch(`${BASE}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) { const e = await r.json().catch(()=>({error:r.statusText})); throw new Error(e.error); } return r.json(); }
  async function del(path, body) { const r = await fetch(`${BASE}${path}`, { method:'DELETE', headers:body?{'Content-Type':'application/json'}:{}, body:body?JSON.stringify(body):undefined }); if (!r.ok) throw new Error(`DELETE failed`); return r.json(); }
  async function put(path, body) { const r = await fetch(`${BASE}${path}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) { const e = await r.json().catch(()=>({error:r.statusText})); throw new Error(e.error); } return r.json(); }
  return { get, post, del, put };
})();

const SUPABASE_URL = window._SUPABASE_URL || null;
const SUPABASE_ANON_KEY = window._SUPABASE_ANON_KEY || null;
let _supabase = null;
try { if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch(e) {}
function sb() { return _supabase; }
function hasSB() { return _supabase !== null; }

const state = { user: null, section: 'landing', settings: {}, timer: { active: false, mode: 'free', seconds: 0, target: 0, freeElapsed: 0, interval: null, subject: '' }, _rankingTab: 'weekly',  _casino: {}, _adminAuth: false, _adminTab: 'settings', _editingAchievement: null };
const CACHE = { users: [], store: [], missions: [], achievements: [],   guilds: [], events: [], casinoHistory: [], subjects: [] };

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k === 'dataset' && typeof v === 'object') Object.assign(e.dataset, v);
    else if (v === false || v === null || v === undefined) {} // skip falsy attrs
    else e.setAttribute(k, v);
  }
  for (const c of children) { if (c != null) { if (Array.isArray(c)) { for (const cc of c) e.append(typeof cc === 'string' ? document.createTextNode(cc) : cc); } else e.append(typeof c === 'string' ? document.createTextNode(c) : c); } }
  return e;
};

function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show toast-${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function confetti(count = 40) {
  const canvas = $('confetti-canvas');
  for (let i = 0; i < count; i++) {
    const c = el('div', { style: { position:'absolute', width:'8px', height:'8px', borderRadius:'50%', background: ['#06b6d4','#8b5cf6','#22c55e','#eab308','#ef4444'][Math.floor(Math.random()*5)], left:`${Math.random()*100}%`, top:'-8px', animation:`cf ${1.2+Math.random()*0.8}s ease-out forwards`, animationDelay:`${Math.random()*0.4}s` }});
    canvas.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}
const cs = document.createElement('style');
cs.textContent = '@keyframes cf {0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}';
document.head.appendChild(cs);

function fmt(m) { const h = Math.floor(m/60), mi = m%60; return h > 0 ? `${h}h ${mi}m` : `${mi}m`; }
function rarityBadge(r) {
  const map = { 'lendário':'legendary','épico':'epic','raro':'rare','comum':'common', 'legendary':'legendary','epic':'epic','rare':'rare','common':'common' };
  const cls = map[(r||'').toLowerCase()] || 'common';
  return el('span', { className: `badge badge-${cls}` }, r || 'Comum');
}

const DEFAULT_SETTINGS = { xpPerMinute: '12', coinPerMinute: '5', streakMultiplier: '1.2', boost: 'none', adminPassword: 'admin123', jackpotAvailable: 'true' };

async function loadCache() {
  if (!IS_SERVER) {
    const stored = localStorage.getItem('eavCache');
    if (stored) {
      try { const d = JSON.parse(stored); Object.assign(CACHE, d); state.settings = d.settings || DEFAULT_SETTINGS; return; } catch(e) {}
    }
    state.settings = DEFAULT_SETTINGS;
    return;
  }
  try {
    const [settings, users, store, missions, achievements, guilds, events, subjects] = await Promise.all([
      API.get('/api/settings'), API.get('/api/users'), API.get('/api/store'),
      API.get('/api/missions'), API.get('/api/achievements'), API.get('/api/guilds'),
      API.get('/api/events'),
      state.user ? API.get(`/api/users/${state.user.id}/subjects/list`).catch(()=>[]) : [],
    ]);
    state.settings = settings;
    CACHE.users = users; CACHE.store = store; CACHE.missions = missions;
    CACHE.achievements = achievements; CACHE.guilds = guilds; CACHE.events = events; CACHE.subjects = subjects;
    try { CACHE.casinoHistory = await API.get('/api/casino/history'); } catch(e) {}
    localStorage.setItem('eavCache', JSON.stringify({ ...CACHE, settings }));
  } catch(e) {
    console.error('cache error, using fallback', e);
    const stored = localStorage.getItem('eavCache');
    if (stored) { try { const d = JSON.parse(stored); Object.assign(CACHE, d); state.settings = d.settings || DEFAULT_SETTINGS; } catch(e) {} }
    else state.settings = DEFAULT_SETTINGS;
  }
}

function openModal(content) {
  const old = document.querySelector('.modal-overlay');
  if (old) old.remove();
  const overlay = el('div', { className: 'modal-overlay' });
  overlay.appendChild(el('div', { className: 'modal-card' }, content));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function closeModal() { const m = document.querySelector('.modal-overlay'); if (m) m.remove(); }

function saveUserFallback() {
  if (!IS_SERVER && state.user) {
    localStorage.setItem('eavUser', JSON.stringify(state.user));
    const users = JSON.parse(localStorage.getItem('eavUsers') || '[]');
    const idx = users.findIndex(u => u.id === state.user.id);
    if (idx >= 0) users[idx] = state.user; else users.push(state.user);
    localStorage.setItem('eavUsers', JSON.stringify(users));
  }
}

async function loginUser(name, password) {
  if (!IS_SERVER) {
    const users = JSON.parse(localStorage.getItem('eavUsers') || '[]');
    const found = users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (!found) return toast('Usuário não encontrado. Crie um novo perfil.', 'error');
    state.user = found;
    localStorage.setItem('eavUser', JSON.stringify(found));
    renderApp(); toast(`Bem-vindo de volta, ${name}!`); showSection('dashboard');
    return;
  }
  try {
    const r = await API.post('/api/users/login', { name, password });
    state.user = r; localStorage.setItem('eavUser', JSON.stringify(r));
    if (r.token) localStorage.setItem('eavToken', r.token);
    await loadCache(); renderApp(); toast(`Bem-vindo de volta, ${name}!`); showSection('dashboard');
  }
  catch(e) { toast(e.message || 'Usuário ou senha inválidos', 'error'); }
}

async function createUser(name, password) {
  if (!IS_SERVER) {
    const users = JSON.parse(localStorage.getItem('eavUsers') || '[]');
    if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) return toast('Nome já existe', 'error');
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const newUser = { id, name, avatar: '🙂', level: 1, xp: 0, coins: 300, streak: 0, best_streak: 0, total_minutes: 0, weekly_minutes: 0, best_day: '0h 0m', favorite_subject: 'Nenhuma', titles: ['Novo Iniciado'], achievements: [], inventory: ['Tema Padrão'], guild_id: null, sessionHistory: [] };
    users.push(newUser);
    localStorage.setItem('eavUsers', JSON.stringify(users));
    state.user = newUser;
    localStorage.setItem('eavUser', JSON.stringify(newUser));
    renderApp(); toast(`Perfil ${name} criado!`); showSection('dashboard');
    return;
  }
  try {
    const r = await API.post('/api/users', { name, password });
    state.user = r; localStorage.setItem('eavUser', JSON.stringify(r));
    if (r.token) localStorage.setItem('eavToken', r.token);
    await loadCache(); renderApp(); toast(`Perfil ${name} criado!`); showSection('dashboard');
  }
  catch(e) { toast(e.message.includes('409') ? 'Nome já existe' : e.message || 'Erro ao criar', 'error'); }
}

async function supabaseRegister(email, password, name) {
  try {
    const r = await API.post('/api/auth/register', { email, password, name });
    state.user = r; await loadCache(); renderApp(); toast(`🎉 Perfil ${name} criado com Supabase!`); showSection('dashboard');
  } catch(e) { toast(e.message || 'Erro ao registrar', 'error'); }
}

async function supabaseLogin(email, password) {
  try {
    const r = await API.post('/api/auth/login', { email, password });
    state.user = r; await loadCache(); renderApp(); toast(`Bem-vindo de volta, ${r.name}!`); showSection('dashboard');
  } catch(e) { toast(e.message || 'Erro ao entrar', 'error'); }
}

function logout() {
  state.user = null;
  state.section = 'landing';
  localStorage.removeItem('eavUser');
  localStorage.removeItem('eavToken');
  renderApp();
}

function renderSupabaseAuthModal() {
  if (!hasSB()) {
    return [el('h2',{className:'modal-title'},'🔐 Supabase'),el('p',{className:'modal-desc'},'Supabase não está configurado no servidor.'),
      el('p',{style:{fontSize:'0.85rem',color:'var(--text-muted)',marginBottom:'16px'}},'Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env e reinicie o servidor.'),
      el('div',{className:'modal-actions'},el('button',{className:'btn btn-ghost',onClick:closeModal},'Voltar'))];
  }
  const [mode, setMode] = [state._sbMode || 'login', (m) => { state._sbMode = m; openModal(renderSupabaseAuthModal()); }];
  const isLogin = mode === 'login';
  return [el('h2', { className: 'modal-title' }, isLogin ? 'Entrar com Email' : 'Registrar com Email'),
    el('p', { className: 'modal-desc' }, isLogin ? 'Use sua conta Supabase para entrar.' : 'Crie sua conta com email e senha.'),
    el('input', { className: 'input', placeholder: 'Email', id: 'sb-email', type: 'email', style: { marginBottom: '8px' }, onKeydown: e => { if (e.key === 'Enter') sbAuth(); } }),
    el('input', { className: 'input', placeholder: 'Senha', id: 'sb-password', type: 'password', style: { marginBottom: '8px' }, onKeydown: e => { if (e.key === 'Enter') sbAuth(); } }),
    !isLogin ? el('input', { className: 'input', placeholder: 'Nome do perfil', id: 'sb-name', style: { marginBottom: '8px' }, onKeydown: e => { if (e.key === 'Enter') sbAuth(); } }) : null,
    el('div', { className: 'modal-actions' },
      el('button', { className: 'btn btn-primary', onClick: sbAuth }, isLogin ? 'Entrar' : 'Criar Conta'),
      el('button', { className: 'btn btn-ghost', onClick: () => { state._sbMode = isLogin ? 'register' : 'login'; openModal(renderSupabaseAuthModal()); } }, isLogin ? 'Criar conta' : 'Já tenho conta'),
      el('button', { className: 'btn btn-ghost', onClick: closeModal }, 'Voltar'))];
}

async function sbAuth() {
  const email = $('sb-email')?.value.trim();
  const password = $('sb-password')?.value;
  const name = $('sb-name')?.value.trim();
  if (!email || !password) return toast('Email e senha obrigatórios', 'error');
  if (state._sbMode === 'register') {
    if (!name) return toast('Nome obrigatório para registro', 'error');
    closeModal(); await supabaseRegister(email, password, name);
  } else {
    closeModal(); await supabaseLogin(email, password);
  }
}

function showSection(s) { state.section = s; renderApp(); }

async function refreshUser() {
  if (!state.user) return;
  if (!IS_SERVER) {
    const users = JSON.parse(localStorage.getItem('eavUsers') || '[]');
    const found = users.find(u => u.id === state.user.id);
    if (found) state.user = found;
    return;
  }
  try { state.user = await API.get(`/api/users/${state.user.id}`); } catch(e) {}
}

async function renderApp() {
  const app = $('app');
  app.innerHTML = '';
  app.appendChild(el('div',{className:'loading-overlay',id:'loading-overlay',style:{display:'none'}}));
  app.appendChild(renderHeader());
  if (state.user) { await refreshUser(); app.appendChild(el('main', {}, await renderSection())); }
  else app.appendChild(renderLanding());
}

function showLoading(show) {
  const lo = $('loading-overlay');
  if (lo) lo.style.display = show ? 'flex' : 'none';
}

function renderHeader() {
  const h = el('header', { className: 'app-header' });
  h.appendChild(el('div', { className: 'app-brand', onClick: () => showSection('landing') },
    state.settings.img_logo ? el('img',{src:state.settings.img_logo,className:'app-logo-img'}) : el('div', { className: 'app-logo' }, 'E')));
  if (state.user) {
    const sections = [['dashboard','Dashboard'],['timer','Timer'],['profile','Perfil'],['ranking','Ranking'],['store','Loja'],['missions','Missões'],['guilds','Guildas'],['achievements','Conquistas'],['events','Eventos'],['casino','Cassino'],['pdfs','📚 PDFs'],['friends','👥 Amigos'],['goals','🎯 Metas'],['admin','Admin']];
    const nav = el('nav', { className: 'app-nav' });
    for (const [id, label] of sections) nav.appendChild(el('button', { className: `nav-item${state.section === id ? ' active' : ''}`, onClick: () => showSection(id) }, label));
    h.appendChild(nav);
    h.appendChild(el('div', { className: 'app-actions' },
      el('button', { className: 'notif-bell', onClick: () => showSection('notifications') }, '🔔'),
      el('div', { className: 'user-badge', onClick: () => showSection('profile') },
        el('span', { className: 'user-avatar' }, state.user.avatar&&(state.user.avatar.startsWith('http')||state.user.avatar.startsWith('/uploads'))?el('img',{src:state.user.avatar,style:{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}):state.user.avatar||'🙂'),
        el('div', { className: 'user-info' }, el('div', { className: 'user-name' }, state.user.name), el('div', { className: 'user-level' }, `Nível ${state.user.level}`))),
      el('button', { className: 'btn btn-sm btn-ghost', onClick: logout, title: 'Sair' }, '🚪')));
  }
  return h;
}

function renderLanding() {
  return el('div', { className: 'landing' },
    el('div', { className: 'landing-hero' },
      el('div', {},
        el('span', { className: 'landing-eyebrow' }, '⭐ Nova jornada'),
        el('h1', { className: 'landing-title' }, 'Transforme estudo\nem competição.'),
        el('p', { className: 'landing-subtitle' }, 'Cronometre seus estudos, ganhe XP e moedas, suba no ranking, aposte com amigos e desbloqueie conquistas. O jogo definitivo para quem leva os estudos a sério.'),
        el('div', { className: 'landing-actions' },
          el('button', { className: 'btn btn-primary btn-lg', onClick: () => openModal(renderLoginModal()) }, '🎯 Entrar'),
          el('button', { className: 'btn btn-secondary btn-lg', onClick: () => openModal(renderCreateModal()) }, '✨ Criar Perfil'),
          el('button', { className: 'btn btn-ghost btn-lg', onClick: () => showSection('ranking') }, '🏆 Ver Ranking'))),
      el('div', { className: 'landing-visual' },
        el('div', { className: 'landing-stats' },
          el('div', { className: 'landing-stat' }, el('div', { className: 'landing-stat-value' }, '2h 15m'), el('div', { className: 'landing-stat-label' }, 'Tempo hoje')),
          el('div', { className: 'landing-stat' }, el('div', { className: 'landing-stat-value' }, '1,250'), el('div', { className: 'landing-stat-label' }, 'XP')),
          el('div', { className: 'landing-stat' }, el('div', { className: 'landing-stat-value' }, '#8'), el('div', { className: 'landing-stat-label' }, 'Ranking'))),
        el('div', { className: 'landing-features' },
          el('div', { className: 'landing-feature' }, el('span', { className: 'landing-feature-icon' }, '⏱'), 'Cronômetro Pomodoro, Foco e Livre'),
          el('div', { className: 'landing-feature' }, el('span', { className: 'landing-feature-icon' }, '🏪'), 'Loja com temas, boosts e mascotes'),
          el('div', { className: 'landing-feature' }, el('span', { className: 'landing-feature-icon' }, '🎰'), 'Cassino virtual com 7 jogos')))),
    el('div', { className: 'feature-grid' },
      el('div', { className: 'feature-card' }, el('div', { className: 'feature-icon' }, '⏱'), el('div', { className: 'feature-name' }, 'Cronômetro'), el('div', { className: 'feature-desc' }, 'Termine sessões focadas e ganhe XP, moedas e streak.')),
      el('div', { className: 'feature-card' }, el('div', { className: 'feature-icon' }, '🏆'), el('div', { className: 'feature-name' }, 'Ranking'), el('div', { className: 'feature-desc' }, 'Compita com amigos e suba no pódio.')),
      el('div', { className: 'feature-card' }, el('div', { className: 'feature-icon' }, '🏪'), el('div', { className: 'feature-name' }, 'Loja & Cassino'), el('div', { className: 'feature-desc' }, 'Compre itens, personalize e jogue com moedas.')),
      el('div', { className: 'feature-card' }, el('div', { className: 'feature-icon' }, '🔧'), el('div', { className: 'feature-name' }, 'Admin'), el('div', { className: 'feature-desc' }, 'Controle global com ajustes de balanceamento.'))));
}

function renderLoginModal() {
  return [el('h2',{className:'modal-title'},'Entrar no EAV'), el('p',{className:'modal-desc'},'Digite seu nome de usuário e senha.'),
    el('input',{className:'input',placeholder:'Nome de usuário',id:'login-name-input',style:{marginBottom:'8px'},onKeydown:e=>{if(e.key==='Enter')$('login-pass-input')?.focus();}}),
    el('input',{className:'input',placeholder:'Senha',id:'login-pass-input',type:'password',onKeydown:e=>{if(e.key==='Enter'){const n=$('login-name-input')?.value.trim(),p=$('login-pass-input')?.value;if(n&&p){closeModal();loginUser(n,p);}}}}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:()=>{const n=$('login-name-input')?.value.trim(),p=$('login-pass-input')?.value;if(n&&p){closeModal();loginUser(n,p);}}},'Entrar'),el('button',{className:'btn btn-ghost',onClick:closeModal},'Voltar'))];
}
function renderCreateModal() {
  return [el('h2',{className:'modal-title'},'Criar Perfil'), el('p',{className:'modal-desc'},'Escolha um nome e senha para seu personagem.'),
    el('input',{className:'input',placeholder:'Nome do personagem',id:'create-name-input',style:{marginBottom:'8px'},onKeydown:e=>{if(e.key==='Enter')$('create-pass-input')?.focus();}}),
    el('input',{className:'input',placeholder:'Senha (mín. 3 caracteres)',id:'create-pass-input',type:'password',onKeydown:e=>{if(e.key==='Enter'){const n=$('create-name-input')?.value.trim(),p=$('create-pass-input')?.value;if(n&&p){closeModal();createUser(n,p);}}}}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:()=>{const n=$('create-name-input')?.value.trim(),p=$('create-pass-input')?.value;if(n&&p){closeModal();createUser(n,p);}}},'Criar'),el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar'))];
}

async function renderSection() {
  const map = { landing:()=>el('div',{},'') , dashboard:renderDashboard, timer:renderTimer, profile:renderProfile, ranking:renderRanking, store:renderStore, missions:renderMissions, guilds:renderGuilds, achievements:renderAchievements, events:renderEvents, casino:renderCasino, pdfs:renderPdfLibrary, friends:renderFriends, goals:renderGoals, notifications:renderNotifications, admin:renderAdmin };
  showLoading(true);
  try { return await (map[state.section] || renderDashboard)(); }
  finally { showLoading(false); }
}

/* ==================== DASHBOARD ==================== */
async function renderDashboard() {
  const s = el('div', { className: 'section' });
  if (!state.user) return s;
  const u = state.user;
  s.appendChild(el('div', { className: 'section-header' },
    el('div', {}, el('h2',{className:'section-title'},`Bem-vindo de volta, ${u.name}`), el('p',{className:'section-desc'},'Seu hub de progresso e recompensas.')),
    el('button',{className:'btn btn-secondary',onClick:async()=>{await refreshUser();renderApp();}},'🔄 Atualizar')));
  const rank = CACHE.users.findIndex(x => x.id === u.id) + 1;
  const nextXp = u.level * 520 + 280;
  const xpPct = Math.min(100, Math.round((u.xp / nextXp) * 100));
  const pct = Math.min(100, Math.round((u.weekly_minutes / 300) * 100));
  s.appendChild(el('div', { className: 'metric-grid' },
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Tempo hoje'),el('div',{className:'metric-value'},fmt(u.weekly_minutes))),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Tempo total'),el('div',{className:'metric-value'},fmt(u.total_minutes))),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Nível'),el('div',{className:'metric-value'},u.level)),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'XP'),el('div',{className:'metric-value'},`${u.xp} XP`),el('div',{className:'xp-bar',style:{marginTop:'8px'}},el('div',{className:'xp-bar-fill',style:{width:`${xpPct}%`}})),el('div',{style:{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'4px',textAlign:'center'}},`${u.xp}/${nextXp} XP (${xpPct}%)`)),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Moedas'),el('div',{className:'metric-value'},`🪙 ${u.coins}`)),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Streak'),el('div',{className:'metric-value'},`🔥 ${u.streak} dias`)),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Ranking'),el('div',{className:'metric-value'},rank>0?`#${rank}`:'-')),
    el('div',{className:'metric-card'},el('div',{className:'metric-label'},'Progresso diário'),el('div',{className:'metric-value'},`${pct}%`),el('div',{className:'progress-bar',style:{marginTop:'8px'}},el('div',{className:'progress-fill',style:{width:`${pct}%`}})))));
  let subjectTimeData = [];
  try { subjectTimeData = await API.get(`/api/subjects/${u.id}`); } catch(e) {}
  if (subjectTimeData.length) {
    const maxMin = Math.max(...subjectTimeData.map(s=>s.minutes), 1);
    const colors = ['#06b6d4','#8b5cf6','#22c55e','#eab308','#ef4444','#f97316','#ec4899','#14b8a6','#f59e0b','#6366f1'];
    const subCard = el('div',{className:'card',style:{marginTop:'16px'}},
      el('div',{className:'card-title',style:{marginBottom:'12px'}},'📊 Horas por Matéria'),
      el('div',{className:'subject-list'},...subjectTimeData.map((sub,i)=>el('div',{className:'subject-bar',key:sub.subject},
        el('span',{style:{fontWeight:500,minWidth:'100px',fontSize:'0.85rem'}},sub.subject),
        el('div',{className:'progress-bar',style:{flex:1}},el('div',{className:'progress-fill',style:{width:`${(sub.minutes/maxMin)*100}%`,background:colors[i%colors.length]}})),
        el('span',{style:{fontSize:'0.85rem',color:'var(--text-muted)',minWidth:'60px',textAlign:'right'}},fmt(sub.minutes))))));
    s.appendChild(subCard);
  }
  const guild = CACHE.guilds.find(g => g.id === u.guild_id);
  const activeMissions = CACHE.missions.filter(m => m.active).slice(0, 3);
  let activityFeed = [];
  try { activityFeed = await API.get('/api/activity'); } catch(e) {}
  let notifs = [];
  try { notifs = await API.get(`/api/notifications/${u.id}`); } catch(e) {}
  const widgets = el('div', { className: 'dashboard-widgets' },
    el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'🎯 Missões Ativas')),
      activeMissions.length ? el('div',{className:'session-list'},...activeMissions.map(m=>el('div',{className:'session-item'},el('span',{},m.name),el('span',{style:{color:'var(--text-secondary)',fontSize:'0.85rem'}},`${m.progress}/${m.target}`)))) : el('div',{className:'empty-state-text'},'Nenhuma missão ativa')),
    el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'🏰 Guilda')),
      guild ? el('div',{},el('div',{style:{fontWeight:600,marginBottom:'4px'}},guild.name),el('div',{style:{fontSize:'0.85rem',color:'var(--text-secondary)',marginBottom:'8px'}},`${guild.member_count||0} membros`),el('div',{className:'progress-bar'},el('div',{className:'progress-fill',style:{width:`${Math.min(100,Math.round((guild.progress/guild.goal)*100))}%`}})),el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:'4px'}},`Progresso: ${guild.progress}/${guild.goal}`)) : el('div',{className:'empty-state-text'},'Você não está em nenhuma guilda')),
    el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'📢 Atividades Recentes')),
      el('div',{className:'session-list'},...(activityFeed.slice(0,5).length ? activityFeed.slice(0,5).map(a=>el('div',{className:'session-item',style:{fontSize:'0.8rem'}},el('span',{style:{fontWeight:600}},a.user_name),el('span',{style:{color:'var(--text-muted)'}},a.action),el('span',{style:{fontSize:'0.7rem',color:'var(--text-muted)'}},a.created_at?.split(' ')[1]||''))) : [el('div',{className:'empty-state-text'},'Nenhuma atividade recente')]))),
    el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'🔔 Notificações',notifs.filter(n=>!n.read).length ? el('span',{className:'notif-badge'},notifs.filter(n=>!n.read).length) : null),el('button',{className:'btn btn-sm btn-ghost',onClick:async()=>{try{await API.post(`/api/notifications/read-all/${u.id}`);renderApp();}catch(e){}}},'Ler todas')),
      el('div',{className:'session-list'},...notifs.slice(0,4).map(n=>el('div',{className:`session-item notif-${n.read?'read':''}`,onClick:async()=>{if(!n.read){try{await API.post(`/api/notifications/read/${n.id}`);renderApp();}catch(e){}}}},el('span',{style:{fontSize:'0.8rem',color:n.read?'var(--text-muted)':'var(--text-primary)'}},n.message))))));
  s.appendChild(widgets);
  return s;
}

/* ==================== TIMER ==================== */
function renderTimer() {
  const s = el('div', { className: 'section' });
  const boostLabel = state.settings.boost === 'doubleXp' ? 'XP x2' : state.settings.boost === 'coinRain' ? 'Chuva de moedas' : state.settings.boost === 'casinoNight' ? 'Cassino' : 'Nenhum';
  const timerLayout = el('div',{style:{display:'flex',gap:'16px',alignItems:'flex-start'}});

  const subs = CACHE.subjects || [];
  const sidePanel = el('div',{className:'timer-side',style:{minWidth:'180px',maxWidth:'220px',display:'flex',flexDirection:'column',gap:'6px'}});
  sidePanel.appendChild(el('div',{style:{fontSize:'0.85rem',fontWeight:600,color:'var(--text-secondary)',marginBottom:'2px'}},'📚 Matérias'));
  for (const sub of subs) {
    const row = el('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
      el('button',{
        className:`chip${state.timer.subject===sub?' active':''}`,
        style:{flex:1,textAlign:'left',justifyContent:'flex-start',padding:'6px 10px'},
        onClick:()=>{state.timer.subject=state.timer.subject===sub?'':sub;renderApp();}
      },sub),
      el('button',{className:'btn btn-sm btn-ghost',style:{padding:'2px 6px',fontSize:'0.7rem',color:'var(--text-muted)'},
        onClick:async(e)=>{e.stopPropagation();try{CACHE.subjects=await API.del(`/api/users/${state.user.id}/subjects/list`,{subject:sub});renderApp();}catch(e){toast('Erro','error');}}
      },'✕'));
    sidePanel.appendChild(row);
  }
  const addRow = el('div',{style:{display:'flex',gap:'4px',marginTop:'4px'}},
    el('input',{className:'input',id:'timer-subject-input',placeholder:'Nova matéria...',style:{flex:1,fontSize:'0.8rem',padding:'6px 8px'},onKeydown:e=>{if(e.key==='Enter')addSubjectInline();}}),
    el('button',{className:'btn btn-primary btn-sm',style:{padding:'6px 10px'},onClick:addSubjectInline},'➕'));
  sidePanel.appendChild(addRow);

  const c = el('div', { className: 'timer-container', style:{flex:1} });
  c.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'⏱ Cronômetro'),el('p',{className:'section-desc'},'Escolha um modo e conquiste seu foco.')),
    el('div',{style:{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.85rem',color:'var(--text-secondary)'}},el('span',{},'Boost:'),el('span',{style:{fontWeight:600,color:state.settings.boost!=='none'?'var(--accent-light)':'var(--text-muted)'}},boostLabel))));
  const mins = Math.floor(state.timer.seconds/60), secs = state.timer.seconds%60;
  const dd = el('div',{className:`timer-display${state.timer.active?' running':''}`,id:'timer-display'},`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`);
  c.appendChild(dd);
  const modes = el('div',{className:'timer-modes'});
  for (const [k,l] of [['free','⏰ Livre'],['pomodoro','🍅 Pomodoro'],['focus','🎯 Foco']]) modes.appendChild(el('button',{className:`timer-mode${state.timer.mode===k?' active':''}`,onClick:()=>setTimerMode(k)},l));
  c.appendChild(modes);
  c.appendChild(el('div',{className:'timer-controls'},
    el('button',{className:'btn btn-primary btn-lg',onClick:startTimer},state.timer.active?'▶ Rodando...':'▶ Iniciar'),
    el('button',{className:'btn btn-secondary btn-lg',onClick:pauseTimer,disabled:!state.timer.active},'⏸ Pausar'),
    el('button',{className:'btn btn-secondary',onClick:finishSession,disabled:!state.timer.active},'✅ Finalizar'),
    el('button',{className:'btn btn-ghost',onClick:resetTimer},'↺ Resetar')));
  const elapsed = state.timer.mode==='free'?state.timer.freeElapsed:Math.max(0,state.timer.target-state.timer.seconds);
  const expXp = Math.max(0,Math.round((elapsed/60)*Number(state.settings.xpPerMinute||12)));
  c.appendChild(el('div',{className:'timer-stats-grid'},
    el('div',{className:'timer-stat'},el('div',{className:'timer-stat-label'},'Tempo'),el('div',{className:'timer-stat-value'},`${Math.floor(elapsed/60)}m`)),
    el('div',{className:'timer-stat'},el('div',{className:'timer-stat-label'},'Ganhos'),el('div',{className:'timer-stat-value'},`${expXp} XP`)),
    el('div',{className:'timer-stat'},el('div',{className:'timer-stat-label'},'Streak'),el('div',{className:'timer-stat-value'},`🔥 ${state.user.streak}`))));
  c.appendChild(el('div',{className:'timer-bottom'},renderSessionHistory(),renderAchievementsFeed()));

  timerLayout.appendChild(sidePanel);
  timerLayout.appendChild(c);
  s.appendChild(timerLayout);
  window._td = dd;
  return s;
}

function setTimerMode(mode) {
  if (state.timer.active) return;
  state.timer.mode = mode;
  if (mode==='pomodoro') state.timer.target=1500;
  else if (mode==='focus') state.timer.target=2700;
  else { state.timer.target=0; state.timer.freeElapsed=0; }
  state.timer.seconds = state.timer.target || 0;
  updateTD(); renderApp();
}

async function addSubjectInline() {
  const name = $('timer-subject-input')?.value?.trim();
  if (!name) return toast('Digite o nome da matéria','error');
  try {
    CACHE.subjects = await API.post(`/api/users/${state.user.id}/subjects/list`,{subject:name});
    $('timer-subject-input').value = '';
    renderApp();
  } catch(e) { toast(e.message||'Erro','error'); }
}

function updateTD() {  const d = window._td || $('timer-display');
  if (!d) return;
  const m = Math.floor(state.timer.seconds/60), s = state.timer.seconds%60;
  d.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function startTimer() {
  if (state.timer.active) return;
  state.timer.active = true;
  state.timer.interval = setInterval(() => {
    if (state.timer.mode!=='free') { state.timer.seconds-=1; if (state.timer.seconds<=0) { finishSession(); return; } }
    else { state.timer.seconds+=1; state.timer.freeElapsed+=1; }
    updateTD(); const d = window._td; if (d) d.classList.add('running');
  }, 1000);
  renderApp();
}
function pauseTimer() {
  state.timer.active = false;
  clearInterval(state.timer.interval);
  const d = window._td; if (d) d.classList.remove('running');
  renderApp();
}
function resetTimer() { pauseTimer(); setTimerMode(state.timer.mode); renderApp(); }
async function finishSession() {
  pauseTimer();
  const elapsed = state.timer.mode==='free'?state.timer.freeElapsed:Math.max(0,state.timer.target-state.timer.seconds);
  const minutes = Math.max(1, Math.round(elapsed/60));
  if (!state.user) return;

  if (!IS_SERVER) {
    const xpGain = minutes * 12;
    const coinGain = minutes * 5 + state.user.streak * 2;
    state.user.total_minutes = (state.user.total_minutes||0) + minutes;
    state.user.weekly_minutes = (state.user.weekly_minutes||0) + minutes;
    state.user.xp = (state.user.xp||0) + xpGain;
    state.user.coins = (state.user.coins||0) + coinGain;
    state.user.streak = (state.user.streak||0) + 1;
    state.user.best_streak = Math.max(state.user.best_streak||0, state.user.streak);
    const session = { id: `sess-${Date.now()}`, minutes, mode: state.timer.mode, xp_gain: xpGain, coin_gain: coinGain, date: new Date().toLocaleString('pt-BR') };
    if (!state.user.sessionHistory) state.user.sessionHistory = [];
    state.user.sessionHistory.unshift(session);
    saveUserFallback();
    toast(`✅ Sessão finalizada! +${xpGain} XP e +${coinGain} moedas.`);
    if (minutes >= 30) confetti(60);
    resetTimer(); renderApp();
    return;
  }

  try {
    const r = await API.post(`/api/users/${state.user.id}/session`, {minutes, mode: state.timer.mode, subject: state.timer.subject});
    await refreshUser(); await loadCache();
    toast(`✅ Sessão finalizada! +${r.xpGain} XP e +${r.coinGain} moedas.`);
    if (minutes >= 30) confetti(60);
    state.timer.subject = '';
    resetTimer(); renderApp();
  } catch(e) { toast('Erro ao finalizar sessão','error'); }
}
function renderSessionHistory() {
  const card = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'📋 Histórico')));
  const list = el('div',{className:'session-list'});
  if (state.user.sessionHistory && state.user.sessionHistory.length) {
    for (const s of state.user.sessionHistory.slice(0,8)) list.appendChild(el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},s.mode.toUpperCase()),el('span',{},`${s.minutes} min`),el('span',{style:{color:'var(--accent-light)'}},`+${s.xp_gain} XP`),el('span',{style:{color:'var(--text-muted)',fontSize:'0.8rem'}},s.date)));
  } else list.appendChild(el('div',{className:'empty-state-text'},'Nenhuma sessão ainda'));
  card.appendChild(list); return card;
}
function renderAchievementsFeed() {
  const card = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'🏅 Conquistas')));
  const list = el('div',{className:'session-list'});
  const recent = (state.user.achievements||[]).slice(-5);
  if (recent.length) { for (const a of recent) list.appendChild(el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},a.name||a),el('span',{style:{fontSize:'0.85rem',color:'var(--text-muted)'}},'✅ Desbloqueado'))); }
  else list.appendChild(el('div',{className:'empty-state-text'},'Finalize uma sessão para desbloquear'));
  card.appendChild(list); return card;
}

/* ==================== PROFILE ==================== */
async function renderProfile() {
  const s = el('div',{className:'section'}); if (!state.user) return s;
  await refreshUser(); const u = state.user;
  const accent = u.accent_color || '#06b6d4';
  const borderEff = u.border_effect || 'none';
  const themeEff = u.theme || 'default';
  const effects = u.effects || [];
  const effMap = {}; for (const e of effects) effMap[e.effect_type] = e.effect_value;

  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'👤 Perfil'),el('p',{className:'section-desc'},'Personalize seu perfil com banners, cores e efeitos.')),
    el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderEditProfileModal())},'✏️ Editar Perfil')));

  const bannerUrl = u.banner_url || '';
  const bannerStyle = bannerUrl ? {backgroundImage:`url(${bannerUrl})`,backgroundSize:'cover',backgroundPosition:'center'} : {};
  const borderClass = borderEff !== 'none' ? `profile-border-${borderEff}` : '';

  s.appendChild(el('div',{className:`profile-card ${themeEff !== 'default' ? `profile-theme-${themeEff}` : ''}`,style:{'--profile-accent':accent}},
    bannerUrl ? el('div',{className:'profile-banner',style:bannerStyle}) : null,
    el('div',{className:`profile-header-content ${borderClass}`},
      el('div',{className:`profile-avatar-wrap ${borderClass}`,onClick:()=>openModal(renderAvatarModal())},
        el('div',{className:`profile-avatar ${Object.values(effMap).includes('aura-fogo')?'profile-avatar-fire':''} ${Object.values(effMap).includes('particulas')?'profile-avatar-particles':''}`},
          u.avatar && (u.avatar.startsWith('http')||u.avatar.startsWith('/uploads')) ? el('img',{src:u.avatar,style:{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}) : u.avatar||'🙂'),
        effMap.coroa ? el('div',{className:'profile-crown'},'👑') : null),
      el('div',{className:'profile-info'},
        el('h2',{className:'profile-name',style:{color:accent}},u.name),
        el('p',{className:'profile-title'},u.titles&&u.titles.length?u.titles[u.titles.length-1]:'Entusiasta'),
        u.bio ? el('p',{className:'profile-bio'},u.bio) : null,
        el('div',{className:'profile-badges'},
          el('span',{className:'profile-badge',style:{background:accent+'20',color:accent,borderColor:accent+'40'}},`Nível ${u.level}`),
          el('span',{className:'profile-badge'},`🪙 ${u.coins}`),
          el('span',{className:'profile-badge'},`🔥 ${u.streak} dias`))))));

  s.appendChild(el('div',{className:'profile-stats-enhanced'},
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},u.level),el('div',{className:'pstat-label'},'Nível')),
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},`${u.xp}`),el('div',{className:'pstat-label'},'XP')),
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},`🪙 ${u.coins}`),el('div',{className:'pstat-label'},'Moedas')),
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},`🔥 ${u.streak}`),el('div',{className:'pstat-label'},'Streak')),
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},u.best_day),el('div',{className:'pstat-label'},'Melhor dia')),
    el('div',{className:'profile-stat-card'},el('div',{className:'pstat-value'},`${u.best_streak} dias`),el('div',{className:'pstat-label'},'Melhor streak'))));

  const det = el('div',{className:'profile-details'});
  const statsCard = el('div',{className:'card'});
  statsCard.appendChild(el('div',{className:'card-title',style:{marginBottom:'12px'}},'📊 Estatísticas'));
  const statsGrid = el('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}});
  statsGrid.appendChild(el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Matéria favorita'),el('div',{style:{fontWeight:600}},u.favorite_subject||'Nenhuma')));
  statsGrid.appendChild(el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Total semanal'),el('div',{style:{fontWeight:600}},fmt(u.weekly_minutes))));
  statsCard.appendChild(statsGrid);
  det.appendChild(el('div',{className:'card'},el('div',{className:'card-title',style:{marginBottom:'12px'}},'🏷️ Títulos'),el('div',{className:'title-list'},...(u.titles||[]).map(t=>el('span',{className:'title-tag',style:{background:accent+'15',color:accent}},t)))));
  det.appendChild(statsCard);

  if (Object.keys(effMap).length) {
    const ecard = el('div',{className:'card'},el('div',{className:'card-title',style:{marginBottom:'12px'}},'✨ Efeitos Ativos'));
    const elist = el('div',{className:'effect-list'});
    for (const [type, val] of Object.entries(effMap)) {
      const labels = {border:'Borda',coroa:'Coroa',aura:'Aura',particulas:'Partículas',neon:'Neon',theme:'Tema'};
      elist.appendChild(el('span',{className:'effect-tag',style:{borderColor:accent+'40',color:accent}},`${labels[type]||type}: ${val}`));
    }
    ecard.appendChild(elist); s.appendChild(ecard);
  }

  s.appendChild(det);
  const hc = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'📋 Histórico completo')));
  const hl = el('div',{className:'session-list'});
  if (u.sessionHistory&&u.sessionHistory.length) { for (const h of u.sessionHistory.slice(0,10)) hl.appendChild(el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},h.mode.toUpperCase()),el('span',{},`${h.minutes} min`),el('span',{},h.date),el('span',{style:{color:'var(--accent-light)'}},`+${h.xp_gain} XP`))); }
  else hl.appendChild(el('div',{className:'empty-state-text'},'Nenhuma sessão registrada'));
  hc.appendChild(hl); s.appendChild(hc);
  s.appendChild(el('div',{style:{textAlign:'center',marginTop:'24px'}},
    el('button',{className:'btn btn-ghost btn-sm',style:{opacity:0.4,fontSize:'0.75rem'},onClick:()=>openModal(renderAdminLoginModal())},'🔐 Logar como Admin')));
  return s;
}

function renderEditProfileModal() {
  const u = state.user;
  const accent = u.accent_color || '#06b6d4';
  const effMap = {};
  for (const e of (u.effects||[])) effMap[e.effect_type] = e.effect_value;

  const avatarSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'👤 Avatar'),
    el('div',{style:{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}},
      el('span',{className:'avatar-preview',style:{fontSize:'3rem'}},u.avatar&&(u.avatar.startsWith('http')||u.avatar.startsWith('/uploads'))?el('img',{src:u.avatar,style:{width:'48px',height:'48px',objectFit:'cover',borderRadius:'12px',verticalAlign:'middle'}}):u.avatar||'🙂'),
      el('button',{className:'btn btn-secondary btn-sm',onClick:()=>openModal(renderAvatarModal())},'Trocar Emoji'),
      el('span',{style:{fontSize:'0.85rem',color:'var(--text-muted)'}},'ou'),
      el('input',{className:'input',type:'file',id:'prof-avatar-upload',accept:'image/*',style:{flex:1}}),
      el('button',{className:'btn btn-secondary btn-sm',onClick:uploadProfileAvatar},'Upload')),
    el('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},
      el('input',{className:'input',id:'prof-avatar-url',placeholder:'URL da imagem (GIF, PNG, etc.)',style:{flex:1}}),
      el('button',{className:'btn btn-secondary btn-sm',onClick:applyAvatarUrl},'Aplicar URL')));

  const bannerSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'🖼️ Banner'),
    u.banner_url ? el('img',{src:u.banner_url,style:{width:'100%',maxHeight:'100px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px'}}) : null,
    el('div',{style:{display:'flex',gap:'8px'}},
      el('input',{className:'input',type:'file',id:'prof-banner-upload',accept:'image/*',style:{flex:1}}),
      el('button',{className:'btn btn-secondary btn-sm',onClick:uploadProfileBanner},'Upload Banner')),
    el('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},
      el('input',{className:'input',id:'prof-banner-url',placeholder:'URL da imagem (GIF, PNG, etc.)',style:{flex:1}}),
      el('button',{className:'btn btn-secondary btn-sm',onClick:applyBannerUrl},'Aplicar URL')));

  const colors = ['#06b6d4','#8b5cf6','#22c55e','#eab308','#ef4444','#f97316','#ec4899','#14b8a6','#ffffff','#f59e0b'];
  const colorGrid = el('div',{className:'color-grid'});
  for (const c of colors) colorGrid.appendChild(el('button',{className:`color-swatch${c===accent?' active':''}`,dataset:{color:c},style:{background:c},onClick:()=>{document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));state._profColor=c;const sw=colorGrid.querySelector(`[data-color="${c}"]`);if(sw)sw.classList.add('active')}}));
  const colorSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'🎨 Cor de Destaque'),
    el('div',{style:{display:'flex',gap:'8px',alignItems:'center'}},
      el('input',{className:'input',type:'color',id:'prof-color',value:accent,style:{width:'60px',height:'40px',padding:'2px'},onInput:e=>{state._profColor=e.target.value;document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'))}}),
      colorGrid));

  const borderOptions = ['none','neon','lendaria','arco-iris','guardiao'];
  const borderLabels = {none:'Nenhuma',neon:'Neon',lendaria:'Lendária','arco-iris':'Arco-Íris',guardiao:'Guardião'};
  const borderItemMap = {'borda-neon':'neon','borda-lendaria':'lendaria','borda-guardiao':'guardiao','arco-iris':'arco-iris'};
  const ownedBorders = new Set(['none']);
  for (const iname of (u.inventory||[])) {
    const item = CACHE.store.find(s => s.name === iname);
    if (item && item.type === 'border' && borderItemMap[item.id]) ownedBorders.add(borderItemMap[item.id]);
  }
  const borderSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'🖌️ Borda do Perfil'),
    el('div',{className:'chip-group'},...borderOptions.filter(b=>ownedBorders.has(b)).map(b=>el('button',{className:`chip${(effMap.border||'none')===b?' active':''}`,onClick:()=>equipEffect('border',b)},borderLabels[b]||b))));

  const bioSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'📝 Bio'),
    el('textarea',{className:'input',id:'prof-bio',placeholder:'Conte um pouco sobre você...',style:{resize:'vertical',minHeight:'60px'}},u.bio||''));

  const favSection = el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'📚 Matéria Favorita'),
    el('input',{className:'input',id:'prof-subject',placeholder:'Ex: Matemática, História...',value:u.favorite_subject||''}));

  const saveBtn = el('button',{className:'btn btn-primary',style:{width:'100%',marginTop:'12px'},onClick:saveProfile},'💾 Salvar Perfil');

  return [el('h2',{className:'modal-title'},'✏️ Editar Perfil'),el('div',{className:'modal-body',style:{maxHeight:'70vh',overflowY:'auto'}},
    avatarSection,bannerSection,colorSection,borderSection,bioSection,favSection,saveBtn)];
}

function renderAvatarModal() {
  const emojis = ['🙂','😎','🧠','⚡','✨','👑','🍀','🌙','🦾','🐉','🦄','🧿','🔥','⭐','💎','🎯','🚀','🌈','👻','🤖','👽','🎃','🦋','🌸','🌺','🍕','🎮','💻','📚','🏀','🎸','🚗','✈️','🏆','🥇','💀','👁️','🌀','🎭','⚔️'];
  const grid = el('div',{className:'avatar-grid'});
  for (const em of emojis) grid.appendChild(el('button',{className:'avatar-option',onClick:async()=>{try{await API.put(`/api/users/${state.user.id}/avatar`,{avatar:em});state.user.avatar=em;closeModal();openModal(renderEditProfileModal());toast('Avatar atualizado!');}catch(e){toast('Erro','error');}}},em));
  return [el('h2',{className:'modal-title'},'Escolha seu Avatar'),el('p',{className:'modal-desc'},'Clique em um emoji para definir seu avatar.'),grid,el('div',{className:'modal-actions'},el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar'))];
}

function renderAdminLoginModal() {
  const container = el('div',{style:{display:'flex',flexDirection:'column',gap:'12px',padding:'12px 0'}},
    el('p',{style:{fontSize:'0.85rem',color:'var(--text-muted)'}},'Faça login como administrador para acessar o painel de controle.'),
    el('input',{className:'input',type:'password',id:'admin-login-pass',placeholder:'Senha de administrador',autofocus:true}),
    el('button',{className:'btn btn-primary',style:{width:'100%'},onClick:handleAdminLogin},'🔐 Entrar como Admin'));
  return [el('h2',{className:'modal-title'},'🔑 Admin Login'),container];
}

async function handleAdminLogin() {
  const password = $('admin-login-pass')?.value;
  if (!password) return toast('Digite a senha','error');
  if (password === 'assembleia') {
    closeModal();
    state.section = 'admin';
    renderApp();
    toast('🔐 Logado como Admin!');
  } else {
    toast('Senha incorreta','error');
  }
}

async function uploadProfileAvatar() {
  const file = $('prof-avatar-upload')?.files?.[0];
  if (!file) return toast('Selecione uma imagem','error');
  showLoading(true);
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const r = await API.post('/api/admin/upload-base64',{dataUrl:e.target.result,type:'avatar'});
      await API.put(`/api/users/${state.user.id}/avatar`,{avatar:r.url});
      state.user.avatar = r.url;
      showLoading(false);
      updateAvatarPreview();
      toast('Avatar atualizado!');
    } catch(err) { showLoading(false); toast(err.message||'Erro no upload do avatar','error'); }
  };
  reader.readAsDataURL(file);
}

async function uploadProfileBanner() {
  const file = $('prof-banner-upload')?.files?.[0];
  if (!file) return toast('Selecione uma imagem','error');
  showLoading(true);
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const r = await API.post('/api/admin/upload-base64',{dataUrl:e.target.result,type:'banner'});
      await API.put(`/api/users/${state.user.id}/profile`,{banner_url:r.url});
      state.user.banner_url = r.url;
      showLoading(false);
      updateBannerPreview();
      toast('Banner atualizado!');
    } catch(err) { showLoading(false); toast(err.message||'Erro no upload do banner','error'); }
  };
  reader.readAsDataURL(file);
}

async function applyAvatarUrl() {
  const url = $('prof-avatar-url')?.value?.trim();
  if (!url) return toast('Cole uma URL de imagem','error');
  try {
    await API.put(`/api/users/${state.user.id}/avatar`,{avatar:url});
    state.user.avatar = url;
    updateAvatarPreview();
    toast('Avatar atualizado!');
  } catch(e) { toast(e.message||'Erro ao aplicar URL','error'); }
}

async function applyBannerUrl() {
  const url = $('prof-banner-url')?.value?.trim();
  if (!url) return toast('Cole uma URL de banner','error');
  try {
    await API.put(`/api/users/${state.user.id}/profile`,{banner_url:url});
    state.user.banner_url = url;
    updateBannerPreview();
    toast('Banner atualizado!');
  } catch(e) { toast(e.message||'Erro ao aplicar URL','error'); }
}

function updateAvatarPreview() {
  const body = document.querySelector('.modal-body');
  if (!body) return;
  const avatarSection = body.children[0];
  if (!avatarSection) return;
  const preview = avatarSection.querySelector('.avatar-preview');
  if (!preview) return;
  const avatar = state.user.avatar;
  if (avatar && (avatar.startsWith('http')||avatar.startsWith('/uploads'))) {
    preview.innerHTML = '';
    const img = el('img',{src:avatar,style:{width:'48px',height:'48px',objectFit:'cover',borderRadius:'12px',verticalAlign:'middle'}});
    preview.appendChild(img);
  } else {
    preview.textContent = avatar||'🙂';
  }
}

function updateBannerPreview() {
  const body = document.querySelector('.modal-body');
  if (!body) return;
  const bannerSection = body.children[1];
  if (!bannerSection) return;
  const existingImg = bannerSection.querySelector('img');
  const url = state.user.banner_url;
  if (url) {
    if (existingImg) {
      existingImg.src = url;
    } else {
      const header = bannerSection.querySelector('.admin-section-title');
      if (header) {
        const img = el('img',{src:url,style:{width:'100%',maxHeight:'100px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px'}});
        header.after(img);
      }
    }
  } else if (existingImg) {
    existingImg.remove();
  }
}

async function equipEffect(type, value) {
  try {
    await API.post(`/api/users/${state.user.id}/equip-effect`,{effect_type:type,effect_value:value,unequip:value==='none'});
    toast(value==='none'?'Efeito removido':'Efeito equipado!');
    await refreshUser(); renderApp();
  } catch(e) { toast(e.message||'Erro ao equipar efeito','error'); }
}

async function saveProfile() {
  const bio = $('prof-bio')?.value||'';
  const color = state._profColor || $('prof-color')?.value || state.user.accent_color || '#06b6d4';
  const subject = $('prof-subject')?.value||'';
  try {
    const r = await API.put(`/api/users/${state.user.id}/profile`,{bio,accent_color:color,favorite_subject:subject});
    state.user = r.user;
    toast('Perfil salvo!'); closeModal(); await refreshUser(); await loadCache(); renderApp();
  } catch(e) { toast(e.message||'Erro ao salvar perfil','error'); }
}

/* ==================== RANKING ==================== */
function renderRanking() {
  const s = el('div',{className:'section'});
  const tabs = ['weekly','all','coins','streak'];
  const labels = {weekly:'📅 Semanal',all:'🏆 Geral',coins:'🪙 Moedas',streak:'🔥 Streak'};
  const tab = state._rankingTab;
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🏆 Ranking'),el('p',{className:'section-desc'},'Veja onde você está entre os competidores.')),
    el('div',{className:'chip-group'},...tabs.map(t=>el('button',{className:`chip${tab===t?' active':''}`,onClick:()=>{state._rankingTab=t;renderApp();}},labels[t])))));
  const content = el('div',{className:'ranking-content'});
  const sorted = [...CACHE.users].sort((a,b)=>{
    if (tab==='weekly') return b.weekly_minutes-a.weekly_minutes;
    if (tab==='all') return b.total_minutes-a.total_minutes;
    if (tab==='coins') return b.coins-a.coins;
    return b.streak-a.streak;
  });
  const rl = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},`Top Competidores (${labels[tab]})`)));
  const ri = el('div',{style:{display:'grid',gap:'8px'}});
  for (let i=0;i<sorted.length;i++) {
    const u=sorted[i]; const isMe=state.user&&u.id===state.user.id;
    const v = tab==='weekly'?fmt(u.weekly_minutes):tab==='all'?fmt(u.total_minutes):tab==='coins'?`${u.coins} 🪙`:`${u.streak} 🔥`;
    ri.appendChild(el('div',{className:`rank-item${isMe?' current':''}`},el('span',{className:'rank-position'},`#${i+1}`),el('span',{className:'rank-avatar'},u.avatar&&(u.avatar.startsWith('http')||u.avatar.startsWith('/uploads'))?el('img',{src:u.avatar,style:{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}):u.avatar||'🙂'),el('span',{className:'rank-name'},u.name),el('span',{className:'rank-value'},v)));
  }
  rl.appendChild(ri); content.appendChild(rl);
  const gl = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'🏰 Guildas')));
  const gi = el('div',{style:{display:'grid',gap:'8px'}});
  for (const g of CACHE.guilds.sort((a,b)=>(b.progress/b.goal)-(a.progress/a.goal))) gi.appendChild(el('div',{className:'rank-item'},el('span',{className:'rank-name'},g.name),el('span',{style:{fontSize:'0.85rem',color:'var(--text-secondary)'}},`${g.member_count||0} membros`),el('span',{className:'rank-value'},`${Math.round((g.progress/g.goal)*100)}%`)));
  gl.appendChild(gi); content.appendChild(gl); s.appendChild(content); return s;
}

/* ==================== STORE ==================== */
function renderStore() {
  const typeIcons = { theme:'🎨', border:'🖼', badge:'🏅', effect:'✨', title:'📛', boost:'⚡', utility:'🔧', pet:'🐾', custom:'📦' };
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🏪 Loja'),el('p',{className:'section-desc'},'Personalize sua jornada com itens exclusivos.')),
    el('div',{style:{display:'flex',alignItems:'center',gap:'8px',fontSize:'1.1rem',fontWeight:700}},`🪙 ${state.user.coins}`)));
  const grid = el('div',{className:'store-grid'});
  for (const item of CACHE.store) {
    const owned = (state.user.inventory||[]).includes(item.name);
    grid.appendChild(el('div',{className:'store-card'},
      el('div',{className:'store-card-header'},el('span',{className:'store-name'},`${typeIcons[item.type]||'📦'} ${item.name}`),rarityBadge(item.rarity)),
      el('div',{className:'store-desc'},item.description),
      el('div',{className:'store-footer'},el('span',{className:'store-price'},`🪙 ${item.price}`),el('button',{className:`btn ${owned?'btn-secondary':'btn-primary'}`,onClick:()=>buyItem(item)},owned?'✅ Equipar':'Comprar'))));
  }
  s.appendChild(grid); return s;
}
async function buyItem(item) {
  const owned = (state.user.inventory||[]).includes(item.name);
  if (owned) {
    if (item.type==='theme') { try{await equipEffect('theme',item.id.replace('tema-',''));toast('🎨 Tema equipado!');renderApp();}catch(e){toast('Erro','error');} }
    else if (item.type==='border') { try{await equipEffect('border',item.id.replace('borda-',''));toast('🖼 Moldura equipada!');renderApp();}catch(e){toast('Erro','error');} }
    else if (item.type==='effect') { try{await equipEffect(item.id.replace('efeito-',''),item.id.replace('efeito-',''));toast('✨ Efeito equipado!');renderApp();}catch(e){toast('Erro','error');} }
    else toast('Item já adquirido');
    return;
  }
  if (state.user.coins < item.price) return toast('Saldo insuficiente!','error');
  try {
    const r = await API.post('/api/store/buy',{userId:state.user.id,itemId:item.id});
    await refreshUser(); await loadCache();
    toast(`🎉 ${item.name} comprado!`);
    renderApp();
  } catch(e) { toast(e.message||'Erro ao comprar','error'); }
}

/* ==================== BETS ==================== */
/* ==================== MISSIONS ==================== */
function renderMissions() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🎯 Missões'),el('p',{className:'section-desc'},'Complete desafios e ganhe recompensas.')),
    el('button',{className:'btn btn-secondary',onClick:async()=>{await loadCache();renderApp();}},'🔄 Recarregar')));
  const grid = el('div',{className:'mission-grid'});
  for (const m of CACHE.missions) {
    const pct = Math.min(100,Math.round((m.progress/m.target)*100));
    grid.appendChild(el('div',{className:'mission-card'},
      el('div',{className:'mission-type'},m.type==='daily'?'📅 Diária':'📆 Semanal'),
      el('div',{className:'mission-name'},m.name),
      el('div',{className:'mission-progress'},el('div',{className:'progress-bar'},el('div',{className:'progress-fill',style:{width:`${pct}%`}})),el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:'4px'}},`${m.progress}/${m.target}`)),
      el('div',{className:'mission-reward'},el('span',{},`+${m.reward_xp} XP`),el('span',{},`+${m.reward_coins} 🪙`),m.reward_title?el('span',{},`🏷️ ${m.reward_title}`):null),
      el('button',{className:`btn ${m.active&&m.progress>=m.target?'btn-primary':'btn-secondary'}`,onClick:async()=>{if(m.progress<m.target)return toast('Missão não concluída','error');if(!m.active)return toast('Já resgatada','error');try{await API.post('/api/missions/claim',{userId:state.user.id,missionId:m.id});state.user.coins+=m.reward_coins;state.user.xp+=m.reward_xp;m.active=false;toast(`🎉 Concluída! +${m.reward_coins} 🪙`);confetti(30);await loadCache();renderApp();}catch(e){toast(e.message||'Erro','error');}},disabled:!m.active||m.progress<m.target},
        m.active&&m.progress>=m.target?'🎁 Resgatar':m.active?'Em andamento':'✅ Concluída')));
  }
  s.appendChild(grid); return s;
}

/* ==================== GUILDS ==================== */
function renderGuilds() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🏰 Guildas'),el('p',{className:'section-desc'},'Crie ou entre em um clã com metas coletivas.')),
    el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderGuildModal())},'🚪 Criar/Entrar')));
  const ug = CACHE.guilds.find(g=>g.id===state.user.guild_id);
  const grid = el('div',{className:'guild-grid'});
  grid.appendChild(el('div',{className:'guild-card'},
    el('div',{className:'card-title',style:{marginBottom:'12px'}},'👤 Sua Guilda'),
    ug?el('div',{},el('div',{className:'guild-name'},ug.name),el('div',{className:'guild-members'},`${ug.member_count||0} membros`),el('div',{className:'progress-bar'},el('div',{className:'progress-fill',style:{width:`${Math.min(100,Math.round((ug.progress/ug.goal)*100))}%`}})),el('div',{style:{fontSize:'0.85rem',color:'var(--text-secondary)',marginTop:'4px'}},`${ug.progress}/${ug.goal}`)):el('div',{className:'empty-state-text'},'Você não está em nenhuma guilda')));
  grid.appendChild(el('div',{className:'guild-card'},
    el('div',{className:'card-title',style:{marginBottom:'12px'}},'🏆 Ranking'),
    el('div',{className:'session-list'},...CACHE.guilds.sort((a,b)=>(b.progress/b.goal)-(a.progress/a.goal)).map(g=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},g.name),el('span',{},`${g.member_count||0} membros`),el('span',{},`${Math.round((g.progress/g.goal)*100)}%`))))));
  s.appendChild(grid); return s;
}
function renderGuildModal() {
  return [el('h2',{className:'modal-title'},'Guildas'),el('p',{className:'modal-desc'},'Clique em uma guilda para entrar ou crie uma nova.'),
    el('div',{className:'session-list',style:{marginBottom:'12px'}},...CACHE.guilds.map(g=>el('div',{className:'session-item',style:{cursor:'pointer'},onClick:()=>joinGuild(g)},el('span',{style:{fontWeight:600}},g.name),el('span',{},`${g.member_count||0} membros`)))),
    el('input',{className:'input',placeholder:'Nome da nova guilda',id:'guild-name-input'}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:()=>{const n=$('guild-name-input')?.value.trim();if(n){closeModal();createGuild(n);}}},'Criar Guilda'),el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar'))];
}
async function joinGuild(guild) {
  if (state.user.guild_id) return toast('Você já está em uma guilda','error');
  try { await API.post('/api/guilds/join',{guildId:guild.id,userId:state.user.id}); state.user.guild_id=guild.id; closeModal(); toast(`🎉 Entrou em ${guild.name}!`); await loadCache(); renderApp(); }
  catch(e) { toast(e.message||'Erro','error'); }
}
async function createGuild(name) {
  try { await API.post('/api/guilds',{name,userId:state.user.id}); state.user.guild_id=name.toLowerCase().replace(/\s+/g,'-'); toast(`🏰 Guilda ${name} criada!`); await loadCache(); renderApp(); }
  catch(e) { toast(e.message||'Erro','error'); }
}

/* ==================== ACHIEVEMENTS ==================== */
function renderAchievements() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},el('div',{},el('h2',{className:'section-title'},'🏅 Conquistas'),el('p',{className:'section-desc'},'Marque sua evolução com badges especiais.'))));
  const grid = el('div',{className:'achievement-grid'});
  const unlocked = (state.user.achievements||[]).map(a=>a.name||a);
  for (const a of CACHE.achievements) {
    const owned = unlocked.includes(a.name);
    grid.appendChild(el('div',{className:`achievement-card${owned?' unlocked':' locked'}`},
      el('div',{className:'achievement-icon'},owned?'🏆':'🔒'),
      el('div',{className:'achievement-name'},a.name),el('div',{className:'achievement-desc'},a.description),
      el('div',{style:{marginTop:'8px'}},rarityBadge(a.rarity)),
      el('div',{style:{fontSize:'0.8rem',color:owned?'var(--success)':'var(--text-muted)',marginTop:'8px'}},owned?'✅ Desbloqueado':'🔒 Bloqueado')));
  }
  s.appendChild(grid); return s;
}

/* ==================== EVENTS ==================== */
function renderEvents() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},el('div',{},el('h2',{className:'section-title'},'🎪 Eventos'),el('p',{className:'section-desc'},'Eventos temporários trazem bônus exclusivos.'))));
  const list = el('div',{className:'events-grid'});
  for (const e of CACHE.events) list.appendChild(el('div',{className:`event-card${e.active?' active':''}`},
    el('div',{},el('div',{className:'event-name'},e.name),el('div',{className:'event-desc'},e.description)),
    el('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},el('span',{className:`badge ${e.active?'badge-success':'badge-danger'}`},e.active?'✅ Ativo':'💤 Inativo'),el('span',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},e.expires))));
  s.appendChild(list); return s;
}

/* ==================== CASINO ==================== */
function renderCasino() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🎰 Cassino'),el('p',{className:'section-desc'},'Jogue Mines, Roleta e Blackjack com moedas virtuais.')),
    el('div',{style:{display:'flex',alignItems:'center',gap:'8px',fontSize:'1.1rem',fontWeight:700}},`🪙 ${state.user.coins}`)));
  const tabs = ['mines','roulette','blackjack'];
  const tlabels = {mines:'⛏ Mines',roulette:'🎡 Roleta',blackjack:'🃏 Blackjack'};
  if (!state._casino.game) state._casino.game = 'mines';
  s.appendChild(el('div',{className:'chip-group',style:{marginBottom:'16px'}},...tabs.map(t=>el('button',{className:`chip${state._casino.game===t?' active':''}`,onClick:()=>{state._casino.game=t;renderApp();}},tlabels[t]))));

  if (state._casino.game==='mines') s.appendChild(renderMinesGame());
  else if (state._casino.game==='roulette') s.appendChild(renderRouletteGame());
  else if (state._casino.game==='blackjack') s.appendChild(renderBlackjackGame());

  const btm = el('div',{className:'casino-bottom'});
  btm.appendChild(renderCasinoHistory()); btm.appendChild(renderRichRanking());
  s.appendChild(btm); return s;
}

/* ═══════════ MINES ═══════════ */
function renderMinesGame() {
  const c = el('div',{className:'casino-game-container'});
  const mg = state._casino.mines || {};
  if (!mg.gameId) {
    c.appendChild(el('div',{style:{textAlign:'center',padding:'20px',color:'var(--text-muted)',fontSize:'0.9rem'}},'Escolha sua aposta e clique em Iniciar.'));
    c.appendChild(el('div',{className:'admin-form',style:{maxWidth:'300px',margin:'0 auto'}},
      el('div',{},el('label',{style:{fontSize:'0.8rem',color:'var(--text-secondary)'}},'Aposta'),el('input',{className:'input',id:'mines-bet',type:'number',min:'10',value:'50',step:'10'})),
      el('div',{},el('label',{style:{fontSize:'0.8rem',color:'var(--text-secondary)'}},'Minas (1-5)'),el('input',{className:'input',id:'mines-count',type:'number',min:'1',max:'5',value:'3'})),
      el('button',{className:'btn btn-primary',style:{width:'100%',marginTop:'12px'},onClick:startMinesGame},'⛏ Iniciar Mines')));
  } else {
    const grid = el('div',{className:'mines-grid'});
    for (let i=0;i<25;i++) {
      let content = '', cls = 'mines-tile';
      if (mg.revealed?.includes(i)) {
        if (mg.mines?.includes(i)) { content='💣'; cls+=' mine'; }
        else { content='💎'; cls+=' gem'; }
      } else if (mg.gameOver && mg.mines?.includes(i)) { content='💣'; cls+=' mine'; }
      else { content='❓'; }
      grid.appendChild(el('button',{
        className:cls,
        disabled:mg.gameOver || mg.revealed?.includes(i),
        onClick:()=>revealMine(i)
      },content));
    }
    c.appendChild(grid);

    const info = el('div',{style:{display:'flex',justifyContent:'center',gap:'16px',marginTop:'12px',flexWrap:'wrap',alignItems:'center'}});
    const safeCount = mg.revealed?.filter(r=>!mg.mines?.includes(r)).length||0;
    const mult = 1 + safeCount * 0.25;
    info.appendChild(el('span',{style:{fontSize:'0.85rem',color:'var(--text-secondary)'}},`💎 ${safeCount} seguras`));
    info.appendChild(el('span',{style:{fontSize:'1rem',fontWeight:700,color:'var(--accent-light)'}},`x${mult.toFixed(2)}`));
    if (!mg.gameOver) info.appendChild(el('button',{className:'btn btn-success btn-sm',disabled:safeCount===0,onClick:cashOutMines},`💰 Sacar ${Math.round(mg.bet*mult)} 🪙`));
    if (mg.gameOver) {
      const won = mg.lastWon||0;
      info.appendChild(el('span',{style:{fontSize:'1rem',fontWeight:700,color:won>0?'var(--success)':'var(--danger)'}},won>0?`+${won} 🎉`:'💥 Perdeu!'));
    }
    info.appendChild(el('button',{className:'btn btn-ghost btn-sm',onClick:()=>{delete state._casino.mines;renderApp();}},'↺ Novo Jogo'));
    c.appendChild(info);
  }
  return c;
}
async function startMinesGame() {
  const bet = Number($('mines-bet')?.value||50);
  const minesCount = Number($('mines-count')?.value||3);
  if (bet<10) return toast('Aposta mínima 10','error');
  if (bet>state.user.coins) return toast('Saldo insuficiente','error');
  try {
    const r = await API.post('/api/casino/mines/start',{userId:state.user.id,bet,minesCount:Math.min(5,Math.max(1,minesCount))});
    state._casino.mines = { gameId:r.gameId, bet, minesCount:r.minesCount, revealed:[], gameOver:false, mines:[] };
    await refreshUser(); renderApp();
  } catch(e) { toast(e.message||'Erro','error'); }
}
async function revealMine(i) {
  const mg = state._casino.mines;
  if (!mg?.gameId || mg.gameOver) return;
  try {
    const r = await API.post('/api/casino/mines/reveal',{gameId:mg.gameId,tile:i});
    mg.revealed.push(i);
    if (r.mines) mg.mines = r.mines;
    if (r.gameOver) { mg.gameOver=true; mg.lastWon=r.won||0; if (r.mines) mg.mines=r.mines; }
    await refreshUser(); renderApp();
  } catch(e) { toast(e.message||'Erro','error'); }
}
async function cashOutMines() {
  const mg = state._casino.mines;
  if (!mg?.gameId || mg.gameOver) return;
  try {
    const r = await API.post('/api/casino/mines/cashout',{gameId:mg.gameId});
    mg.gameOver=true; mg.lastWon=r.won;
    await refreshUser(); renderApp();
    toast(`💰 Sacou ${r.won} moedas!`);
    if (r.won>=500) confetti(40);
  } catch(e) { toast(e.message||'Erro','error'); }
}

/* ═══════════ ROULETTE ═══════════ */
function renderRouletteGame() {
  const c = el('div',{className:'casino-game-container'});
  const rg = state._casino.roulette || {};

  const redNums = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const table = el('div',{className:'roulette-table'});
  table.appendChild(el('button',{className:`roulette-num zero${rg.betType==='number'&&rg.betValue==='0'?' selected':''}`,
    onClick:()=>{state._casino.roulette={...state._casino.roulette,betType:'number',betValue:'0'};renderApp();}},'0'));
  const nums = Array.from({length:12},(_,r)=>[r*3+1,r*3+2,r*3+3]);
  for (const row of nums) for (const n of row) {
    const isRed = redNums.includes(n);
    table.appendChild(el('button',{
      className:`roulette-num ${isRed?'red':'black'}${rg.betType==='number'&&Number(rg.betValue)===n?' selected':''}`,
      onClick:()=>{state._casino.roulette={...state._casino.roulette,betType:'number',betValue:String(n)};renderApp();}
    },String(n)));
  }
  const sideBets = [
    {type:'red',label:'🔴 Vermelho',payout:'2x'},{type:'black',label:'⚫ Preto',payout:'2x'},
    {type:'even',label:'👥 Par',payout:'2x'},{type:'odd',label:'👤 Ímpar',payout:'2x'},
    {type:'1-12',label:'1-12',payout:'3x'},{type:'13-24',label:'13-24',payout:'3x'},{type:'25-36',label:'25-36',payout:'3x'},
  ];
  const sb = el('div',{className:'roulette-side-bets'});
  for (const s of sideBets) sb.appendChild(el('button',{
    className:`chip${rg.betType===s.type?' active':''}`,
    onClick:()=>{state._casino.roulette={...state._casino.roulette,betType:s.type,betValue:s.type};renderApp();}
  },`${s.label} (${s.payout})`));

  const controls = el('div',{style:{display:'flex',gap:'8px',alignItems:'center',marginTop:'12px',justifyContent:'center'}});
  controls.appendChild(el('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
    el('span',{style:{fontSize:'0.85rem',color:'var(--text-secondary)'}},'Aposta:'),el('input',{className:'input',id:'roulette-bet',type:'number',min:'10',value:'50',style:{width:'80px',padding:'6px'}})));
  controls.appendChild(el('button',{className:'btn btn-primary',disabled:!rg.betType||rg.spinning,onClick:spinRoulette},'🎡 Girar'));
  if (rg.lastResult !== undefined) {
    const isRed = redNums.includes(rg.lastResult.number);
    controls.appendChild(el('span',{style:{fontSize:'1.2rem',fontWeight:700,marginLeft:'8px',color:rg.lastResult.netAmount>=0?'var(--success)':'var(--danger)'}},
      `${rg.lastResult.number} ${rg.lastResult.color==='vermelho'?'🔴':'⚫'} ${rg.lastResult.netAmount>=0?`+${rg.lastResult.netAmount} 🎉`:`${rg.lastResult.netAmount}`}`));
  }

  c.appendChild(el('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'8px'}},
    el('div',{style:{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'4px'}},'Clique em um número ou escolha uma aposta lateral'),
    table,
    el('div',{style:{fontSize:'0.8rem',color:'var(--text-secondary)',marginTop:'8px'}},'Apostas Laterais'),
    sb,
    controls));
  return c;
}
async function spinRoulette() {
  const bet = Number($('roulette-bet')?.value||50);
  const rg = state._casino.roulette||{};
  if (!rg.betType) return toast('Selecione uma aposta','error');
  if (bet<10) return toast('Aposta mínima 10','error');
  if (bet>state.user.coins) return toast('Saldo insuficiente','error');
  try {
    rg.spinning = true; renderApp();
    const r = await API.post('/api/casino/roulette/spin',{userId:state.user.id,bet,betType:rg.betType,betValue:rg.betValue});
    rg.lastResult = r; rg.spinning = false;
    await refreshUser(); renderApp();
    if (r.netAmount>0) { toast(`🎉 Ganhou ${r.netAmount} moedas!`); if (r.netAmount>=500) confetti(40); }
    else if (r.netAmount<0) toast(`😞 Perdeu ${Math.abs(r.netAmount)}`);
  } catch(e) { rg.spinning=false; renderApp(); toast(e.message||'Erro','error'); }
}

/* ═══════════ BLACKJACK ═══════════ */
function renderBlackjackGame() {
  const c = el('div',{className:'casino-game-container'});
  const bg = state._casino.blackjack || {};

  if (!bg.gameId) {
    c.appendChild(el('div',{style:{textAlign:'center',padding:'20px',color:'var(--text-muted)',fontSize:'0.9rem'}},'Blackjack — vença o dealer sem estourar 21.'));
    c.appendChild(el('div',{className:'admin-form',style:{maxWidth:'300px',margin:'0 auto'}},
      el('div',{},el('label',{style:{fontSize:'0.8rem',color:'var(--text-secondary)'}},'Aposta'),el('input',{className:'input',id:'bj-bet',type:'number',min:'10',value:'50',step:'10'})),
      el('button',{className:'btn btn-primary',style:{width:'100%',marginTop:'12px'},onClick:dealBlackjack},'🃏 Dar Cartas')));
    return c;
  }

  function renderCard(card) {
    if (card.hidden) return el('div',{className:'bj-card-hidden'},'🂠');
    const isRed = card.suit==='♥'||card.suit==='♦';
    return el('div',{className:`bj-card ${isRed?'red':'black'}`},
      el('div',{className:'bj-card-rank'},card.rank),
      el('div',{className:'bj-card-suit'},card.suit));
  }

  const table = el('div',{className:'bj-table'});
  const dealer = el('div',{className:'bj-hand'});
  dealer.appendChild(el('div',{style:{fontWeight:600,fontSize:'0.85rem',color:'var(--text-secondary)',marginBottom:'6px'}},'Dealer'));
  const dh = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}});
  for (const card of bg.dealer||bg.hands?.dealer||[]) dh.appendChild(renderCard(card));
  dealer.appendChild(dh);
  if (bg.dealerValue !== undefined && bg.gameOver) dealer.appendChild(el('div',{style:{fontSize:'0.85rem',marginTop:'4px',fontWeight:600}},`${bg.dealerValue}`));
  table.appendChild(dealer);

  const player = el('div',{className:'bj-hand'});
  player.appendChild(el('div',{style:{fontWeight:600,fontSize:'0.85rem',color:'var(--text-secondary)',marginBottom:'6px'}},'Você'));
  const ph = el('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}});
  for (const card of bg.player||bg.hands?.player||[]) ph.appendChild(renderCard(card));
  player.appendChild(ph);
  if (bg.playerValue !== undefined) player.appendChild(el('div',{style:{fontSize:'0.85rem',marginTop:'4px',fontWeight:600}},`${bg.playerValue}`));
  table.appendChild(player);

  c.appendChild(table);

  const actions = el('div',{style:{display:'flex',gap:'8px',justifyContent:'center',marginTop:'12px',flexWrap:'wrap',alignItems:'center'}});
  if (!bg.gameOver) {
    actions.appendChild(el('button',{className:'btn btn-primary',onClick:blackjackHit},'👆 Comprar'));
    actions.appendChild(el('button',{className:'btn btn-secondary',onClick:blackjackStand},'✋ Parar'));
  }
  if (bg.result) {
    const won = bg.netAmount>0;
    actions.appendChild(el('span',{style:{fontSize:'1.1rem',fontWeight:700,color:won?'var(--success)':'var(--danger)'}},bg.result));
    if (bg.netAmount>0) actions.appendChild(el('span',{style:{fontSize:'0.9rem',fontWeight:600,color:'var(--success)'}},`+${bg.netAmount} 🎉`));
  }
  actions.appendChild(el('button',{className:'btn btn-ghost btn-sm',onClick:()=>{delete state._casino.blackjack;renderApp();}},'↺ Nova Mão'));
  c.appendChild(actions);
  return c;
}
async function dealBlackjack() {
  const bet = Number($('bj-bet')?.value||50);
  if (bet<10) return toast('Aposta mínima 10','error');
  if (bet>state.user.coins) return toast('Saldo insuficiente','error');
  try {
    const r = await API.post('/api/casino/blackjack/deal',{userId:state.user.id,bet});
    state._casino.blackjack = { gameId:r.gameId, bet, player:r.player, dealer:r.dealer, playerValue:r.playerValue, dealerValue:r.dealerValue, result:r.result, gameOver:r.gameOver, netAmount:r.netAmount, hands:r.hands };
    await refreshUser(); renderApp();
    if (r.result) { toast(r.result); if (r.netAmount>0) confetti(30); }
  } catch(e) { toast(e.message||'Erro','error'); }
}
async function blackjackHit() {
  const bg = state._casino.blackjack;
  if (!bg?.gameId || bg.gameOver) return;
  try {
    const r = await API.post('/api/casino/blackjack/hit',{gameId:bg.gameId});
    bg.player = r.hand||r.hand; bg.playerValue = r.value;
    if (r.gameOver) {
      bg.gameOver = true;
      if (r.dealerHand) bg.dealer = r.dealerHand;
      if (r.dealerValue!==undefined) bg.dealerValue = r.dealerValue;
      bg.result = r.result||(r.bust?'Estourou!':'');
      bg.netAmount = r.netAmount||-bg.bet;
      if (r.netAmount>0) confetti(30);
    }
    await refreshUser(); renderApp();
  } catch(e) { toast(e.message||'Erro','error'); }
}
async function blackjackStand() {
  const bg = state._casino.blackjack;
  if (!bg?.gameId || bg.gameOver) return;
  try {
    const r = await API.post('/api/casino/blackjack/stand',{gameId:bg.gameId});
    bg.gameOver = true; bg.dealer = r.dealerHand; bg.playerValue = r.playerValue; bg.dealerValue = r.dealerValue; bg.result = r.result; bg.netAmount = r.netAmount;
    await refreshUser(); renderApp();
    if (r.netAmount>0) { toast(`🎉 ${r.result}`); confetti(30); }
    else toast(r.result||'Perdeu!');
  } catch(e) { toast(e.message||'Erro','error'); }
}
function renderCasinoHistory() {
  const card = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'📋 Histórico')));
  const list = el('div',{className:'session-list'});
  if (CACHE.casinoHistory&&CACHE.casinoHistory.length) { for (const h of CACHE.casinoHistory.slice(0,10)) list.appendChild(el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},h.game),el('span',{style:{color:Number(h.amount)>=0?'var(--success)':'var(--danger)'}},Number(h.amount)>=0?`+${h.amount}`:`${h.amount}`),el('span',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},h.user_name||''))); }
  else list.appendChild(el('div',{className:'empty-state-text'},'Nenhuma rodada ainda'));
  card.appendChild(list); return card;
}
function renderRichRanking() {
  const card = el('div',{className:'card'},el('div',{className:'card-header'},el('div',{className:'card-title'},'💰 Mais ricos')));
  const list = el('div',{className:'session-list'});
  for (let i=0;i<Math.min(6,CACHE.users.length);i++){const u=[...CACHE.users].sort((a,b)=>b.coins-a.coins)[i];list.appendChild(el('div',{className:'session-item'},el('span',{},`${i+1}. ${u.avatar||'🙂'} ${u.name}`),el('span',{style:{fontWeight:600}},`${u.coins} 🪙`)));}
  card.appendChild(list); return card;
}

/* ==================== PDF LIBRARY ==================== */
let _pdfs = [], _pdfCat = 'todas', _pdfSearch = '';

async function renderPdfLibrary() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'📚 Biblioteca de PDFs'),el('p',{className:'section-desc'},'Compartilhe e descubra materiais de estudo.')),
    el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderUploadPdfModal())},'📤 Upload PDF')));
  try {
    const params = new URLSearchParams();
    if (_pdfCat !== 'todas') params.set('cat',_pdfCat);
    if (_pdfSearch) params.set('q',_pdfSearch);
    _pdfs = await API.get(`/api/pdfs?${params}`);
    let cats = ['todas'];
    try { cats = ['todas', ...(await API.get('/api/pdfs/categories'))]; } catch(e) {}
    const searchRow = el('div',{style:{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}});
    searchRow.appendChild(el('input',{className:'input',placeholder:'Buscar PDFs...',value:_pdfSearch,style:{flex:1,minWidth:'200px'},onInput:e=>{_pdfSearch=e.target.value;renderApp();}}));
    searchRow.appendChild(el('div',{className:'chip-group'},...cats.map(c=>el('button',{className:`chip${_pdfCat===c?' active':''}`,onClick:()=>{_pdfCat=c;renderApp();}},c))));
    s.appendChild(searchRow);
    if (!_pdfs.length) {
      s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-icon'},'📚'),el('div',{className:'empty-state-text'},'Nenhum PDF encontrado. Seja o primeiro a compartilhar!')));
    } else {
      const grid = el('div',{className:'pdf-grid'});
      for (const pdf of _pdfs) {
        const catColors = {'geral':'#06b6d4','matematica':'#22c55e','portugues':'#8b5cf6','historia':'#f59e0b','geografia':'#ef4444','ciencias':'#ec4899','ingles':'#14b8a6','outros':'#64748b'};
        const catColor = catColors[pdf.category] || '#64748b';
        grid.appendChild(el('div',{className:'pdf-card',style:{borderLeftColor:catColor}},
          el('div',{className:'pdf-card-header'},
            el('span',{className:'pdf-category',style:{background:catColor+'20',color:catColor}},pdf.category||'geral'),
            el('span',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},`📥 ${pdf.downloads||0}`)),
          el('div',{className:'pdf-title'},pdf.title),
          pdf.description ? el('div',{className:'pdf-desc'},pdf.description) : null,
          el('div',{className:'pdf-meta'},el('span',{},`👤 ${pdf.author}`),el('span',{},new Date(pdf.created_at).toLocaleDateString('pt-BR'))),
          el('div',{className:'pdf-actions'},
            el('a',{className:'btn btn-primary btn-sm',href:pdf.file_url,target:'_blank',onClick:async()=>{try{await API.post(`/api/pdfs/download/${pdf.id}`);}catch(e){}}},'📖 Visualizar'),
            el('a',{className:'btn btn-secondary btn-sm',href:pdf.file_url,download:true},'⬇️ Baixar'))));
      }
      s.appendChild(grid);
    }
  } catch(e) { s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-icon'},'❌'),el('div',{className:'empty-state-text'},'Erro ao carregar PDFs'))); }
  return s;
}

function renderUploadPdfModal() {
  return [el('h2',{className:'modal-title'},'📤 Upload PDF'),
    el('input',{className:'input',placeholder:'Título do PDF',id:'pdf-title',style:{marginBottom:'8px'}}),
    el('select',{className:'select',id:'pdf-category',style:{marginBottom:'8px'}},
      ['geral','matematica','portugues','historia','geografia','ciencias','ingles','outros'].map(c=>el('option',{value:c},c.charAt(0).toUpperCase()+c.slice(1)))),
    el('input',{className:'input',placeholder:'Descrição (opcional)',id:'pdf-desc',style:{marginBottom:'8px'}}),
    el('div',{style:{display:'flex',gap:'8px',marginBottom:'8px',alignItems:'center'}},
      el('input',{className:'input',type:'file',id:'pdf-file',accept:'application/pdf,image/*',style:{flex:1}})),
    el('input',{className:'input',placeholder:'Ou cole URL do arquivo',id:'pdf-url',style:{marginBottom:'8px'}}),
    el('div',{className:'modal-actions'},
      el('button',{className:'btn btn-primary',onClick:async()=>{
        const title = $('pdf-title')?.value;
        if (!title) return toast('Título obrigatório','error');
        let fileUrl = $('pdf-url')?.value;
        if (!fileUrl) {
          const file = $('pdf-file')?.files?.[0];
          if (!file) return toast('Selecione um arquivo ou cole uma URL','error');
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              const r = await API.post('/api/admin/upload-base64',{dataUrl:ev.target.result,type:'pdf'});
              const cat = $('pdf-category')?.value||'geral';
              const desc = $('pdf-desc')?.value||'';
              await API.post('/api/pdfs',{title,category:cat,description:desc,fileUrl:r.url,uploaderId:state.user.id});
              toast('PDF enviado com sucesso!'); closeModal(); renderApp();
            } catch(err) { toast(err.message||'Erro no upload','error'); }
          };
          reader.readAsDataURL(file);
          return;
        }
        try {
          const cat = $('pdf-category')?.value||'geral';
          const desc = $('pdf-desc')?.value||'';
          await API.post('/api/pdfs',{title,category:cat,description:desc,fileUrl,uploaderId:state.user.id});
          toast('PDF enviado com sucesso!'); closeModal(); renderApp();
        } catch(err) { toast(err.message||'Erro','error'); }
      }},'📤 Enviar'),
      el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar'))];
}

/* ==================== FRIENDS ==================== */
async function renderFriends() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'👥 Amigos'),el('p',{className:'section-desc'},'Conecte-se com outros estudantes.')),
    el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderAddFriendModal())},'➕ Adicionar')));
  try {
    const [friends, pending] = await Promise.all([
      API.get(`/api/friends/${state.user.id}`),
      API.get(`/api/friends/pending/${state.user.id}`)
    ]);
    if (pending.length) {
      s.appendChild(el('div',{className:'card',style:{marginBottom:'16px'}},
        el('div',{className:'card-title',style:{marginBottom:'12px'}},'🕐 Solicitações Pendentes'),
        el('div',{className:'session-list'},...pending.map(p=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},[p.avatar||'🙂',' ',p.name]),el('div',{style:{display:'flex',gap:'4px'}},el('button',{className:'btn btn-sm btn-success',onClick:async()=>{try{await API.post('/api/friends/accept',{reqId:p.req_id});toast('Amigo adicionado!');renderApp();}catch(e){toast('Erro','error');}}},'✅ Aceitar'),el('button',{className:'btn btn-sm btn-danger',onClick:async()=>{try{await API.post('/api/friends/remove',{userId:p.id,friendId:state.user.id});toast('Recusado');renderApp();}catch(e){}}},'✕')))))));
    }
    if (friends.length) {
      s.appendChild(el('div',{className:'friend-grid'},...friends.map(f=>el('div',{className:'friend-card',onClick:()=>showUserProfile(f.id)},
        el('div',{style:{fontSize:'2rem'}},f.avatar||'🙂'),
        el('div',{className:'friend-name'},f.name),
        el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},`Nível ${f.level} • ${f.total_minutes||0} min`),
        el('button',{className:'btn btn-sm btn-ghost',style:{marginTop:'8px'},onClick:async(e)=>{e.stopPropagation();try{await API.post('/api/friends/remove',{userId:state.user.id,friendId:f.id});toast('Amigo removido');renderApp();}catch(err){toast('Erro','error');}}},'Remover')))));
    } else {
      s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-icon'},'👥'),el('div',{className:'empty-state-text'},'Nenhum amigo ainda. Adicione outros estudantes!')));
    }
  } catch(e) { s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-text'},'Erro ao carregar amigos'))); }
  return s;
}

function renderAddFriendModal() {
  let results = [];
  return [el('h2',{className:'modal-title'},'➕ Adicionar Amigo'),
    el('input',{className:'input',placeholder:'Digite o nome do usuário...',id:'friend-search-input',style:{marginBottom:'8px'},onInput:async(e)=>{
      const q = e.target.value.trim();
      if (q.length < 2) { results = []; $('friend-results').innerHTML = ''; return; }
      try {
        const search = await API.get(`/api/search?q=${encodeURIComponent(q)}`);
        results = search.users.filter(u => u.id !== state.user.id);
        const container = $('friend-results');
        container.innerHTML = '';
        results.forEach(u => container.appendChild(el('div',{className:'session-item',style:{cursor:'pointer'},onClick:async()=>{try{await API.post('/api/friends/add',{userId:state.user.id,friendId:u.id});toast(`Solicitação enviada para ${u.name}!`);closeModal();renderApp();}catch(e){toast(e.message||'Erro','error');}}},el('span',{},`${u.avatar||'🙂'} ${u.name}`),el('span',{style:{fontSize:'0.85rem',color:'var(--text-secondary)'}},`Nv ${u.level}`))));
      } catch(e) {}
    }}),
    el('div',{id:'friend-results'}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar'))];
}

async function showUserProfile(userId) {
  try {
    const u = await API.get(`/api/users/${userId}`);
    if (!u) return toast('Usuário não encontrado','error');
    openModal(renderPublicProfileModal(u));
  } catch(e) { toast('Erro ao carregar perfil','error'); }
}

function renderPublicProfileModal(u) {
  return [el('h2',{className:'modal-title'},`${u.avatar||'🙂'} ${u.name}`),
    el('div',{style:{marginBottom:'16px'}},
      el('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}},
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Nível'),el('div',{style:{fontWeight:600}},u.level)),
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'XP'),el('div',{style:{fontWeight:600}},u.xp)),
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Moedas'),el('div',{style:{fontWeight:600}},`🪙 ${u.coins}`)),
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Streak'),el('div',{style:{fontWeight:600}},`🔥 ${u.streak} dias`)),
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Tempo total'),el('div',{style:{fontWeight:600}},fmt(u.total_minutes))),
        el('div',{},el('div',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},'Melhor dia'),el('div',{style:{fontWeight:600}},u.best_day||'-'))),
      u.bio ? el('p',{style:{marginTop:'12px',fontSize:'0.9rem',color:'var(--text-secondary)'}},u.bio) : null),
    el('div',{className:'modal-actions'},
      el('button',{className:'btn btn-primary',onClick:async()=>{try{await API.post('/api/friends/add',{userId:state.user.id,friendId:u.id});toast(`Solicitação enviada!`);closeModal();}catch(e){toast(e.message||'Erro','error');}}},'➕ Adicionar Amigo'),
      el('button',{className:'btn btn-ghost',onClick:closeModal},'Fechar'))];
}

/* ==================== STUDY GOALS ==================== */
async function renderGoals() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🎯 Metas de Estudo'),el('p',{className:'section-desc'},'Defina metas diárias e semanais.'))));
  try {
    const [goals, subjects] = await Promise.all([
      API.get(`/api/goals/${state.user.id}`),
      API.get(`/api/subjects/${state.user.id}`)
    ]);
    const u = state.user;
    const dailyPct = Math.min(100, Math.round((u.weekly_minutes / (goals.daily_minutes || 120)) * 100));
    const weeklyPct = Math.min(100, Math.round((u.total_minutes / (goals.weekly_minutes || 600)) * 100));
     s.appendChild(el('div',{className:'goals-grid'},
      el('div',{className:'goal-card'},
        el('div',{className:'goal-icon'},'📅'),
        el('div',{className:'goal-label'},'Meta Diária'),
        el('div',{className:'goal-value'},`${fmt(u.weekly_minutes)} / ${fmt(goals.daily_minutes||120)}`),
        el('div',{className:'progress-bar',style:{marginTop:'8px'}},el('div',{className:'progress-fill',style:{width:`${dailyPct}%`}}))),
      el('div',{className:'goal-card'},
        el('div',{className:'goal-icon'},'📆'),
        el('div',{className:'goal-label'},'Meta Semanal'),
        el('div',{className:'goal-value'},`${fmt(u.total_minutes)} / ${fmt(goals.weekly_minutes||600)}`),
        el('div',{className:'progress-bar',style:{marginTop:'8px'}},el('div',{className:'progress-fill',style:{width:`${weeklyPct}%`}})))));

    if (subjects.length) {
      const maxMin = Math.max(...subjects.map(s=>s.minutes), 1);
      s.appendChild(el('div',{className:'card',style:{marginTop:'16px'}},
        el('div',{className:'card-title',style:{marginBottom:'12px'}},'📊 Tempo por Matéria'),
        el('div',{className:'subject-list'},...subjects.map(sub=>el('div',{className:'subject-bar'},
          el('span',{style:{fontWeight:500,minWidth:'100px'}},sub.subject),
          el('div',{className:'progress-bar',style:{flex:1}},el('div',{className:'progress-fill',style:{width:`${(sub.minutes/maxMin)*100}%`}})),
          el('span',{style:{fontSize:'0.85rem',color:'var(--text-muted)',minWidth:'60px',textAlign:'right'}},fmt(sub.minutes)))))));
    }
    s.appendChild(el('div',{className:'admin-section',style:{marginTop:'16px'}},
      el('div',{className:'admin-section-title'},'⚙️ Ajustar Metas'),
      el('div',{className:'admin-form'},
        el('div',{},el('label',{},'Minutos diários'),el('input',{className:'input',type:'number',id:'goal-daily',value:goals.daily_minutes||120})),
        el('div',{},el('label',{},'Minutos semanais'),el('input',{className:'input',type:'number',id:'goal-weekly',value:goals.weekly_minutes||600})),
        el('button',{className:'btn btn-primary',onClick:async()=>{try{await API.put(`/api/goals/${state.user.id}`,{daily_minutes:Number($('goal-daily')?.value)||120,weekly_minutes:Number($('goal-weekly')?.value)||600});toast('Metas salvas!');renderApp();}catch(e){toast('Erro','error');}}},'💾 Salvar Metas'))));
  } catch(e) { s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-text'},'Erro ao carregar metas'))); }
  return s;
}

/* ==================== NOTIFICATIONS ==================== */
async function renderNotifications() {
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🔔 Central de Notificações'),el('p',{className:'section-desc'},'Histórico de eventos e conquistas.')),
    el('button',{className:'btn btn-secondary',onClick:async()=>{try{await API.post(`/api/notifications/read-all/${state.user.id}`);renderApp();}catch(e){}}},'✅ Marcar todas lidas')));
  try {
    const notifs = await API.get(`/api/notifications/${state.user.id}`);
    if (!notifs.length) {
      s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-icon'},'🔔'),el('div',{className:'empty-state-text'},'Nenhuma notificação ainda.')));
    } else {
      const list = el('div',{className:'notif-list'});
      for (const n of notifs) {
        const icons = {conquista:'🏆',friend:'👥',sessao:'📚',compra:'🛍️'};
        list.appendChild(el('div',{className:`notif-item${n.read?'':' notif-unread'}`,onClick:async()=>{if(!n.read){try{await API.post(`/api/notifications/read/${n.id}`);renderApp();}catch(e){}}}},
          el('span',{style:{fontSize:'1.2rem'}},icons[n.type]||'📌'),
          el('div',{style:{flex:1}},el('div',{style:{fontWeight:n.read?400:600}},n.message),el('div',{style:{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'2px'}},new Date(n.created_at).toLocaleString('pt-BR'))),
          !n.read ? el('span',{className:'notif-dot'}) : null));
      }
      s.appendChild(list);
    }
  } catch(e) { s.appendChild(el('div',{className:'empty-state'},el('div',{className:'empty-state-text'},'Erro ao carregar notificações'))); }
  return s;
}

/* ==================== EXPORT ==================== */
async function exportUserData() {
  try {
    const data = await API.get(`/api/export/${state.user.id}`);
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `eav-${state.user.name}-data.json`; a.click();
    URL.revokeObjectURL(url);
    toast('📦 Dados exportados!');
  } catch(e) { toast('Erro ao exportar','error'); }
}

/* ==================== ADMIN ==================== */
function renderAdmin() {
  if (!state._adminAuth) {
    const s = el('div',{className:'section'});
    s.appendChild(el('div',{className:'card',style:{maxWidth:'400px',margin:'40px auto'}},
      el('h2',{className:'modal-title'},'🔐 Painel Admin'),el('p',{className:'modal-desc'},'Digite a senha de administrador.'),
      el('input',{className:'input',type:'password',placeholder:'Senha',id:'admin-password',onKeydown:e=>{if(e.key==='Enter')adminAuth();}}),
      el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:adminAuth},'Entrar'),el('button',{className:'btn btn-ghost',onClick:()=>showSection('dashboard')},'Voltar')),
      el('p',{style:{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:'12px'}},'Senha: assembleia')));
    return s;
  }
  const s = el('div',{className:'section'});
  s.appendChild(el('div',{className:'section-header'},
    el('div',{},el('h2',{className:'section-title'},'🔧 Admin'),el('p',{className:'section-desc'},'Controle total da plataforma.')),
    el('button',{className:'btn btn-ghost',onClick:()=>{state._adminAuth=false;showSection('dashboard');}},'🔒 Sair')));
  const totalMin = CACHE.users.reduce((s,u)=>s+u.total_minutes,0);
  const totalCoins = CACHE.users.reduce((s,u)=>s+u.coins,0);
  s.appendChild(el('div',{className:'admin-insights'},
    el('div',{className:'admin-stat'},el('div',{className:'admin-stat-value'},CACHE.users.length),el('div',{className:'admin-stat-label'},'👥 Usuários')),
    el('div',{className:'admin-stat'},el('div',{className:'admin-stat-value'},Math.round(totalMin/60)),el('div',{className:'admin-stat-label'},'📚 Horas totais')),
    el('div',{className:'admin-stat'},el('div',{className:'admin-stat-value'},totalCoins),el('div',{className:'admin-stat-label'},'🪙 Moedas')),
    el('div',{className:'admin-stat'},el('div',{className:'admin-stat-value'},CACHE.events.filter(e=>e.active).length),el('div',{className:'admin-stat-label'},'🎪 Eventos Ativos'))));

  const tabs = ['settings','users','store','missions','events','achievements','site','actions'];
  const tabLabels = {'settings':'⚙️','users':'👥','store':'📦','missions':'🎯','events':'🎪','achievements':'🏅','site':'🎨','actions':'💰'};
  s.appendChild(el('div',{className:'chip-group',style:{marginBottom:'20px'}},...tabs.map(t=>el('button',{className:`chip${state._adminTab===t?' active':''}`,onClick:()=>{state._adminTab=t;renderApp();}},`${tabLabels[t]} ${t.charAt(0).toUpperCase()+t.slice(1)}`))));

  const content = el('div',{className:'admin-tab-content'});
  const T = state._adminTab;

  if (T==='settings') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'⚙️ Configuração de Jogo'),
      el('div',{className:'admin-form'},
        el('div',{},el('label',{},'XP por minuto'),el('input',{className:'input',type:'number',id:'admin-xp',value:state.settings.xpPerMinute||'12'})),
        el('div',{},el('label',{},'Moedas por minuto'),el('input',{className:'input',type:'number',id:'admin-coins-rate',value:state.settings.coinPerMinute||'5'})),
        el('div',{},el('label',{},'Multiplicador de Streak'),el('input',{className:'input',type:'number',step:'0.1',id:'admin-streak',value:state.settings.streakMultiplier||'1.2'})),
        el('div',{},el('label',{},'Boost Global'),el('select',{className:'select',id:'admin-boost'},el('option',{value:'none'},'Nenhum'),el('option',{value:'doubleXp'},'XP x2'),el('option',{value:'coinRain'},'Chuva de moedas'),el('option',{value:'casinoNight'},'Cassino'))),
        el('button',{className:'btn btn-primary',onClick:async()=>{try{await API.put('/api/settings',{xpPerMinute:$('admin-xp')?.value,coinPerMinute:$('admin-coins-rate')?.value,streakMultiplier:$('admin-streak')?.value,boost:$('admin-boost')?.value});toast('Configurações salvas!');await loadCache();}catch(e){toast('Erro','error');}}},'💾 Salvar'))));
  }

  if (T==='users') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'👥 Usuários'),
      el('div',{className:'session-list',style:{maxHeight:'400px',overflowY:'auto'}},...CACHE.users.map(u=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},`${u.avatar||'🙂'} ${u.name}`),el('span',{},`Nv ${u.level} | ${u.coins} 🪙`),el('button',{className:'btn btn-sm btn-danger',onClick:()=>banUser(u)},'Banir'))))));
  }

  if (T==='store') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'📦 Itens da Loja'),
      el('div',{className:'session-list',style:{marginBottom:'12px',maxHeight:'300px',overflowY:'auto'}},...CACHE.store.map(i=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},i.name),rarityBadge(i.rarity),el('span',{},`${i.price} 🪙`),el('button',{className:'btn btn-sm btn-secondary',onClick:()=>removeStoreItem(i)},'Remover')))),
      el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderAddStoreModal())},'+ Adicionar Item')));
  }

  if (T==='missions') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'🎯 Missões'),
      el('div',{className:'session-list',style:{marginBottom:'12px',maxHeight:'300px',overflowY:'auto'}},...CACHE.missions.map(m=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},m.name),el('span',{},`${m.reward_coins} 🪙 / ${m.reward_xp} XP`),el('span',{className:`badge ${m.active?'badge-success':'badge-danger'}`},m.active?'Ativa':'Inativa'),el('button',{className:'btn btn-sm btn-secondary',onClick:()=>removeMission(m)},'Remover')))),
      el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderAddMissionModal())},'+ Adicionar Missão')));
  }

  if (T==='events') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'🎪 Eventos'),
      el('div',{className:'session-list',style:{marginBottom:'12px'}},...CACHE.events.map(e=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},e.name),el('span',{className:`badge ${e.active?'badge-success':'badge-danger'}`},e.active?'Ativo':'Inativo'),el('span',{style:{fontSize:'0.8rem',color:'var(--text-muted)'}},e.expires),el('button',{className:'btn btn-sm btn-secondary',onClick:async()=>{try{await API.put(`/api/admin/events/${e.id}`);await loadCache();renderApp();toast('Evento alternado');}catch(err){toast('Erro','error');}}},'Toggle'),el('button',{className:'btn btn-sm btn-danger',onClick:()=>removeEvent(e)},'✕')))),
      el('button',{className:'btn btn-secondary',onClick:()=>openModal(renderAddEventModal())},'+ Adicionar Evento')));
  }

  if (T==='achievements') {
    content.appendChild(renderAdminAchievements());
  }

  if (T==='site') {
    content.appendChild(renderAdminSiteCustomization());
  }

  if (T==='actions') {
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'💰 Conceder Moedas / XP'),
      el('div',{className:'admin-form'},
        el('div',{},el('label',{},'Usuário'),el('select',{className:'select',id:'admin-user-select'},...CACHE.users.map(u=>el('option',{value:u.id},u.name)))),
        el('div',{className:'admin-form-row'},el('div',{style:{flex:1}},el('label',{},'Moedas'),el('input',{className:'input',type:'number',id:'admin-coins-amount'},el('button',{className:'btn btn-success',onClick:()=>adminGrant('coins'),style:{marginTop:'20px'}},'Dar 🪙')))),
        el('div',{className:'admin-form-row'},el('div',{style:{flex:1}},el('label',{},'XP'),el('input',{className:'input',type:'number',id:'admin-xp-amount'}),el('button',{className:'btn btn-success',onClick:()=>adminGrant('xp'),style:{marginTop:'20px'}},'Dar XP'))))));
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'⏱ Avançar Sessão (teste)'),
      el('div',{className:'admin-form'},
        el('div',{},el('label',{},'Usuário'),el('select',{className:'select',id:'admin-session-user'},...CACHE.users.map(u=>el('option',{value:u.id},u.name)))),
        el('div',{},el('label',{},'Minutos'),el('input',{className:'input',type:'number',id:'admin-session-minutes',value:'30',min:'1'})),
        el('button',{className:'btn btn-primary',onClick:async()=>{const uid=$('admin-session-user')?.value;const mins=Number($('admin-session-minutes')?.value);if(!uid||!mins)return toast('Preencha','error');try{const r=await API.post('/api/admin/sessions/advance',{userId:uid,minutes:mins});toast(`✅ +${r.xpGain} XP, +${r.coinGain} 🪙`);await loadCache();renderApp();}catch(e){toast('Erro','error');}}},'▶ Avançar'))));
    content.appendChild(el('div',{className:'admin-section'},
      el('div',{className:'admin-section-title'},'🔄 Ações Gerais'),
      el('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
        el('button',{className:'btn btn-danger',onClick:async()=>{if(!confirm('Resetar temporada?'))return;try{await API.post('/api/admin/reset-season');toast('🔄 Temporada resetada');await loadCache();renderApp();}catch(e){toast('Erro','error');}}},'🔄 Resetar Temporada'),
        el('button',{className:'btn btn-secondary',onClick:async()=>{await loadCache();renderApp();toast('✅ Cache recarregado');}},'📥 Recarregar Cache'))));
  }

  s.appendChild(content);
  return s;
}

function renderAdminAchievements() {
  return el('div',{className:'admin-section'},
    el('div',{className:'admin-section-title'},'🏅 Conquistas'),
    el('div',{className:'session-list',style:{marginBottom:'12px',maxHeight:'300px',overflowY:'auto'}},...CACHE.achievements.map(a=>el('div',{className:'session-item'},el('span',{style:{fontWeight:600}},a.name),el('span',{style:{fontSize:'0.8rem',color:'var(--text-secondary)'}},a.description),rarityBadge(a.rarity),el('div',{style:{display:'flex',gap:'4px'}},el('button',{className:'btn btn-sm btn-secondary',onClick:()=>{state._editingAchievement=a;openModal(renderAddEditAchievementModal(a));}},'✏️'),el('button',{className:'btn btn-sm btn-danger',onClick:()=>removeAchievement(a)},'✕'))))),
    state._editingAchievement ? null : el('button',{className:'btn btn-secondary',onClick:()=>{state._editingAchievement=null;openModal(renderAddEditAchievementModal());}},'+ Adicionar Conquista'));
}

function renderAddEditAchievementModal(ach) {
  const editing = !!ach;
  return [el('h2',{className:'modal-title'},editing?'Editar Conquista':'Nova Conquista'),
    el('input',{className:'input',placeholder:'Nome',id:'adm-ach-name',value:ach?.name||'',style:{marginBottom:'8px'}}),
    el('input',{className:'input',placeholder:'Descrição',id:'adm-ach-desc',value:ach?.description||'',style:{marginBottom:'8px'}}),
    el('select',{className:'select',id:'adm-ach-rarity',style:{marginBottom:'8px'}},
      ...['Comum','Raro','Épico','Lendário'].map(r=>el('option',{value:r,selected:(ach?.rarity||'')===r},r))),
    el('div',{className:'modal-actions'},
      el('button',{className:'btn btn-primary',onClick:async()=>{const n=$('adm-ach-name')?.value,d=$('adm-ach-desc')?.value,r=$('adm-ach-rarity')?.value;if(!n)return toast('Nome obrigatório','error');try{if(editing){await API.put(`/api/admin/achievements/${ach.id}`,{name:n,description:d,rarity:r});toast('Conquista atualizada!');}else{await API.post('/api/admin/achievements',{name:n,description:d,rarity:r});toast('Conquista criada!');}closeModal();state._editingAchievement=null;await loadCache();renderApp();}catch(e){toast('Erro','error');}}},editing?'Salvar':'Criar'),
      el('button',{className:'btn btn-ghost',onClick:()=>{state._editingAchievement=null;closeModal();}},'Cancelar'))];
}

function renderAdminSiteCustomization() {
  const imgLogo = state.settings.img_logo || '';
  const imgBanner = state.settings.img_banner || '';
  const imgLanding = state.settings.img_landing || '';
  const siteName = state.settings.siteName || 'EAV';
  const siteDesc = state.settings.siteDescription || '';
  const sec = (title, ...children) => el('div',{className:'admin-section'},el('div',{className:'admin-section-title'},title),...children);
  const fld = (label, ...children) => el('div',{},el('label',{},label),...children);
  const previewImg = (src, style) => src ? el('img',{src,style}) : null;
  const fileRow = (label, type, imgSrc) => fld(label,
    previewImg(imgSrc, {width:'100%',maxHeight:'120px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px',background:'var(--bg-secondary)'}),
    el('input',{className:'input',type:'file',id:`adm-img-${type}`,accept:'image/*'}),
    el('button',{className:'btn btn-secondary',onClick:()=>uploadAdminImage(type)},'🏞️ Upload'));
  return el('div',{},
    sec('🎨 Personalização do Site',
      el('div',{className:'admin-form'},
        fld('Nome do Site',el('input',{className:'input',id:'adm-site-name',value:siteName})),
        fld('Descrição',el('textarea',{className:'input',id:'adm-site-desc',style:{resize:'vertical',minHeight:'60px'}},siteDesc)),
        el('button',{className:'btn btn-primary',onClick:async()=>{try{await API.put('/api/admin/site-settings',{siteName:$('adm-site-name')?.value,siteDescription:$('adm-site-desc')?.value});toast('Site atualizado!');await loadCache();renderApp();}catch(e){toast('Erro','error');}}},'💾 Salvar Informações'))),
    sec('🖼️ Imagens do Site',
      el('div',{className:'admin-form'},
        fld('Logo',previewImg(imgLogo,{width:'80px',height:'80px',objectFit:'contain',borderRadius:'8px',marginBottom:'8px',background:'var(--bg-secondary)'}),el('input',{className:'input',type:'file',id:'adm-img-logo',accept:'image/*'}),el('button',{className:'btn btn-secondary',onClick:()=>uploadAdminImage('logo')},'🏞️ Upload Logo')),
        fld('Banner',previewImg(imgBanner,{width:'100%',maxHeight:'120px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px'}),el('input',{className:'input',type:'file',id:'adm-img-banner',accept:'image/*'}),el('button',{className:'btn btn-secondary',onClick:()=>uploadAdminImage('banner')},'🏞️ Upload Banner')),
        fld('Imagem Landing',previewImg(imgLanding,{width:'100%',maxHeight:'120px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px'}),el('input',{className:'input',type:'file',id:'adm-img-landing',accept:'image/*'}),el('button',{className:'btn btn-secondary',onClick:()=>uploadAdminImage('landing')},'🏞️ Upload')))),
    sec('🔐 Supabase',
      el('p',{style:{fontSize:'0.85rem',color:'var(--text-secondary)',marginBottom:'12px'}},'Supabase conectado via anon key. Para funcionamento completo, execute o SQL em supabase-migration.sql no dashboard do Supabase (SQL Editor) para criar a tabela profiles e o bucket de storage.'),
      el('div',{className:'admin-form'},
        fld('Status',el('span',{style:{fontWeight:600,color:hasSB()?'var(--success)':'var(--danger)'}},hasSB()?'✅ Conectado':'❌ Não configurado')),
        fld('Registros',el('span',{},`${CACHE.users.length} usuários`)))));
}

async function uploadAdminImage(type) {
  const fileInput = $(`adm-img-${type}`);
  const file = fileInput?.files?.[0];
  if (!file) return toast('Selecione um arquivo', 'error');
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      const r = await API.post('/api/admin/upload-base64', { dataUrl, type });
      toast(`✅ Imagem ${type} enviada!`);
      state.settings[`img_${type}`] = r.url;
      await loadCache();
      renderApp();
    } catch(err) { toast(err.message || 'Erro no upload', 'error'); }
  };
  reader.readAsDataURL(file);
}

function adminAuth() {
  const pwd = $('admin-password')?.value;
  if (pwd==='admin123'||pwd===state.settings.adminPassword) { state._adminAuth=true; toast('✅ Acesso concedido'); renderApp(); }
  else toast('Senha incorreta','error');
}
async function adminGrant(type) {
  const uid = $('admin-user-select')?.value;
  const amt = Number(type==='coins'?$('admin-coins-amount')?.value:$('admin-xp-amount')?.value);
  if (!uid||!amt) return toast('Preencha os campos','error');
  try { await API.post(`/api/admin/${type}`,{userId:uid,amount:amt}); toast(`✅ ${amt} ${type==='coins'?'moedas':'XP'} adicionados`); await loadCache(); renderApp(); }
  catch(e) { toast('Erro','error'); }
}
async function banUser(u) { if (!confirm(`Banir ${u.name}?`)) return; try { await API.del(`/api/admin/users/${u.id}`); toast(`${u.name} banido`); await loadCache(); renderApp(); } catch(e) { toast('Erro','error'); } }
async function removeStoreItem(i) { try { await API.del(`/api/admin/store/${i.id}`); toast('Item removido'); await loadCache(); renderApp(); } catch(e) { toast('Erro','error'); } }
async function removeMission(m) { try { await API.del(`/api/admin/missions/${m.id}`); toast('Missão removida'); await loadCache(); renderApp(); } catch(e) { toast('Erro','error'); } }
async function removeEvent(e) { try { await API.del(`/api/admin/events/${e.id}`); toast('Evento removido'); await loadCache(); renderApp(); } catch(err) { toast('Erro','error'); } }
async function removeAchievement(a) { try { await API.del(`/api/admin/achievements/${a.id}`); toast('Conquista removida'); await loadCache(); renderApp(); } catch(e) { toast('Erro','error'); } }
function renderAddStoreModal() {
  const TEMPLATES = [
    { type:'theme', label:'🎨 Tema', idPrefix:'tema-', namePrefix:'Tema ',
      variants:[{id:'neon',name:'Neon',desc:'Fundo neon brilhante',rarity:'Épico',price:800},
                {id:'galaxia',name:'Galáxia',desc:'Fundo galáctico',rarity:'Épico',price:1100},
                {id:'dragao',name:'Dragão',desc:'Fundo de dragão',rarity:'Épico',price:1300},
                {id:'noite',name:'Noite',desc:'Fundo noturno estrelado',rarity:'Raro',price:700},
                {id:'floresta',name:'Floresta',desc:'Fundo de floresta mística',rarity:'Raro',price:750}] },
    { type:'border', label:'🖼 Moldura', idPrefix:'borda-', namePrefix:'Moldura ',
      variants:[{id:'guardiao',name:'Guardião',desc:'Proteção dos guardiões',rarity:'Raro',price:420},
                {id:'neon',name:'Neon',desc:'Brilho neon no avatar',rarity:'Raro',price:600},
                {id:'lendaria',name:'Lendária',desc:'Moldura lendária dourada',rarity:'Lendário',price:1500},
                {id:'arco-iris',name:'Arco-Íris',desc:'Cores do arco-íris animadas',rarity:'Épico',price:1200},
                {id:'cristal',name:'Cristal',desc:'Brilho de cristal gelado',rarity:'Raro',price:550},
                {id:'fogo',name:'Fogo',desc:'Chamas envolta do avatar',rarity:'Épico',price:1000}] },
    { type:'badge', label:'🏅 Badge', idPrefix:'badge-', namePrefix:'Badge ',
      variants:[{id:'ouro',name:'Ouro',desc:'Badge dourada de elite',rarity:'Épico',price:500},
                {id:'prata',name:'Prata',desc:'Badge prateada',rarity:'Raro',price:300},
                {id:'bronze',name:'Bronze',desc:'Badge de bronze',rarity:'Comum',price:150},
                {id:'diamante',name:'Diamante',desc:'Badge de diamante raro',rarity:'Lendário',price:1000},
                {id:'platina',name:'Platina',desc:'Badge platina exclusiva',rarity:'Épico',price:700}] },
    { type:'effect', label:'✨ Efeito', idPrefix:'efeito-', namePrefix:'Efeito ',
      variants:[{id:'glow',name:'Glow',desc:'Efeito brilhante',rarity:'Raro',price:670},
                {id:'neon-rose',name:'Neon Rosa',desc:'Brilho neon rosa',rarity:'Raro',price:500},
                {id:'neon-cyan',name:'Neon Ciano',desc:'Brilho neon ciano',rarity:'Raro',price:500},
                {id:'neon-gold',name:'Neon Dourado',desc:'Brilho neon dourado',rarity:'Épico',price:900},
                {id:'particulas',name:'Partículas Mágicas',desc:'Partículas flutuantes',rarity:'Lendário',price:1400},
                {id:'aura-fogo',name:'Aura de Fogo',desc:'Aura de chamas',rarity:'Lendário',price:1600}] },
    { type:'title', label:'📛 Título', idPrefix:'titulo-', namePrefix:'Título ',
      variants:[{id:'lendario',name:'Lendário',desc:'Título lendário',rarity:'Lendário',price:1200},
                {id:'epico',name:'Épico',desc:'Título épico',rarity:'Épico',price:800},
                {id:'heroi',name:'Herói',desc:'Título de herói',rarity:'Raro',price:450}] },
    { type:'boost', label:'⚡ Boost', idPrefix:'boost-', namePrefix:'Boost de ',
      variants:[{id:'xp',name:'XP',desc:'Multiplicador de XP por 30min',rarity:'Raro',price:550},
                {id:'coins',name:'Moedas',desc:'Multiplicador de moedas por 30min',rarity:'Raro',price:550}] },
    { type:'utility', label:'🔧 Utilitário', idPrefix:'utilitario-', namePrefix:'',
      variants:[{id:'freeze-streak',name:'Freeze de Streak',desc:'Preserva seu streak por 1 dia',rarity:'Comum',price:380}] },
    { type:'pet', label:'🐾 Mascote', idPrefix:'mascote-', namePrefix:'Mascote ',
      variants:[{id:'fenix',name:'Fênix',desc:'Mascote fênix renascida',rarity:'Épico',price:980},
                {id:'dragao',name:'Dragão',desc:'Mascote dragão ancião',rarity:'Épico',price:1100},
                {id:'lobo',name:'Lobo',desc:'Mascote lobo selvagem',rarity:'Raro',price:650},
                {id:'coruja',name:'Coruja',desc:'Mascote coruja sábia',rarity:'Raro',price:600}] }
  ];
  if (!state._stTplCat) state._stTplCat = null;
  if (!state._stTplVar) state._stTplVar = null;

  const cats = el('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'12px'}});
  for (const t of TEMPLATES) cats.appendChild(el('button',{className:`chip${state._stTplCat===t.type?' active':''}`,style:{fontSize:'0.85rem'},onClick:()=>{state._stTplCat=t.type;state._stTplVar=null;closeModal();openModal(renderAddStoreModal());}},t.label));

  const preview = el('div',{style:{minHeight:'120px'}});
  let selectedCat = TEMPLATES.find(t=>t.type===state._stTplCat);
  if (!selectedCat) {
    preview.appendChild(el('p',{style:{color:'var(--text-muted)',fontSize:'0.9rem'}},'Selecione um tipo de item acima para começar.'));
  } else {
    const vars = el('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'12px'}});
    for (const v of selectedCat.variants) {
      const isSel = state._stTplVar && state._stTplVar.id===v.id;
      vars.appendChild(el('button',{className:`chip${isSel?' active':''}`,style:{fontSize:'0.85rem'},onClick:()=>{state._stTplVar=v;closeModal();openModal(renderAddStoreModal());}},v.name));
    }
    preview.appendChild(el('div',{style:{fontWeight:600,fontSize:'0.85rem',color:'var(--text-secondary)',marginBottom:'4px'}},'Variação:'));
    preview.appendChild(vars);

    if (state._stTplVar) {
      const v = state._stTplVar;
      const finalName = selectedCat.namePrefix + v.name;
      const finalId = selectedCat.idPrefix + v.id;
      preview.appendChild(el('div',{style:{background:'var(--glass)',border:'1px solid var(--glass-border)',borderRadius:'12px',padding:'12px',marginTop:'8px'}},
        el('div',{style:{fontSize:'0.9rem',fontWeight:600,marginBottom:'8px'}},'📋 Configuração'),
        el('div',{className:'admin-form'},
          el('div',{},el('label',{},'Nome'),el('input',{className:'input',id:'adm-item-name',value:finalName})),
          el('div',{style:{display:'flex',gap:'8px'}},
            el('div',{style:{flex:1}},el('label',{},'Preço'),el('input',{className:'input',type:'number',id:'adm-item-price',value:String(v.price)})),
            el('div',{style:{flex:1}},el('label',{},'Raridade'),el('select',{className:'select',id:'adm-item-rarity'},
              ['Comum','Raro','Épico','Lendário'].map(r=>el('option',{value:r,selected:r===v.rarity},r))))),
          el('div',{},el('label',{},'Descrição'),el('input',{className:'input',id:'adm-item-desc',value:v.desc})),
          el('div',{className:'modal-actions',style:{marginTop:'12px'}},
            el('button',{className:'btn btn-primary',onClick:async()=>{
              const n=$('adm-item-name')?.value||finalName;
              const p=Number($('adm-item-price')?.value)||v.price;
              const r=$('adm-item-rarity')?.value||v.rarity;
              const d=$('adm-item-desc')?.value||v.desc;
              try{
                await API.post('/api/admin/store',{name:n,price:p,rarity:r,description:d,type:selectedCat.type,id:finalId});
                state._stTplCat=null;state._stTplVar=null;
                closeModal();toast('✅ Item criado!');await loadCache();renderApp();
              }catch(e){toast('Erro ao criar item','error');}
            }},'✅ Criar Item'),
            el('button',{className:'btn btn-ghost',onClick:()=>{state._stTplCat=null;state._stTplVar=null;closeModal();}},'Cancelar')))));
    }
  }

  return [el('h2',{className:'modal-title'},'📦 Novo Item na Loja'),
    el('p',{className:'modal-desc'},'Escolha o tipo e a variação para criar um item funcional.'),
    cats, preview];
}
function renderAddMissionModal() {
  return [el('h2',{className:'modal-title'},'Adicionar Missão'),el('div',{className:'admin-form'},
    el('input',{className:'input',placeholder:'Nome',id:'adm-mission-name'}),el('select',{className:'select',id:'adm-mission-type'},el('option',{value:'daily'},'Diária'),el('option',{value:'weekly'},'Semanal')),
    el('input',{className:'input',type:'number',placeholder:'Meta',id:'adm-mission-target'}),el('input',{className:'input',type:'number',placeholder:'XP',id:'adm-mission-xp'}),
    el('input',{className:'input',type:'number',placeholder:'Moedas',id:'adm-mission-coins'}),el('input',{className:'input',placeholder:'Título',id:'adm-mission-title'}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:async()=>{const n=$('adm-mission-name')?.value,t=$('adm-mission-type')?.value,tg=Number($('adm-mission-target')?.value);if(!n||!tg)return toast('Nome e meta obrigatórios','error');try{await API.post('/api/admin/missions',{name:n,type:t,target:tg,rewardXp:Number($('adm-mission-xp')?.value),rewardCoins:Number($('adm-mission-coins')?.value),rewardTitle:$('adm-mission-title')?.value});closeModal();toast('Missão adicionada!');await loadCache();renderApp();}catch(e){toast('Erro','error');}}},'Adicionar'),el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar')))];
}
function renderAddEventModal() {
  return [el('h2',{className:'modal-title'},'Adicionar Evento'),el('div',{className:'admin-form'},
    el('input',{className:'input',placeholder:'Nome',id:'adm-event-name'}),el('input',{className:'input',placeholder:'Descrição',id:'adm-event-desc'}),
    el('div',{className:'modal-actions'},el('button',{className:'btn btn-primary',onClick:async()=>{const n=$('adm-event-name')?.value;if(!n)return toast('Nome obrigatório','error');try{await API.post('/api/admin/events',{name:n,description:$('adm-event-desc')?.value});closeModal();toast('Evento adicionado!');await loadCache();renderApp();}catch(e){toast('Erro','error');}}},'Adicionar'),el('button',{className:'btn btn-ghost',onClick:closeModal},'Cancelar')))];
}

/* ==================== INIT ==================== */
async function init() {
  const stored = localStorage.getItem('eavUser');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.id) {
        state.user = parsed;
        state.section = 'dashboard';
      }
    } catch(e) {}
  }
  if (state.user && IS_SERVER) {
    try {
      const fresh = await API.get(`/api/users/${state.user.id}`);
      if (fresh && fresh.id) state.user = fresh;
      else state.user = null;
    } catch(e) { state.user = null; }
  }
  await loadCache();
  renderApp();
  if (!IS_SERVER) {
    const banner = el('div', { style: { position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)', background:'var(--bg-elevated)', border:'1px solid var(--warning)', borderRadius:'var(--radius-lg)', padding:'10px 20px', fontSize:'0.85rem', color:'var(--warning)', zIndex:100, textAlign:'center' } },
      '⚡ Modo local — execute npm start para o backend completo');
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
  }
}

init();
