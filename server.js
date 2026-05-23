const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'eav.db');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

let db;

/* ───── Supabase Client ───── */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;
const sbKey = supabaseServiceKey || supabaseAnonKey;
if (supabaseUrl && sbKey) {
  supabase = createClient(supabaseUrl, sbKey);
  console.log(`Supabase connected (mode: ${supabaseServiceKey ? 'service' : 'anon'})`);
}
function sb() { return supabase; }
function hasSB() { return supabase !== null; }

/* ───── Multer for local fallback uploads ───── */
const upload = multer({ dest: path.join(__dirname, 'uploads') });
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));

function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (stmt.step()) return stmt.getAsObject().value;
  stmt.free();
  return null;
}

function updateSetting(key, value) {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  saveDB();
}

function getUser(userId) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  stmt.bind([userId]);
  if (stmt.step()) { const u = stmt.getAsObject(); stmt.free(); return u; }
  stmt.free();
  return null;
}

function getUserFull(userId) {
  const user = getUser(userId);
  if (!user) return null;

  const titles = [];
  const tStmt = db.prepare('SELECT title FROM user_titles WHERE user_id = ?');
  tStmt.bind([userId]);
  while (tStmt.step()) titles.push(tStmt.getAsObject().title);
  tStmt.free();

  const achievements = [];
  const aStmt = db.prepare('SELECT a.* FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ?');
  aStmt.bind([userId]);
  while (aStmt.step()) achievements.push(aStmt.getAsObject());
  aStmt.free();

  const inventory = [];
  const iStmt = db.prepare('SELECT item_name FROM user_inventory WHERE user_id = ?');
  iStmt.bind([userId]);
  while (iStmt.step()) inventory.push(iStmt.getAsObject().item_name);
  iStmt.free();

  const sessions = [];
  const sStmt = db.prepare('SELECT * FROM session_history WHERE user_id = ? ORDER BY date DESC LIMIT 20');
  sStmt.bind([userId]);
  while (sStmt.step()) sessions.push(sStmt.getAsObject());
  sStmt.free();

  const effects = [];
  const eStmt = db.prepare('SELECT effect_type, effect_value FROM user_effects WHERE user_id = ?');
  eStmt.bind([userId]);
  while (eStmt.step()) effects.push(eStmt.getAsObject());
  eStmt.free();

  const result = { ...user, titles, achievements, inventory, sessionHistory: sessions, effects };
  delete result.password_hash;
  return result;
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function all(stmt) {
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function one(stmt) {
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function initDB() {
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, avatar TEXT DEFAULT '🙂',
    level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 300,
    streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0, weekly_minutes INTEGER DEFAULT 0,
    best_day TEXT DEFAULT '0h 0m', favorite_subject TEXT DEFAULT 'Nenhuma',
    guild_id TEXT, is_fake INTEGER DEFAULT 0,
    bio TEXT DEFAULT '', accent_color TEXT DEFAULT '#06b6d4',
    banner_url TEXT DEFAULT '', border_effect TEXT DEFAULT 'none',
    theme TEXT DEFAULT 'default', password_hash TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS user_titles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, title TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, achievement_id TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, item_name TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_effects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, effect_type TEXT NOT NULL, effect_value TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS session_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, minutes INTEGER NOT NULL, mode TEXT NOT NULL, xp_gain INTEGER DEFAULT 0, coin_gain INTEGER DEFAULT 0, date TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS store_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, rarity TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'custom')`);
  db.run(`CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, progress INTEGER DEFAULT 0, target INTEGER NOT NULL, reward_xp INTEGER DEFAULT 0, reward_coins INTEGER DEFAULT 0, reward_title TEXT, active INTEGER DEFAULT 1)`);
  db.run(`CREATE TABLE IF NOT EXISTS achievements (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, rarity TEXT DEFAULT 'Comum')`);
  db.run(`CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, name TEXT NOT NULL, progress INTEGER DEFAULT 0, goal INTEGER DEFAULT 1000)`);
  db.run(`CREATE TABLE IF NOT EXISTS guild_members (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS casino_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, game TEXT NOT NULL, result TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, active INTEGER DEFAULT 1, expires TEXT DEFAULT '24h')`);
  db.run(`CREATE TABLE IF NOT EXISTS pdfs (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT DEFAULT 'geral', description TEXT, file_url TEXT NOT NULL, cover_url TEXT DEFAULT '', uploader_id TEXT NOT NULL, downloads INTEGER DEFAULT 0, rating REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_name TEXT NOT NULL, action TEXT NOT NULL, details TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, friend_id TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS study_goals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, daily_minutes INTEGER DEFAULT 120, weekly_minutes INTEGER DEFAULT 600, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS subject_time (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, subject TEXT NOT NULL, minutes INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, subject TEXT NOT NULL, UNIQUE(user_id, subject))`);
  try { db.run('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ""'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ""'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN accent_color TEXT DEFAULT "#06b6d4"'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN banner_url TEXT DEFAULT ""'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN border_effect TEXT DEFAULT "none"'); } catch(e) {}
  try { db.run('ALTER TABLE users ADD COLUMN theme TEXT DEFAULT "default"'); } catch(e) {}
  saveDB();
}

function seedData() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM settings');
  if (stmt.step() && stmt.getAsObject().count > 0) { stmt.free(); return; }
  stmt.free();

  db.run("INSERT OR REPLACE INTO settings VALUES ('xpPerMinute','12')");
  db.run("INSERT OR REPLACE INTO settings VALUES ('coinPerMinute','5')");
  db.run("INSERT OR REPLACE INTO settings VALUES ('streakMultiplier','1.2')");
  db.run("INSERT OR REPLACE INTO settings VALUES ('boost','none')");
  db.run("INSERT OR REPLACE INTO settings VALUES ('adminPassword','assembleia')");
  db.run("INSERT OR REPLACE INTO settings VALUES ('jackpotAvailable','true')");

  const users = [
    ['joao','João','🦾',14,3420,1420,5,9,417,135,'3h 10m','Matemática','phoenix',1],
    ['maria','Maria','🌙',13,2980,1680,8,12,388,154,'2h 48m','Biologia','luna',1],
    ['pedro','Pedro','⚡',12,2840,980,4,7,339,112,'2h 26m','Português','nova-ordem',1],
    ['ana','Ana','🧠',11,2510,680,3,6,297,102,'2h 05m','História','aurora',1],
    ['lucas','Lucas','😎',16,3920,2200,10,14,492,178,'3h 20m','Física','phoenix',1],
    ['bia','Bia','🍀',10,2290,740,2,5,273,88,'1h 59m','Química','luna',1],
    ['rafael','Rafael','👑',17,4120,2640,11,16,538,195,'3h 40m','Geografia','nova-ordem',1],
    ['aurora','Aurora','✨',15,3670,1920,7,9,468,165,'3h 12m','Inglês','aurora',1],
  ];
  for (const u of users) {
    db.run('INSERT INTO users (id,name,avatar,level,xp,coins,streak,best_streak,total_minutes,weekly_minutes,best_day,favorite_subject,guild_id,is_fake) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', u);
  }

  db.run("INSERT INTO user_titles VALUES (NULL,'joao','Rei do Ranking')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'joao','Tema Neon')");
  db.run("INSERT INTO user_titles VALUES (NULL,'maria','Apostadora')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'maria','seven-streak')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'maria','rich-study')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'maria','Borda Lendária')");
  db.run("INSERT INTO user_titles VALUES (NULL,'pedro','Sortudo')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'pedro','Mascote Dragão')");
  db.run("INSERT INTO user_titles VALUES (NULL,'ana','Comprador compulsivo')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'ana','rich-study')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'ana','Efeito Glimmer')");
  db.run("INSERT INTO user_titles VALUES (NULL,'lucas','Magnata')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'lucas','king-ranking')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'lucas','Tema Galáxia')");
  db.run("INSERT INTO user_titles VALUES (NULL,'bia','Viciado em XP')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'bia','one-hour')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'bia','Borda Neon')");
  db.run("INSERT INTO user_titles VALUES (NULL,'rafael','Rico dos estudos')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'rafael','ten-hours')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'rafael','Tema Dragão')");
  db.run("INSERT INTO user_titles VALUES (NULL,'aurora','Sortudo')");
  db.run("INSERT INTO user_achievements VALUES (NULL,'aurora','apostador')");
  db.run("INSERT INTO user_inventory VALUES (NULL,'aurora','Efeito Aurora')");

  const guilds = [['phoenix','Phoenix',720,1200],['luna','Luna',830,1400],['nova-ordem','Nova Ordem',680,1100],['aurora','Aurora',950,1500]];
  for (const g of guilds) db.run('INSERT INTO guilds VALUES (?,?,?,?)', g);
  db.run("INSERT INTO guild_members VALUES (NULL,'phoenix','joao')");
  db.run("INSERT INTO guild_members VALUES (NULL,'phoenix','lucas')");
  db.run("INSERT INTO guild_members VALUES (NULL,'luna','maria')");
  db.run("INSERT INTO guild_members VALUES (NULL,'luna','bia')");
  db.run("INSERT INTO guild_members VALUES (NULL,'nova-ordem','pedro')");
  db.run("INSERT INTO guild_members VALUES (NULL,'nova-ordem','rafael')");
  db.run("INSERT INTO guild_members VALUES (NULL,'aurora','ana')");
  db.run("INSERT INTO guild_members VALUES (NULL,'aurora','aurora')");

  const store = [
    ['tema-neon','Tema Neon',800,'Épico','Aplique visual neon exclusivo local.','theme'],
    ['borda-guardiao','Borda Guardião',420,'Raro','Destaque seu perfil com estilo.','border'],
    ['titulo-lendario','Título Lendário',1200,'Lendário','Conquiste o título mais cobiçado.','title'],
    ['boost-xp','Boost de XP',550,'Raro','XP x2 por 30 minutos de sessão.','boost'],
    ['freeze-streak','Freeze de Streak',380,'Comum','Protege seu streak por uma sessão.','utility'],
    ['mascote-fenix','Mascote Fênix',980,'Épico','Companheiro de estudo virtual.','pet'],
    ['efeito-glow','Efeito Glow',670,'Raro','Brilho ao finalizar sessões.','effect'],
    ['borda-neon','Borda Neon',600,'Raro','Borda neon animada no perfil.','border'],
    ['borda-lendaria','Borda Lendária',1500,'Lendário','Borda dourada animada lendária.','border'],
    ['tema-galaxia','Tema Galáxia',1100,'Épico','Fundo de perfil com efeito galáctico.','theme'],
    ['tema-dragao','Tema Dragão',1300,'Épico','Estilo dragão de fogo no perfil.','theme'],
    ['neon-rose','Neon Rosa',500,'Raro','Brilho rosa neon no perfil.','effect'],
    ['neon-cyan','Neon Ciano',500,'Raro','Brilho ciano vibrante.','effect'],
    ['neon-gold','Neon Dourado',900,'Épico','Brilho dourado premium.','effect'],
    ['particulas','Partículas Mágicas',1400,'Lendário','Partículas flutuando no perfil.','effect'],
    ['aura-fogo','Aura de Fogo',1600,'Lendário','Aura flamejante no avatar.','effect'],
    ['coroa-dourada','Coroa Dourada',2000,'Lendário','Coroa real sobre o avatar.','border'],
    ['arco-iris','Arco-Íris Animado',1200,'Épico','Borda arco-íris no perfil.','border'],
  ];
  for (const item of store) db.run('INSERT INTO store_items VALUES (?,?,?,?,?,?)', item);

  const missions = [
    ['m-30min','Estudar 30 minutos','daily',0,30,120,80,'Focado',1],
    ['m-1hora','Estudar 1 hora','daily',0,60,260,140,'Maratonista',1],
    ['m-3pomodoros','Completar 3 pomodoros','daily',0,3,190,100,'Pomodoro Pro',1],
    ['m-3dias','Estudar 3 dias seguidos','weekly',0,3,360,240,'Ritual',1],
    ['m-ganharAposta','Ganhar uma aposta','weekly',0,1,280,180,'Apostador',1],
    ['m-comprarLoja','Comprar um item na loja','weekly',0,1,160,120,'Comprador',1],
  ];
  for (const m of missions) db.run('INSERT INTO missions VALUES (?,?,?,?,?,?,?,?,?)', m);

  const achievements = [
    ['first-focus','Primeiro foco','Finalize sua primeira sessão.','Comum'],
    ['one-hour','1 hora estudada','Acumule 60 minutos de estudo.','Raro'],
    ['ten-hours','10 horas estudadas','Acumule 600 minutos de estudo.','Épico'],
    ['seven-streak','7 dias de streak','Mantenha streak por 7 dias.','Épico'],
    ['rich-study','Rico dos estudos','Acumule 2000 moedas.','Lendário'],
    ['king-ranking','Rei do ranking','Fique entre os top 3 no ranking geral.','Lendário'],
    ['apostador','Apostador','Ganhe sua primeira aposta.','Raro'],
    ['comprador','Comprador compulsivo','Compre 3 itens da loja.','Raro'],
  ];
  for (const a of achievements) db.run('INSERT INTO achievements VALUES (?,?,?,?)', a);

  const events = [
    ['doubleXp','XP em dobro','XP x2 nas sessões por 2 horas.',1,'24h'],
    ['casinoNight','Cassino liberado','Aposte no cassino usando saldo extra.',1,'12h'],
    ['guildWar','Guerra de guildas','Aliados ganham bônus de guilda.',0,'48h'],
    ['mathWeek','Semana matemática','Missões de exatas rendem recompensas extras.',0,'7d'],
    ['enemRun','Maratona ENEM','Meta coletiva para sessões longas.',1,'5d'],
    ['coinRain','Chuva de moedas','Sessões rendem moedas adicionais.',0,'8h'],
  ];
  for (const e of events) db.run('INSERT INTO events VALUES (?,?,?,?,?)', e);

  saveDB();
}

function checkAchievements(userId, minutes) {
  const user = getUser(userId);
  const unlocked = all(db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?', [userId])).map(r => r.achievement_id);
  const rewards = { 'first-focus': { coins: 50, xp: 100 }, 'one-hour': { coins: 100, xp: 200 }, 'ten-hours': { coins: 300, xp: 500 }, 'seven-streak': { coins: 200, xp: 400 }, 'rich-study': { coins: 500, xp: 800 }, 'king-ranking': { coins: 400, xp: 600 }, 'apostador': { coins: 150, xp: 250 }, 'comprador': { coins: 100, xp: 200 } };
  const tryUnlock = (id) => {
    if (!unlocked.includes(id)) {
      db.run('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?,?)', [userId, id]);
      const r = rewards[id] || { coins: 0, xp: 0 };
      db.run('UPDATE users SET coins = coins + ?, xp = xp + ? WHERE id = ?', [r.coins, r.xp, userId]);
      addNotification(userId, 'conquista', `🏆 Conquista desbloqueada! +${r.coins}🪙 +${r.xp}XP`);
      const u = getUser(userId);
      logActivity(u.id, u.name, 'conquista', `Desbloqueou "${id}"`);
    }
  };
  if (!unlocked.includes('first-focus')) tryUnlock('first-focus');
  if (user.total_minutes >= 60 && !unlocked.includes('one-hour')) tryUnlock('one-hour');
  if (user.total_minutes >= 600 && !unlocked.includes('ten-hours')) tryUnlock('ten-hours');
  if (user.best_streak >= 7 && !unlocked.includes('seven-streak')) tryUnlock('seven-streak');
  if (user.coins >= 2000 && !unlocked.includes('rich-study')) tryUnlock('rich-study');
}

function levelUpUser(userId) {
  let user = getUser(userId);
  let nextLevelXp = user.level * 520 + 280;
  let leveled = false;
  while (user.xp >= nextLevelXp) {
    db.run('UPDATE users SET xp = xp - ?, level = level + 1 WHERE id = ?', [nextLevelXp, userId]);
    leveled = true;
    user = getUser(userId);
    nextLevelXp = user.level * 520 + 280;
  }
  return leveled;
}

function logActivity(userId, userName, action, details) {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  db.run('INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?,?,?,?,?)', [id, userId, userName, action, details || '']);
  saveDB();
}

function addNotification(userId, type, message) {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  db.run('INSERT INTO notifications (id, user_id, type, message) VALUES (?,?,?,?)', [id, userId, type, message]);
  saveDB();
}

function resetWeeklyIfNeeded() {
  const lastReset = getSetting('lastWeeklyReset');
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0,0,0,0);
  const weekStartStr = weekStart.toISOString();
  if (lastReset !== weekStartStr) {
    db.run('UPDATE users SET weekly_minutes = 0, streak = 0');
    db.run('UPDATE missions SET progress = 0, active = 1');
    db.run("UPDATE settings SET value = ? WHERE key = 'lastWeeklyReset'", [weekStartStr]);
    saveDB();
  }
}

async function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    const SQL = await initSqlJs();
    db = new SQL.Database(buffer);
  } else {
    const SQL = await initSqlJs();
    db = new SQL.Database();
  }
  initDB();
  seedData();
}

async function start() {
  await loadDB();
  resetWeeklyIfNeeded();

  app.get('/api/settings', (req, res) => {
    const rows = all(db.prepare('SELECT * FROM settings'));
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  });

  app.put('/api/settings', (req, res) => {
    const { xpPerMinute, coinPerMinute, streakMultiplier, boost } = req.body;
    if (xpPerMinute) updateSetting('xpPerMinute', xpPerMinute);
    if (coinPerMinute) updateSetting('coinPerMinute', coinPerMinute);
    if (streakMultiplier) updateSetting('streakMultiplier', streakMultiplier);
    if (boost) updateSetting('boost', boost);
    res.json({ success: true });
  });

  app.get('/api/users', (req, res) => {
    const users = all(db.prepare('SELECT id,name,avatar,level,xp,coins,streak,best_streak,total_minutes,weekly_minutes,best_day,favorite_subject,guild_id,accent_color,banner_url,bio,border_effect,theme FROM users ORDER BY total_minutes DESC'));
    res.json(users);
  });

  app.post('/api/users/login', async (req, res) => {
    const { name, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const user = one(db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?)', [name]));
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.password_hash) {
      const valid = await bcrypt.compare(password || '', user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Senha inválida' });
    }
    const full = getUserFull(user.id);
    full.token = user.id;
    res.json(full);
  });

  app.post('/api/users', async (req, res) => {
    const { name, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    if (!password || password.length < 3) return res.status(400).json({ error: 'Senha deve ter pelo menos 3 caracteres' });
    const exists = one(db.prepare('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [name]));
    if (exists) return res.status(409).json({ error: 'Nome já existe' });
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const password_hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (id, name, coins, password_hash) VALUES (?,?,300,?)', [id, name, password_hash]);
    db.run("INSERT INTO user_titles (user_id, title) VALUES (?,'Novo Iniciado')", [id]);
    db.run("INSERT INTO user_inventory (user_id, item_name) VALUES (?,'Tema Padrão')", [id]);
    saveDB();
    const user = getUserFull(id);
    user.token = id;
    res.json(user);
  });

  app.get('/api/users/:id', (req, res) => {
    const user = getUserFull(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
  });

  app.put('/api/users/:id/avatar', (req, res) => {
    const { avatar } = req.body;
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.put('/api/users/:id/profile', (req, res) => {
    const { bio, accent_color, banner_url, border_effect, theme, favorite_subject } = req.body;
    const user = getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (bio !== undefined) db.run('UPDATE users SET bio = ? WHERE id = ?', [bio, req.params.id]);
    if (accent_color !== undefined) db.run('UPDATE users SET accent_color = ? WHERE id = ?', [accent_color, req.params.id]);
    if (banner_url !== undefined) db.run('UPDATE users SET banner_url = ? WHERE id = ?', [banner_url, req.params.id]);
    if (border_effect !== undefined) db.run('UPDATE users SET border_effect = ? WHERE id = ?', [border_effect, req.params.id]);
    if (theme !== undefined) db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, req.params.id]);
    if (favorite_subject !== undefined) db.run('UPDATE users SET favorite_subject = ? WHERE id = ?', [favorite_subject, req.params.id]);
    saveDB();
    res.json({ success: true, user: getUserFull(req.params.id) });
  });

  app.post('/api/users/:id/equip-effect', (req, res) => {
    const { effect_type, effect_value, unequip } = req.body;
    if (unequip) {
      db.run('DELETE FROM user_effects WHERE user_id = ? AND effect_type = ?', [req.params.id, effect_type]);
    } else {
      db.run('DELETE FROM user_effects WHERE user_id = ? AND effect_type = ?', [req.params.id, effect_type]);
      db.run('INSERT INTO user_effects (user_id, effect_type, effect_value) VALUES (?,?,?)', [req.params.id, effect_type, effect_value]);
    }
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/users/:id/session', (req, res) => {
    const { minutes, mode, subject } = req.body;
    const user = getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const xpPerMinute = Number(getSetting('xpPerMinute')) || 12;
    const coinPerMinute = Number(getSetting('coinPerMinute')) || 5;
    const streakMultiplier = Number(getSetting('streakMultiplier')) || 1.2;
    const globalBoost = getSetting('boost') || 'none';

    const doubleXpEvent = one(db.prepare('SELECT active FROM events WHERE id = ?', ['doubleXp']));
    const boostMultiplier = (globalBoost === 'doubleXp' || (doubleXpEvent && doubleXpEvent.active)) ? 2 : 1;
    const baseXp = minutes * xpPerMinute * boostMultiplier;
    const baseCoins = minutes * coinPerMinute;
    const streakBonus = Math.round(baseXp * Math.min(2.4, (streakMultiplier - 1) * user.streak));
    const finalXp = Math.round(baseXp + streakBonus);
    const coinRainEvent = one(db.prepare('SELECT active FROM events WHERE id = ?', ['coinRain']));
    const coinRainActive = globalBoost === 'coinRain' || (coinRainEvent && coinRainEvent.active);
    const finalCoins = Math.round(baseCoins + user.streak * 2 + (coinRainActive ? minutes * 3 : 0));

    const sessionId = `sess-${Date.now()}`;
    const now = new Date().toLocaleString('pt-BR');

    db.run('INSERT INTO session_history VALUES (?,?,?,?,?,?,?)', [sessionId, req.params.id, minutes, mode, finalXp, finalCoins, now]);
    db.run('UPDATE users SET total_minutes = total_minutes + ?, weekly_minutes = weekly_minutes + ?, xp = xp + ?, coins = coins + ?, streak = streak + 1, best_streak = MAX(best_streak, streak + 1), best_day = ? WHERE id = ?',
      [minutes, minutes, finalXp, finalCoins, `${Math.floor(minutes/60)}h ${minutes%60}m`, req.params.id]);

    checkAchievements(req.params.id, minutes);
    const leveled = levelUpUser(req.params.id);
    saveDB();

    logActivity(req.params.id, user.name, 'sessao', `Estudou ${minutes} min (${mode})`);

    if (subject && subject !== 'Nenhuma') {
      const existing = one(db.prepare('SELECT id FROM subject_time WHERE user_id = ? AND subject = ?', [req.params.id, subject]));
      if (existing) db.run('UPDATE subject_time SET minutes = minutes + ? WHERE id = ?', [minutes, existing.id]);
      else db.run('INSERT INTO subject_time (user_id, subject, minutes) VALUES (?,?,?)', [req.params.id, subject, minutes]);
    }

    const missions = all(db.prepare('SELECT * FROM missions WHERE active = 1'));
    for (const m of missions) {
      let progress = m.progress;
      if (m.id === 'm-30min' || m.id === 'm-1hora') progress += minutes;
      else if (m.id === 'm-3pomodoros' && mode === 'pomodoro') progress += 1;
      else if (m.id === 'm-3dias') progress = Math.min(m.target, user.streak + 1);
      else continue;
      db.run('UPDATE missions SET progress = MIN(?, target) WHERE id = ?', [progress, m.id]);
    }

    if (leveled) addNotification(req.params.id, 'conquista', `🎉 Você subiu para o nível ${getUser(req.params.id).level}!`);

    res.json({ sessionId, xpGain: finalXp, coinGain: finalCoins, leveled });
  });

  app.get('/api/store', (req, res) => {
    res.json(all(db.prepare('SELECT * FROM store_items')));
  });


  app.get('/api/missions', (req, res) => {
    res.json(all(db.prepare('SELECT * FROM missions')));
  });

  app.post('/api/missions/claim', (req, res) => {
    const { userId, missionId } = req.body;
    const mission = one(db.prepare('SELECT * FROM missions WHERE id = ?', [missionId]));
    if (!mission) return res.status(404).json({ error: 'Missão não encontrada' });
    if (mission.progress < mission.target) return res.status(400).json({ error: 'Missão não concluída' });
    if (!mission.active) return res.status(400).json({ error: 'Missão já resgatada' });
    db.run('UPDATE users SET coins = coins + ?, xp = xp + ? WHERE id = ?', [mission.reward_coins, mission.reward_xp, userId]);
    db.run('INSERT INTO user_titles (user_id, title) VALUES (?,?)', [userId, mission.reward_title]);
    db.run('UPDATE missions SET active = 0 WHERE id = ?', [missionId]);
    saveDB();
    res.json({ success: true });
  });

  app.get('/api/achievements', (req, res) => {
    res.json(all(db.prepare('SELECT * FROM achievements')));
  });

  app.get('/api/guilds', (req, res) => {
    const guilds = all(db.prepare('SELECT g.*, COUNT(gm.id) as member_count FROM guilds g LEFT JOIN guild_members gm ON g.id = gm.guild_id GROUP BY g.id'));
    res.json(guilds);
  });

  app.post('/api/guilds', (req, res) => {
    const { name, userId } = req.body;
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const existing = one(db.prepare('SELECT id FROM guilds WHERE id = ?', [id]));
    if (existing) return res.status(409).json({ error: 'Guilda já existe' });
    db.run('INSERT INTO guilds (id, name) VALUES (?,?)', [id, name]);
    db.run('INSERT INTO guild_members (guild_id, user_id) VALUES (?,?)', [id, userId]);
    db.run('UPDATE users SET guild_id = ? WHERE id = ?', [id, userId]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/guilds/join', (req, res) => {
    const { guildId, userId } = req.body;
    const member = one(db.prepare('SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?', [guildId, userId]));
    if (member) return res.status(400).json({ error: 'Já é membro' });
    db.run('INSERT INTO guild_members (guild_id, user_id) VALUES (?,?)', [guildId, userId]);
    db.run('UPDATE users SET guild_id = ? WHERE id = ?', [guildId, userId]);
    saveDB();
    res.json({ success: true });
  });

  app.get('/api/casino/history', (req, res) => {
    const history = all(db.prepare('SELECT c.*, u.name as user_name FROM casino_history c JOIN users u ON c.user_id = u.id ORDER BY c.date DESC LIMIT 30'));
    res.json(history);
  });

  /* ───── Mines ───── */
  const minesGames = {};
  app.post('/api/casino/mines/start', (req, res) => {
    const { userId, bet, minesCount=3 } = req.body;
    const user = getUser(userId);
    if (!user || bet > user.coins) return res.status(400).json({ error: 'Saldo insuficiente' });
    if (bet < 10) return res.status(400).json({ error: 'Aposta mínima 10' });
    const totalTiles = 25;
    const positions = Array.from({length:totalTiles},(_,i)=>i);
    const mines = [];
    for (let i=0;i<minesCount;i++) { const idx=Math.floor(Math.random()*positions.length); mines.push(positions.splice(idx,1)[0]); }
    const gemTiles = Array.from({length:totalTiles},(_,i)=>i).filter(i=>!mines.includes(i));
    const gameId = `mines-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    minesGames[gameId] = { userId, bet, mines, gemTiles, revealed:[], minesCount, gameOver:false, cashedOut:false };
    db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [bet, userId]);
    saveDB();
    res.json({ gameId, totalTiles, minesCount });
  });
  app.post('/api/casino/mines/reveal', (req, res) => {
    const { gameId, tile } = req.body;
    const game = minesGames[gameId];
    if (!game || game.gameOver) return res.status(400).json({ error: 'Jogo encerrado' });
    if (game.revealed.includes(tile)) return res.status(400).json({ error: 'Tile já revelado' });
    game.revealed.push(tile);
    if (game.mines.includes(tile)) {
      game.gameOver = true;
      db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'mines', mina, -game.bet]);
      saveDB();
      return res.json({ safe:false, gameOver:true, won:0, mines:game.mines, revealedCount:game.revealed.length-1 });
    }
    const safeCount = game.revealed.filter(r=>!game.mines.includes(r)).length;
    const mult = 1 + safeCount * 0.25;
    const cashout = Math.round(game.bet * mult);
    if (safeCount === game.gemTiles.length) {
      game.gameOver = true;
      db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [cashout, game.userId]);
      db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'mines', `+${cashout}`, cashout]);
      saveDB();
      return res.json({ safe:true, gameOver:true, won:cashout, multiplier:mult, revealedCount:safeCount });
    }
    res.json({ safe:true, gameOver:false, won:0, multiplier:mult, cashout, revealedCount:safeCount });
  });
  app.post('/api/casino/mines/cashout', (req, res) => {
    const { gameId } = req.body;
    const game = minesGames[gameId];
    if (!game || game.gameOver || game.cashedOut) return res.status(400).json({ error: 'Jogo encerrado' });
    const safeCount = game.revealed.filter(r=>!game.mines.includes(r)).length;
    if (safeCount === 0) return res.status(400).json({ error: 'Revele ao menos 1 tile' });
    const mult = 1 + safeCount * 0.25;
    const won = Math.round(game.bet * mult);
    game.gameOver = true; game.cashedOut = true;
    db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [won, game.userId]);
    db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'mines', `+${won}`, won]);
    saveDB();
    res.json({ won, multiplier:mult, safeCount });
  });

  /* ───── Roulette ───── */
  app.post('/api/casino/roulette/spin', (req, res) => {
    const { userId, bet, betType, betValue } = req.body;
    const user = getUser(userId);
    if (!user || bet > user.coins) return res.status(400).json({ error: 'Saldo insuficiente' });
    if (bet < 10) return res.status(400).json({ error: 'Aposta mínima 10' });
    const numbers = [];
    for (let n=0;n<=36;n++) {
      const color = n===0?'verde':([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n)?'vermelho':'preto');
      numbers.push({n,color});
    }
    const result = numbers[Math.floor(Math.random()*numbers.length)];
    let won = 0, payout = 0;
    if (betType==='number' && Number(betValue)===result.n) { payout=35; won=bet*35; }
    else if (betType==='red' && result.color==='vermelho') { payout=2; won=bet*2; }
    else if (betType==='black' && result.color==='preto') { payout=2; won=bet*2; }
    else if (betType==='even' && result.n!==0 && result.n%2===0) { payout=2; won=bet*2; }
    else if (betType==='odd' && result.n%2===1) { payout=2; won=bet*2; }
    else if (betType==='1-12' && result.n>=1 && result.n<=12) { payout=3; won=bet*3; }
    else if (betType==='13-24' && result.n>=13 && result.n<=24) { payout=3; won=bet*3; }
    else if (betType==='25-36' && result.n>=25 && result.n<=36) { payout=3; won=bet*3; }
    const netAmount = won - bet;
    db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [netAmount, userId]);
    db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [userId, 'roleta', `${result.n} ${result.color}`, netAmount]);
    saveDB();
    res.json({ number:result.n, color:result.color, won, netAmount, payout, betType, betValue });
  });

  /* ───── Blackjack ───── */
  const bjGames = {};
  function createDeck() {
    const suits = ['♠','♥','♦','♣'];
    const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const deck = [];
    for (const suit of suits) for (const rank of ranks) deck.push({suit,rank});
    for (let i=deck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    return deck;
  }
  function handValue(hand) {
    let val = 0, aces = 0;
    for (const c of hand) { if (c.rank==='A') { aces++; val+=11; } else if (['J','Q','K'].includes(c.rank)) val+=10; else val+=Number(c.rank); }
    while (val>21 && aces>0) { val-=10; aces--; }
    return val;
  }
  app.post('/api/casino/blackjack/deal', (req, res) => {
    const { userId, bet } = req.body;
    const user = getUser(userId);
    if (!user || bet > user.coins) return res.status(400).json({ error: 'Saldo insuficiente' });
    if (bet < 10) return res.status(400).json({ error: 'Aposta mínima 10' });
    const deck = createDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];
    const gameId = `bj-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    bjGames[gameId] = { userId, bet, deck, player, dealer, gameOver:false };
    db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [bet, userId]);
    saveDB();
    const pv = handValue(player);
    if (pv===21) {
      bjGames[gameId].gameOver=true;
      const dv = handValue([dealer[0]]);
      const won = dv===21 ? bet : Math.round(bet*2.5);
      const net = won - bet;
      db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [won, userId]);
      db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [userId, 'blackjack', pv===21?'Blackjack!':`${pv}`, net]);
      saveDB();
      return res.json({ gameId, player, dealer:[dealer[0],{hidden:true}], playerValue:pv, dealerValue:handValue([dealer[0]]), result:dv===21?'Empate!':pv===21?'Blackjack!':null, gameOver:true, won, netAmount:net });
    }
    res.json({ gameId, player, dealer:[dealer[0],{hidden:true}], playerValue:pv, dealerValue:handValue([dealer[0]]), result:null, gameOver:false, won:0, netAmount:-bet });
  });
  app.post('/api/casino/blackjack/hit', (req, res) => {
    const { gameId } = req.body;
    const game = bjGames[gameId];
    if (!game || game.gameOver) return res.status(400).json({ error: 'Jogo encerrado' });
    const card = game.deck.pop();
    game.player.push(card);
    const val = handValue(game.player);
    if (val > 21) {
      game.gameOver = true;
      db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'blackjack', `Estourou ${val}`, -game.bet]);
      saveDB();
      return res.json({ card, hand:game.player, value:val, bust:true, gameOver:true, dealerHand:game.dealer, dealerValue:handValue(game.dealer) });
    }
    if (val === 21) {
      game.gameOver = true;
      const dv = handValue(game.dealer);
      if (dv < 21) {
        while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
        const finalDv = handValue(game.dealer);
        const won = finalDv > 21 || val > finalDv ? game.bet*2 : val === finalDv ? game.bet : 0;
        const net = won - game.bet;
        if (won) db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [won, game.userId]);
        db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'blackjack', `${val} vs ${finalDv}`, net]);
        saveDB();
        return res.json({ card, hand:game.player, value:val, bust:false, gameOver:true, dealerHand:game.dealer, dealerValue:finalDv, result:won>0?'Ganhou!':won===0?'Empate':'Perdeu', won, netAmount:net });
      }
      const won = val === dv ? game.bet : 0;
      const net = won - game.bet;
      if (won) db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [won, game.userId]);
      db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'blackjack', `${val} vs ${dv}`, net]);
      saveDB();
      return res.json({ card, hand:game.player, value:val, bust:false, gameOver:true, dealerHand:game.dealer, dealerValue:dv, result:won>game.bet?'Ganhou!':won===game.bet?'Empate!':'Perdeu', won, netAmount:net });
    }
    res.json({ card, hand:game.player, value:val, bust:false, gameOver:false });
  });
  app.post('/api/casino/blackjack/stand', (req, res) => {
    const { gameId } = req.body;
    const game = bjGames[gameId];
    if (!game || game.gameOver) return res.status(400).json({ error: 'Jogo encerrado' });
    while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
    const pv = handValue(game.player);
    const dv = handValue(game.dealer);
    game.gameOver = true;
    let won = 0;
    if (dv > 21 || pv > dv) won = game.bet * 2;
    else if (pv === dv) won = game.bet;
    else won = 0;
    const net = won - game.bet;
    if (won) db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [won, game.userId]);
    db.run('INSERT INTO casino_history (user_id, game, result, amount) VALUES (?,?,?,?)', [game.userId, 'blackjack', `${pv} vs ${dv}`, net]);
    saveDB();
    res.json({ dealerHand:game.dealer, dealerValue:dv, playerValue:pv, result:won>game.bet?'Ganhou!':won===game.bet?'Empate!':'Perdeu', won, netAmount:net, gameOver:true });
  });

  app.get('/api/events', (req, res) => {
    res.json(all(db.prepare('SELECT * FROM events')));
  });

  app.get('/api/admin/users', (req, res) => {
    res.json(all(db.prepare('SELECT id,name,avatar,level,xp,coins,streak,total_minutes,is_fake FROM users ORDER BY total_minutes DESC')));
  });

  app.post('/api/admin/coins', (req, res) => {
    const { userId, amount } = req.body;
    db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [amount, userId]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/admin/xp', (req, res) => {
    const { userId, amount } = req.body;
    db.run('UPDATE users SET xp = xp + ? WHERE id = ?', [amount, userId]);
    saveDB();
    res.json({ success: true });
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/admin/store', (req, res) => {
    const { name, price, rarity, description, type, id } = req.body;
    const itemId = id || name.toLowerCase().replace(/\s+/g,'-')+'-'+Date.now();
    db.run('INSERT INTO store_items VALUES (?,?,?,?,?,?)', [itemId, name, price, rarity||'Comum', description||'', type||'custom']);
    saveDB();
    res.json({ success: true });
  });

  app.delete('/api/admin/store/:id', (req, res) => {
    db.run('DELETE FROM store_items WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/admin/missions', (req, res) => {
    const { name, type, target, rewardXp, rewardCoins, rewardTitle } = req.body;
    const id = `mission-${Date.now()}`;
    db.run('INSERT INTO missions (id,name,type,progress,target,reward_xp,reward_coins,reward_title) VALUES (?,?,?,0,?,?,?,?)', [id, name, type, target, rewardXp, rewardCoins, rewardTitle||'']);
    saveDB();
    res.json({ success: true });
  });

  app.delete('/api/admin/missions/:id', (req, res) => {
    db.run('DELETE FROM missions WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/admin/events', (req, res) => {
    const { name, description } = req.body;
    const id = `event-${Date.now()}`;
    db.run("INSERT INTO events (id,name,description) VALUES (?,?,?)", [id, name, description||'']);
    saveDB();
    res.json({ success: true });
  });

  app.put('/api/admin/events/:id', (req, res) => {
    const event = one(db.prepare('SELECT active FROM events WHERE id = ?', [req.params.id]));
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
    db.run('UPDATE events SET active = ? WHERE id = ?', [event.active ? 0 : 1, req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.delete('/api/admin/events/:id', (req, res) => {
    db.run('DELETE FROM events WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/admin/reset-season', (req, res) => {
    db.run('UPDATE users SET weekly_minutes = 0, streak = 0');
    db.run('UPDATE guilds SET progress = 0');
    db.run('UPDATE missions SET progress = 0, active = 1');
    saveDB();
    res.json({ success: true });
  });

  app.get('/api/ranking/weekly', (req, res) => {
    res.json(all(db.prepare('SELECT id,name,avatar,level,weekly_minutes,coins,streak FROM users ORDER BY weekly_minutes DESC')));
  });
  app.get('/api/ranking/all', (req, res) => {
    res.json(all(db.prepare('SELECT id,name,avatar,level,total_minutes,coins,streak FROM users ORDER BY total_minutes DESC')));
  });
  app.get('/api/ranking/coins', (req, res) => {
    res.json(all(db.prepare('SELECT id,name,avatar,level,coins FROM users ORDER BY coins DESC')));
  });
  app.get('/api/ranking/streak', (req, res) => {
    res.json(all(db.prepare('SELECT id,name,avatar,level,streak FROM users ORDER BY streak DESC')));
  });

  /* ───── Supabase Auth ───── */
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, senha e nome obrigatórios' });
    if (!hasSB()) return res.status(503).json({ error: 'Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_KEY no .env' });
    const exists = one(db.prepare('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [name]));
    if (exists) return res.status(409).json({ error: 'Nome já existe' });
    try {
      const { data: authData, error: authErr } = await sb().auth.signUp({ email, password, options: { data: { name } } });
      if (authErr) return res.status(400).json({ error: authErr.message });
      if (!authData.user) return res.status(400).json({ error: 'Erro ao criar usuário' });
      const userId = authData.user.id;
      const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      try {
        const { error: profileErr } = await sb().from('profiles').insert({ id: userId, display_id: id, name, avatar: '🙂' });
        if (profileErr) console.error('Profile insert error:', profileErr.message);
      } catch(pe) { console.error('Profile insert error:', pe.message); }
      db.run('INSERT INTO users (id, name, coins) VALUES (?,?,300)', [id, name]);
      db.run("INSERT INTO user_titles (user_id, title) VALUES (?,'Novo Iniciado')", [id]);
      db.run("INSERT INTO user_inventory (user_id, item_name) VALUES (?,'Tema Padrão')", [id]);
      saveDB();
      const full = getUserFull(id);
      full.supabase_id = userId;
      full.supabase_email = email;
      res.json(full);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    if (!hasSB()) return res.status(503).json({ error: 'Supabase não configurado' });
    try {
      const { data, error } = await sb().auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: error.message });
      const { data: profile } = await sb().from('profiles').select('display_id').eq('id', data.user.id).single();
      if (!profile) return res.status(404).json({ error: 'Perfil não vinculado' });
      const user = getUserFull(profile.display_id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      user.supabase_id = data.user.id;
      res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ───── Image Upload (Supabase Storage + local fallback) ───── */
  app.post('/api/admin/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const { type } = req.body;
    try {
      if (hasSB() && type !== 'local') {
        const ext = path.extname(req.file.originalname);
        const fileName = `${type || 'generic'}/${Date.now()}${ext}`;
        const fileBuf = fs.readFileSync(req.file.path);
        const { data, error } = await sb().storage.from('eav-assets').upload(fileName, fileBuf, { contentType: req.file.mimetype, upsert: true });
        fs.unlinkSync(req.file.path);
        if (error) return res.status(400).json({ error: error.message });
        const { data: urlData } = sb().storage.from('eav-assets').getPublicUrl(fileName);
        const publicUrl = urlData.publicUrl;
        if (type) updateSetting(`img_${type}`, publicUrl);
        res.json({ url: publicUrl });
      } else {
        const ext = path.extname(req.file.originalname);
        const fileName = `${Date.now()}${ext}`;
        const dest = path.join(__dirname, 'uploads', fileName);
        fs.renameSync(req.file.path, dest);
        const publicUrl = `/uploads/${fileName}`;
        if (type) updateSetting(`img_${type}`, publicUrl);
        res.json({ url: publicUrl });
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/upload-base64', async (req, res) => {
    const { dataUrl, type } = req.body;
    if (!dataUrl) return res.status(400).json({ error: 'dataUrl obrigatório' });
    try {
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: 'Formato inválido' });
      const mime = matches[1], base64 = matches[2];
      const ext = mime.split('/')[1] || 'png';
      const buf = Buffer.from(base64, 'base64');
      let publicUrl;
      if (hasSB()) {
        try {
          const fileName = `${type || 'generic'}/${Date.now()}.${ext}`;
          const { data, error } = await sb().storage.from('eav-assets').upload(fileName, buf, { contentType: mime, upsert: true });
          if (error) throw new Error(error.message);
          const { data: urlData } = sb().storage.from('eav-assets').getPublicUrl(fileName);
          publicUrl = urlData.publicUrl;
        } catch (sbErr) {
          console.warn('Supabase upload failed, falling back to local:', sbErr.message);
          const fileName = `${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(__dirname, 'uploads', fileName), buf);
          publicUrl = `/uploads/${fileName}`;
        }
      } else {
        const fileName = `${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(__dirname, 'uploads', fileName), buf);
        publicUrl = `/uploads/${fileName}`;
      }
      if (type && !['avatar','banner'].includes(type)) updateSetting(`img_${type}`, publicUrl);
      res.json({ url: publicUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ───── Achievement CRUD ───── */
  app.post('/api/admin/achievements', (req, res) => {
    const { name, description, rarity } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = `ach-${Date.now()}`;
    db.run('INSERT INTO achievements (id, name, description, rarity) VALUES (?,?,?,?)', [id, name, description || '', rarity || 'Comum']);
    saveDB();
    res.json({ success: true, id });
  });

  app.put('/api/admin/achievements/:id', (req, res) => {
    const { name, description, rarity } = req.body;
    const existing = one(db.prepare('SELECT id FROM achievements WHERE id = ?', [req.params.id]));
    if (!existing) return res.status(404).json({ error: 'Conquista não encontrada' });
    db.run('UPDATE achievements SET name = ?, description = ?, rarity = ? WHERE id = ?', [name || existing.name, description ?? '', rarity || 'Comum', req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  app.delete('/api/admin/achievements/:id', (req, res) => {
    db.run('DELETE FROM achievements WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });

  /* ───── Site Settings / Customization ───── */
  app.get('/api/admin/site-settings', (req, res) => {
    const rows = all(db.prepare("SELECT key, value FROM settings WHERE key LIKE 'img_%' OR key IN ('siteName','siteDescription','adminPassword','xpPerMinute','coinPerMinute','streakMultiplier','boost','jackpotAvailable')"));
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  });

  app.put('/api/admin/site-settings', (req, res) => {
    const allowedKeys = ['siteName','siteDescription','adminPassword','xpPerMinute','coinPerMinute','streakMultiplier','boost','img_logo','img_banner','img_favicon','img_landing','img_avatar_default'];
    for (const [key, val] of Object.entries(req.body)) {
      if (allowedKeys.includes(key)) updateSetting(key, String(val));
    }
    res.json({ success: true });
  });

  app.post('/api/admin/sessions/advance', (req, res) => {
    const { userId, minutes } = req.body;
    const user = getUser(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const xpGain = minutes * Number(getSetting('xpPerMinute') || 12);
    const coinGain = minutes * Number(getSetting('coinPerMinute') || 5);
    const sessionId = `sess-${Date.now()}`;
    const now = new Date().toLocaleString('pt-BR');
    db.run('INSERT INTO session_history VALUES (?,?,?,?,?,?,?)', [sessionId, userId, minutes, 'admin', xpGain, coinGain, now]);
    db.run('UPDATE users SET total_minutes = total_minutes + ?, weekly_minutes = weekly_minutes + ?, xp = xp + ?, coins = coins + ? WHERE id = ?', [minutes, minutes, xpGain, coinGain, userId]);
    checkAchievements(userId, minutes);
    levelUpUser(userId);
    saveDB();
    res.json({ success: true, xpGain, coinGain });
  });

  /* ───── Notifications ───── */
  app.get('/api/notifications/:userId', (req, res) => {
    const notifs = all(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.userId]));
    res.json(notifs);
  });
  app.post('/api/notifications/read/:id', (req, res) => {
    db.run('UPDATE notifications SET read = 1 WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });
  app.post('/api/notifications/read-all/:userId', (req, res) => {
    db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.params.userId]);
    saveDB();
    res.json({ success: true });
  });

  /* ───── Activity Feed ───── */
  app.get('/api/activity', (req, res) => {
    const feed = all(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 30'));
    res.json(feed);
  });

  /* ───── PDF Library ───── */
  app.get('/api/pdfs', (req, res) => {
    const { q, cat } = req.query;
    let sql = 'SELECT * FROM pdfs';
    const params = [];
    if (q || cat) {
      const conds = [];
      if (q) { conds.push('LOWER(title) LIKE ?'); params.push(`%${q.toLowerCase()}%`); }
      if (cat) { conds.push('category = ?'); params.push(cat); }
      sql += ' WHERE ' + conds.join(' AND ');
    }
    sql += ' ORDER BY downloads DESC, created_at DESC';
    res.json(all(db.prepare(sql, params)));
  });
  app.post('/api/pdfs', (req, res) => {
    const { title, category, description, fileUrl, coverUrl, uploaderId } = req.body;
    if (!title || !fileUrl) return res.status(400).json({ error: 'Título e arquivo obrigatórios' });
    const id = `pdf-${Date.now()}`;
    const uploader = getUser(uploaderId);
    db.run('INSERT INTO pdfs (id, title, author, category, description, file_url, cover_url, uploader_id) VALUES (?,?,?,?,?,?,?,?)',
      [id, title, uploader ? uploader.name : 'Anônimo', category || 'geral', description || '', fileUrl, coverUrl || '', uploaderId]);
    saveDB();
    logActivity(uploaderId, uploader ? uploader.name : 'Anônimo', 'upload_pdf', `Enviou PDF: "${title}"`);
    res.json({ success: true, id });
  });
  app.post('/api/pdfs/download/:id', (req, res) => {
    db.run('UPDATE pdfs SET downloads = downloads + 1 WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  });
  app.get('/api/pdfs/categories', (req, res) => {
    const cats = all(db.prepare('SELECT DISTINCT category FROM pdfs ORDER BY category'));
    res.json(cats.map(c => c.category));
  });

  /* ───── Study Goals ───── */
  app.get('/api/goals/:userId', (req, res) => {
    let goal = one(db.prepare('SELECT * FROM study_goals WHERE user_id = ?', [req.params.userId]));
    if (!goal) {
      db.run('INSERT INTO study_goals (id, user_id) VALUES (?,?)', [`goal-${req.params.userId}`, req.params.userId]);
      goal = one(db.prepare('SELECT * FROM study_goals WHERE user_id = ?', [req.params.userId]));
    }
    res.json(goal);
  });
  app.put('/api/goals/:userId', (req, res) => {
    const { daily_minutes, weekly_minutes } = req.body;
    db.run('INSERT OR REPLACE INTO study_goals (id, user_id, daily_minutes, weekly_minutes) VALUES (?,?,?,?)',
      [`goal-${req.params.userId}`, req.params.userId, daily_minutes || 120, weekly_minutes || 600]);
    saveDB();
    res.json({ success: true });
  });

  /* ───── Friends ───── */
  app.get('/api/friends/:userId', (req, res) => {
    const friends = all(db.prepare(
      `SELECT u.id, u.name, u.avatar, u.level, u.total_minutes, f.status
       FROM friends f JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'`,
      [req.params.userId, req.params.userId, req.params.userId]
    ));
    res.json(friends);
  });
  app.get('/api/friends/pending/:userId', (req, res) => {
    const pending = all(db.prepare(
      `SELECT u.id, u.name, u.avatar, u.level, f.id as req_id
       FROM friends f JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = ? AND f.status = 'pending'`,
      [req.params.userId]
    ));
    res.json(pending);
  });
  app.post('/api/friends/add', (req, res) => {
    const { userId, friendId } = req.body;
    if (userId === friendId) return res.status(400).json({ error: 'Não pode adicionar a si mesmo' });
    const existing = one(db.prepare('SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId]));
    if (existing) return res.status(400).json({ error: 'Solicitação já enviada' });
    db.run('INSERT INTO friends (user_id, friend_id, status) VALUES (?,?,?)', [userId, friendId, 'pending']);
    const u = getUser(userId);
    addNotification(friendId, 'friend', `${u.name} enviou um pedido de amizade!`);
    saveDB();
    res.json({ success: true });
  });
  app.post('/api/friends/accept', (req, res) => {
    const { reqId } = req.body;
    db.run('UPDATE friends SET status = ? WHERE id = ?', ['accepted', reqId]);
    saveDB();
    res.json({ success: true });
  });
  app.post('/api/friends/remove', (req, res) => {
    const { userId, friendId } = req.body;
    db.run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId]);
    saveDB();
    res.json({ success: true });
  });

  /* ───── Export User Data ───── */
  app.get('/api/export/:userId', (req, res) => {
    const full = getUserFull(req.params.userId);
    if (!full) return res.status(404).json({ error: 'Usuário não encontrado' });
    const goals = one(db.prepare('SELECT * FROM study_goals WHERE user_id = ?', [req.params.userId]));
    const subjectTime = all(db.prepare('SELECT subject, minutes FROM subject_time WHERE user_id = ?', [req.params.userId]));
    res.json({ user: full, goals, subjectTime, exportedAt: new Date().toISOString() });
  });

  /* ───── Subject Time ───── */
  app.get('/api/subjects/:userId', (req, res) => {
    const subjects = all(db.prepare('SELECT subject, minutes FROM subject_time WHERE user_id = ? ORDER BY minutes DESC', [req.params.userId]));
    res.json(subjects);
  });

  app.get('/api/users/:id/subjects/list', (req, res) => {
    const list = all(db.prepare('SELECT subject FROM user_subjects WHERE user_id = ? ORDER BY subject', [req.params.id]));
    res.json(list.map(r => r.subject));
  });

  app.post('/api/users/:id/subjects/list', (req, res) => {
    const { subject } = req.body;
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    try {
      db.run('INSERT OR IGNORE INTO user_subjects (user_id, subject) VALUES (?,?)', [req.params.id, subject.trim()]);
      saveDB();
      const list = all(db.prepare('SELECT subject FROM user_subjects WHERE user_id = ? ORDER BY subject', [req.params.id]));
      res.json(list.map(r => r.subject));
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/users/:id/subjects/list', (req, res) => {
    const { subject } = req.body;
    if (!subject) return res.status(400).json({ error: 'Nome obrigatório' });
    db.run('DELETE FROM user_subjects WHERE user_id = ? AND subject = ?', [req.params.id, subject]);
    db.run('DELETE FROM subject_time WHERE user_id = ? AND subject = ?', [req.params.id, subject]);
    saveDB();
    const list = all(db.prepare('SELECT subject FROM user_subjects WHERE user_id = ? ORDER BY subject', [req.params.id]));
    res.json(list.map(r => r.subject));
  });

  /* ───── Store Buy (modified - add activity log) ───── */
  app.post('/api/store/buy', (req, res) => {
    const { userId, itemId } = req.body;
    const user = getUser(userId);
    const item = one(db.prepare('SELECT * FROM store_items WHERE id = ?', [itemId]));
    if (!user || !item) return res.status(404).json({ error: 'Usuário ou item não encontrado' });
    if (user.coins < item.price) return res.status(400).json({ error: 'Saldo insuficiente' });
    const owned = one(db.prepare('SELECT id FROM user_inventory WHERE user_id = ? AND item_name = ?', [userId, item.name]));
    if (owned) return res.status(400).json({ error: 'Item já possui' });
    db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [item.price, userId]);
    db.run('INSERT INTO user_inventory (user_id, item_name) VALUES (?,?)', [userId, item.name]);
    saveDB();
    logActivity(user.id, user.name, 'compra', `Comprou "${item.name}" na loja`);
    checkAchievements(userId, 0);
    res.json({ success: true });
  });

  /* ───── RAG / Search helper ───── */
  app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ users: [], items: [], missions: [], achievements: [] });
    const users = all(db.prepare("SELECT id,name,avatar,level,xp,coins FROM users WHERE LOWER(name) LIKE ? LIMIT 10", [`%${q}%`]));
    const items = all(db.prepare("SELECT * FROM store_items WHERE LOWER(name) LIKE ? LIMIT 10", [`%${q}%`]));
    const missions = all(db.prepare("SELECT * FROM missions WHERE LOWER(name) LIKE ? LIMIT 10", [`%${q}%`]));
    const achievements = all(db.prepare("SELECT * FROM achievements WHERE LOWER(name) LIKE ? LIMIT 10", [`%${q}%`]));
    res.json({ users, items, missions, achievements });
  });

  /* ───── Serve index.html with Supabase config injected ───── */
  app.get('*', (req, res) => {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
    const injected = html.replace('</head>',
      `<script>window._SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL || '')};window._SUPABASE_ANON_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')};</script></head>`);
    res.send(injected);
  });

  app.listen(PORT, () => {
    console.log(`EAV server running on http://localhost:${PORT}`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
