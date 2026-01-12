-- Create conversation_state table for multi-turn event creation
CREATE TABLE IF NOT EXISTS conversation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender_value TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('phone', 'email')),
  partial_event JSONB NOT NULL,
  awaiting_field TEXT NOT NULL, -- 'time', 'duration', 'end_date', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- Index for fast lookups by sender
CREATE INDEX IF NOT EXISTS idx_conversation_state_sender
ON conversation_state(account_id, sender_value, sender_type);

-- Index for cleanup of expired conversations
CREATE INDEX IF NOT EXISTS idx_conversation_state_expires
ON conversation_state(expires_at);
