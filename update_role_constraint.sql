-- Drop existing constraint
ALTER TABLE users DROP CONSTRAINT users_role_check;

-- Add new constraint with moderator role
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'moderator', 'admin_zona'));
