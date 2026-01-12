-- Add timezone column to accounts
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';

-- Create index for timezone queries
CREATE INDEX IF NOT EXISTS idx_accounts_timezone ON accounts(timezone);
