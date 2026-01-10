-- Add setup_complete column to track wizard completion per account
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN DEFAULT false;

-- Create index for querying setup status
CREATE INDEX IF NOT EXISTS idx_accounts_setup_complete
ON accounts(setup_complete);
