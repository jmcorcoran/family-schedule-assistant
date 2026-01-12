-- Create event_reminders table to track reminders for calendar events
CREATE TABLE IF NOT EXISTS event_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL, -- The Google Calendar event ID
  reminder_time TIMESTAMPTZ NOT NULL, -- When to send the reminder
  recipient_phone TEXT NOT NULL, -- Phone number to send SMS to (E.164 format without +)
  message_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for efficient querying of pending reminders
CREATE INDEX IF NOT EXISTS idx_reminders_pending
ON event_reminders(reminder_time, message_sent)
WHERE message_sent = FALSE;

-- Add index for account lookup
CREATE INDEX IF NOT EXISTS idx_reminders_account
ON event_reminders(account_id);

-- Add comment
COMMENT ON TABLE event_reminders IS 'Stores SMS reminders for calendar events';
