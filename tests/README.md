# Automated Tests

This directory contains automated tests for the Family Schedule Assistant.

## Test Types

### 1. Unit Tests (`supabase/functions/process-message/index.test.ts`)
Tests individual functions and logic in isolation with mocked dependencies.

**Run:**
```bash
deno test --allow-env --allow-net supabase/functions/process-message/index.test.ts
```

### 2. End-to-End Tests (`tests/e2e.test.ts`)
Tests the actual deployed Edge Functions to verify end-to-end functionality.

**Prerequisites:**
- Set environment variables:
  ```bash
  export SUPABASE_URL="your-supabase-url"
  export SUPABASE_ANON_KEY="your-anon-key"
  export TEST_PHONE_NUMBER="18477440465"  # Optional: your test phone (normalized)
  ```

**Run:**
```bash
deno test --allow-env --allow-net tests/e2e.test.ts
```

Or use the existing environment variables:
```bash
# On Windows (PowerShell)
$env:SUPABASE_URL = $env:VITE_SUPABASE_URL
$env:SUPABASE_ANON_KEY = $env:VITE_SUPABASE_ANON_KEY
deno test --allow-env --allow-net tests/e2e.test.ts

# On Linux/Mac
export SUPABASE_URL=$VITE_SUPABASE_URL
export SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
deno test --allow-env --allow-net tests/e2e.test.ts
```

## Features Tested

### Event Creation
- ✅ Single event creation
- ✅ Multi-event messages ("practice Monday and Wednesday")
- ✅ Events with location
- ✅ Recurring events
- ✅ Smart templates (default durations)
- ✅ Clarification flow (missing time/duration)
- ✅ Family member validation

### Event Management
- ✅ View/query calendar
- ✅ Cancel/delete events
- ✅ Move/reschedule events
- ✅ Skip single recurring instances
- ✅ Add notes to events

### Smart Features
- ✅ Conflict detection
- ✅ Event reminders creation
- ✅ Phone number normalization

### Background Jobs
- ✅ Send reminders function
- ✅ Send summaries function (daily/weekly)

## CI/CD

Tests run automatically on:
- Every push to `main`
- Every pull request
- Manual trigger via GitHub Actions

View test results: **Actions** → **Run Tests**

## Test Data

The E2E tests use:
- Test phone number from `TEST_PHONE_NUMBER` env var
- Your actual Supabase instance
- Your actual Google Calendar (if sender is authorized)

⚠️ **Note:** Some E2E tests may fail with "Sender not authorized" if the `TEST_PHONE_NUMBER` is not set up as an approved sender in your database. This is expected behavior.

## Adding New Tests

### Unit Test Example:
```typescript
Deno.test("Feature: Your feature name", async () => {
  setupMockFetch();

  const message = "test message";

  // Test your feature
  assertEquals(expected, actual);
});
```

### E2E Test Example:
```typescript
Deno.test("E2E: Your feature name", async () => {
  const result = await callProcessMessage("test message");

  assert(
    result.data.status === "success" ||
    result.data.error === "Sender not authorized"
  );
});
```

## Running Tests Locally

1. **Install Deno** (if not installed):
   ```bash
   # Windows (PowerShell)
   irm https://deno.land/install.ps1 | iex

   # Linux/Mac
   curl -fsSL https://deno.land/install.sh | sh
   ```

2. **Run all tests**:
   ```bash
   # Unit tests
   deno test --allow-env --allow-net supabase/functions/process-message/index.test.ts

   # E2E tests (requires env vars)
   deno test --allow-env --allow-net tests/e2e.test.ts
   ```

3. **Run specific test**:
   ```bash
   deno test --allow-env --allow-net --filter "Create single event" tests/e2e.test.ts
   ```

## Debugging Failed Tests

1. Check the test output for error messages
2. Verify environment variables are set correctly
3. Check that Edge Functions are deployed
4. Verify test phone number is an approved sender
5. Check Supabase logs for Edge Function errors

## Coverage

Current test coverage:
- ✅ Event creation and parsing
- ✅ Calendar management actions
- ✅ Smart features (templates, conflicts, notes)
- ✅ Background jobs (reminders, summaries)
- ✅ Phone number normalization
- ✅ Multi-turn clarification flow

Future additions:
- Performance tests
- Load testing
- Security testing
- Email integration tests (when implemented)
