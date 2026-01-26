-- Add contact fields to family_members table
-- These fields allow family members to:
-- 1. Send messages to the system (becomes an approved sender)
-- 2. Receive notifications about events

ALTER TABLE family_members
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS contact_preference TEXT DEFAULT 'email',
ADD COLUMN IF NOT EXISTS is_account_owner BOOLEAN DEFAULT FALSE;

-- Add check constraint for contact_preference (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_contact_preference_check'
  ) THEN
    ALTER TABLE family_members
    ADD CONSTRAINT family_members_contact_preference_check
    CHECK (contact_preference IN ('email', 'sms'));
  END IF;
END $$;

-- Create index for faster sender lookups
CREATE INDEX IF NOT EXISTS idx_family_members_phone ON family_members(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_family_members_email ON family_members(email) WHERE email IS NOT NULL;
