# Family Schedule Assistant

An AI-powered family calendar management system that uses natural language SMS and email to manage Google Calendar events.

## Features

### Event Creation & Management
- 📅 Natural language event creation via SMS/email
- 📝 Multi-event messages ("practice Monday and Wednesday at 5pm")
- 🎯 Smart event templates (automatic durations for common event types)
- 📍 Location support
- 🔄 Recurring events with flexible patterns
- 👁️ View/query calendar events
- ❌ Cancel/delete events
- ⏰ Move/reschedule events
- ⏭️ Skip single recurring instances
- 📌 Add notes to events

### Smart Features
- 🚨 Conflict detection with override option
- ⏰ 1-hour advance SMS reminders
- 📨 Daily morning summaries (7am CT)
- 📊 Weekly planning summaries (Sunday 6pm CT)
- 🎨 Color-coding by family member
- 👥 Family member validation
- 💬 Multi-turn clarification flow

### Integrations
- 📱 Twilio SMS
- 📧 Email (ready - same parsing logic)
- 📆 Google Calendar sync
- 🤖 Claude AI for natural language processing

## Architecture

### Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: PostgreSQL (Supabase)
- **AI**: Claude 3 Haiku (Anthropic)
- **Calendar**: Google Calendar API
- **SMS**: Twilio
- **Automation**: GitHub Actions

### Edge Functions
- `process-message` - Main message processing and event management
- `twilio-webhook` - Receives SMS from Twilio
- `send-reminders` - Sends event reminders (runs every 5 minutes)
- `send-summaries` - Sends daily/weekly summaries

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase CLI
- Google Cloud Project with Calendar API enabled
- Twilio account (optional for SMS)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jmcorcoran/family-schedule-assistant.git
   cd family-schedule-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file:
   ```env
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   For Edge Functions, set these secrets in Supabase:
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `TWILIO_ACCOUNT_SID` (optional)
   - `TWILIO_AUTH_TOKEN` (optional)
   - `TWILIO_PHONE_NUMBER` (optional)

4. **Run database migrations**
   ```bash
   npx supabase db push
   ```

5. **Deploy Edge Functions**
   ```bash
   npx supabase functions deploy process-message --no-verify-jwt
   npx supabase functions deploy twilio-webhook --no-verify-jwt
   npx supabase functions deploy send-reminders --no-verify-jwt
   npx supabase functions deploy send-summaries --no-verify-jwt
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

## Usage

### SMS Commands

**Create Events:**
- "Justin has soccer practice tomorrow at 5pm at the park"
- "Add dentist appointment Friday at 2pm"
- "Blake has piano lesson every Tuesday at 4pm"

**View Calendar:**
- "What's on my calendar today?"
- "Show me this week's events"
- "What do I have tomorrow?"

**Manage Events:**
- "Cancel Justin's practice tomorrow"
- "Move dentist to 3pm"
- "Skip practice next Monday"
- "Add note to dentist: bring insurance card"

**Multi-Event:**
- "Justin has practice Monday and Wednesday at 5pm"
- "Add soccer at 5pm and piano at 6pm tomorrow"

## Testing

### Run All Tests
```bash
# Linux/Mac
./run-tests.sh

# Windows
.\run-tests.ps1
```

### Run Specific Tests
```bash
# Unit tests only
deno test --allow-env --allow-net supabase/functions/process-message/index.test.ts

# E2E tests only
deno test --allow-env --allow-net tests/e2e.test.ts
```

### Test Coverage
- ✅ Event creation and parsing
- ✅ Calendar management actions
- ✅ Smart features (templates, conflicts, notes)
- ✅ Background jobs (reminders, summaries)
- ✅ Phone number normalization
- ✅ Multi-turn clarification flow

See [tests/README.md](tests/README.md) for detailed testing documentation.

## Deployment

### GitHub Pages (Frontend)
The frontend is automatically deployed to GitHub Pages on every push to `main`.

**URL:** https://jmcorcoran.github.io/family-schedule-assistant/

### Supabase (Backend)
Edge Functions are deployed manually or via CI/CD:
```bash
npx supabase functions deploy <function-name> --no-verify-jwt
```

### Automated Jobs
- **Reminders:** Run every 5 minutes via GitHub Actions
- **Daily Summary:** 7:00 AM CT via GitHub Actions
- **Weekly Summary:** Sunday 6:00 PM CT via GitHub Actions

## Database Schema

### Tables
- `accounts` - User accounts with Google Calendar tokens
- `family_members` - Family members with color coding
- `approved_senders` - Authorized phone numbers and emails
- `conversation_state` - Multi-turn conversation tracking
- `event_reminders` - Scheduled SMS reminders

See [supabase/migrations/](supabase/migrations/) for full schema.

## Development

### Project Structure
```
├── src/                    # React frontend
├── supabase/
│   ├── functions/         # Edge Functions
│   └── migrations/        # Database migrations
├── tests/                 # Automated tests
├── .github/workflows/     # CI/CD workflows
└── run-tests.*           # Test runner scripts
```

### Adding New Features
1. Update Edge Function code
2. Add tests in `tests/e2e.test.ts`
3. Deploy: `npx supabase functions deploy <function>`
4. Run tests: `./run-tests.sh`
5. Commit and push

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: https://github.com/jmcorcoran/family-schedule-assistant/issues

## Acknowledgments

- Built with Claude AI assistance
- Powered by Anthropic's Claude API
- Uses Google Calendar API
- SMS via Twilio
