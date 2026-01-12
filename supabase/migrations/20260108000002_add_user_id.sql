-- Add user_id column to link accounts to auth users
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create unique index to ensure one account per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id_lookup ON accounts(user_id);
