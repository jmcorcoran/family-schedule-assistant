# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based web application for AI-powered family calendar management. Users can set up their family members, configure preferences, and connect their Google Calendar. The app supports both Supabase backend and local storage fallback mode.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to GitHub Pages
npm run deploy
```

## Technology Stack

- **Frontend Framework**: React 18 with Vite
- **Styling**: Tailwind CSS
- **Database**: Supabase (with localStorage fallback)
- **Icons**: lucide-react
- **Deployment**: GitHub Pages

## Architecture

### Data Flow

The application follows a dual-storage pattern:
1. **Supabase Mode**: When environment variables are configured, all data operations go through Supabase
2. **Demo Mode**: When Supabase credentials are missing, falls back to localStorage

Each CRUD operation checks `if (supabase && accountId)` to determine which storage method to use.

### Database Schema

The Supabase database uses three main tables:

**accounts**
- `id`: Primary key
- `confirmation_preference`: Enum ('always', 'clarification-only', 'never')
- `google_calendar_id`: String (optional)
- `sms_number`: String (generated)
- `email_address`: String (generated)

**family_members**
- `id`: Primary key
- `account_id`: Foreign key to accounts
- `name`: String

**approved_senders**
- `id`: Primary key
- `account_id`: Foreign key to accounts
- `sender_type`: Enum ('phone', 'email')
- `sender_value`: String

### Component Structure

**App.jsx** - Main application component
- Contains all business logic and state management
- Implements 5-step setup wizard
- Handles both Supabase and localStorage operations
- Single-file architecture (no separate components besides Auth)

**Auth.jsx** - Authentication component (currently unused in main flow)
- Implements magic link authentication via Supabase
- Not integrated into current App flow

**lib/supabase.js** - Supabase client configuration
- Exports `supabase` (null if credentials missing)
- Exports `isSupabaseConfigured()` helper

### State Management

All state is managed locally in App.jsx using React hooks:
- `accountId`: Persisted in localStorage to track Supabase account
- `familyMembers`: Array of {id, name} objects
- `confirmPref`: String ('always' | 'clarification-only' | 'never')
- `calendarConnected`: Boolean (mock implementation)
- `approvedSenders`: Object with `phones` and `emails` arrays
- `setupComplete`: Boolean to show completion screen

### Environment Variables

Required for Supabase mode (in `.env`):
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

If these are missing, the app runs in demo mode with localStorage only.

## Key Implementation Patterns

### Dual Storage Pattern
Every create/update/delete operation follows this pattern:
```javascript
if (supabase && accountId) {
  // Perform Supabase operation
  // Update local state on success
} else {
  // Update local state
  // Call saveToLocalStorage()
}
```

### Account Initialization
On app load, `initializeAccount()`:
1. Checks if Supabase is configured
2. Looks for existing accountId in localStorage
3. Creates new account if none exists
4. Loads existing data from Supabase or localStorage

### Setup Wizard Flow
1. Add family members (minimum 1 required)
2. Select confirmation preference
3. Connect Google Calendar (mock implementation)
4. Add approved senders (minimum 1 required)
5. Review and complete

## Important Notes

- The Google Calendar connection is currently a mock implementation (just toggles a boolean)
- The Auth component exists but is not used in the main app flow
- Account ID is stored in localStorage even when using Supabase to maintain session
- The app is deployed to GitHub Pages at `/family-schedule-assistant/` base path
- Supabase credentials should never be committed (already in .gitignore)
