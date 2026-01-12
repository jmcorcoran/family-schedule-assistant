-- Add Google Calendar OAuth token fields to accounts table
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS google_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Add index for token expiry checks
CREATE INDEX IF NOT EXISTS idx_accounts_google_token_expires
ON accounts(google_token_expires_at)
WHERE google_token_expires_at IS NOT NULL;
