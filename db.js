const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      throw new Error('SUPABASE_DB_URL não configurada. Obtenha-a em: Project Settings > Database > Connection string (URI)');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function convertParams(sql, params) {
  let idx = 0;
  const converted = sql.replace(/\?/g, () => `$${++idx}`);
  return { sql: converted, params: params || [] };
}

async function all(sql, params) {
  const { sql: pgSql, params: pgParams } = convertParams(sql, params);
  const result = await getPool().query(pgSql, pgParams);
  return result.rows;
}

async function one(sql, params) {
  const { sql: pgSql, params: pgParams } = convertParams(sql, params);
  const result = await getPool().query(pgSql, pgParams);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function run(sql, params) {
  const { sql: pgSql, params: pgParams } = convertParams(sql, params);
  const result = await getPool().query(pgSql, pgParams);
  return result;
}

async function initDB() {
  const sql = `
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, avatar TEXT DEFAULT '🙂',
      level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 300,
      streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0,
      total_minutes INTEGER DEFAULT 0, weekly_minutes INTEGER DEFAULT 0,
      best_day TEXT DEFAULT '0h 0m', favorite_subject TEXT DEFAULT 'Nenhuma',
      guild_id TEXT, is_fake INTEGER DEFAULT 0,
      bio TEXT DEFAULT '', accent_color TEXT DEFAULT '#06b6d4',
      banner_url TEXT DEFAULT '', border_effect TEXT DEFAULT 'none',
      theme TEXT DEFAULT 'default', password_hash TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS user_titles (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_achievements (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, achievement_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_inventory (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, item_name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_effects (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, effect_type TEXT NOT NULL, effect_value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, minutes INTEGER NOT NULL, mode TEXT NOT NULL, xp_gain INTEGER DEFAULT 0, coin_gain INTEGER DEFAULT 0, date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS store_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, rarity TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'custom');
    CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, progress INTEGER DEFAULT 0, target INTEGER NOT NULL, reward_xp INTEGER DEFAULT 0, reward_coins INTEGER DEFAULT 0, reward_title TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS achievements (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, rarity TEXT DEFAULT 'Comum');
    CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, name TEXT NOT NULL, progress INTEGER DEFAULT 0, goal INTEGER DEFAULT 1000);
    CREATE TABLE IF NOT EXISTS guild_members (id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS casino_history (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, game TEXT NOT NULL, result TEXT NOT NULL, amount INTEGER NOT NULL, date TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, active INTEGER DEFAULT 1, expires TEXT DEFAULT '24h');
    CREATE TABLE IF NOT EXISTS pdfs (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT DEFAULT 'geral', description TEXT, file_url TEXT NOT NULL, cover_url TEXT DEFAULT '', uploader_id TEXT NOT NULL, downloads INTEGER DEFAULT 0, rating REAL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, read INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_name TEXT NOT NULL, action TEXT NOT NULL, details TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS friends (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, friend_id TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS study_goals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, daily_minutes INTEGER DEFAULT 120, weekly_minutes INTEGER DEFAULT 600, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS subject_time (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL, minutes INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS user_subjects (id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, subject TEXT NOT NULL, UNIQUE(user_id, subject));
  `;
  await run(sql);
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { all, one, run, initDB, close };
