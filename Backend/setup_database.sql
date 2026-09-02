-- ============================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/yyyqotziuadvmtxqdime/sql/new
-- ============================================

-- 1. Agregar columna role a admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'moderator';

-- 2. Tu usuario existente es super_admin
UPDATE admin_users SET role = 'super_admin' WHERE email = 'sebastian.vegar2015@gmail.com';

-- 3. Insertar moderador (buitresadmin)
INSERT INTO admin_users (email, password_hash, role)
VALUES ('buitresadmin', '$2b$12$Cjg0PR22na7a4wseNjhxj.N6rkOY2by4ueS13LiCvFI50/.rBBL9y', 'moderator')
ON CONFLICT (email) DO NOTHING;

-- 4. Agregar user_email a tablas existentes
ALTER TABLE discussion_threads ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE thread_comments ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE discussion_likes ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE buitres_details ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE buitres_comments ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE buitres_interactions ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 5. Crear tabla de mensajes privados
CREATE TABLE IF NOT EXISTS private_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pm_conversation ON private_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pm_recipient ON private_messages(recipient_email, is_read);

-- 6. Habilitar RLS en private_messages
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

-- 7. Politicas RLS (solo service role puede acceder, el backend maneja todo)
CREATE POLICY "Service role full access on private_messages"
  ON private_messages FOR ALL
  USING (auth.role() = 'service_role');
