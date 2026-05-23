-- Create profiles table for Supabase Auth
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '🙂',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow users to read their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Storage bucket for site assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('eav-assets', 'eav-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to storage
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eav-assets');

CREATE POLICY "Auth upload access"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eav-assets' AND auth.role() = 'authenticated');
