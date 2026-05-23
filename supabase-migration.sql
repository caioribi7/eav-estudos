-- ============================================================
-- EAV — Supabase Migration (PostgreSQL)
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Profiles (vinculado ao auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '🙂',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '🙂',
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 300,
  streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  total_minutes INTEGER DEFAULT 0,
  weekly_minutes INTEGER DEFAULT 0,
  best_day TEXT DEFAULT '0h 0m',
  favorite_subject TEXT DEFAULT 'Nenhuma',
  guild_id TEXT,
  is_fake INTEGER DEFAULT 0,
  bio TEXT DEFAULT '',
  accent_color TEXT DEFAULT '#06b6d4',
  banner_url TEXT DEFAULT '',
  border_effect TEXT DEFAULT 'none',
  theme TEXT DEFAULT 'default',
  password_hash TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 4. User Titles
CREATE TABLE IF NOT EXISTS user_titles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL
);

-- 5. User Achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL
);

-- 6. User Inventory
CREATE TABLE IF NOT EXISTS user_inventory (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL
);

-- 7. User Effects
CREATE TABLE IF NOT EXISTS user_effects (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effect_type TEXT NOT NULL,
  effect_value TEXT NOT NULL
);

-- 8. Session History
CREATE TABLE IF NOT EXISTS session_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  mode TEXT NOT NULL,
  xp_gain INTEGER DEFAULT 0,
  coin_gain INTEGER DEFAULT 0,
  date TEXT NOT NULL
);

-- 9. Store Items
CREATE TABLE IF NOT EXISTS store_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'custom'
);

-- 10. Missions
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  reward_xp INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  reward_title TEXT,
  active INTEGER DEFAULT 1
);

-- 11. Achievements (conquistas)
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT DEFAULT 'Comum'
);

-- 12. Guilds
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  goal INTEGER DEFAULT 1000
);

-- 13. Guild Members
CREATE TABLE IF NOT EXISTS guild_members (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- 14. Casino History
CREATE TABLE IF NOT EXISTS casino_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  result TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER DEFAULT 1,
  expires TEXT DEFAULT '24h'
);

-- 16. PDFs
CREATE TABLE IF NOT EXISTS pdfs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  description TEXT,
  file_url TEXT NOT NULL,
  cover_url TEXT DEFAULT '',
  uploader_id TEXT NOT NULL,
  downloads INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Friends
CREATE TABLE IF NOT EXISTS friends (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Study Goals
CREATE TABLE IF NOT EXISTS study_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_minutes INTEGER DEFAULT 120,
  weekly_minutes INTEGER DEFAULT 600,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. Subject Time
CREATE TABLE IF NOT EXISTS subject_time (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  minutes INTEGER DEFAULT 0
);

-- 22. User Subjects
CREATE TABLE IF NOT EXISTS user_subjects (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  UNIQUE(user_id, subject)
);

-- 23. Storage bucket para assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('eav-assets', 'eav-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eav-assets');

DROP POLICY IF EXISTS "Auth upload access" ON storage.objects;
CREATE POLICY "Auth upload access"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eav-assets' AND auth.role() = 'authenticated');

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_session_history_user ON session_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_titles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_pdfs_category ON pdfs(category);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
