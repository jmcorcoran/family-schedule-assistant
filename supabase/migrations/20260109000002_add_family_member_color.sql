-- Add color column to family_members for calendar color coding
ALTER TABLE family_members
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN family_members.color IS 'Google Calendar colorId (1-11) for color-coding events';
