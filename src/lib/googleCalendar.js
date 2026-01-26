const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// The redirect URI - must match what's configured in Google Cloud Console
const GOOGLE_REDIRECT_URI = 'https://jmcorcoran.github.io/family-schedule-assistant/auth/callback';

// OAuth scopes we need
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ');

/**
 * Generate the Google OAuth authorization URL
 */
export function getGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token via server-side function
 * (Client secret is kept secure on the server)
 */
export async function exchangeCodeForTokens(code, accountId) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, accountId })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to exchange code');
  }

  return await response.json();
}

// Token refresh is handled server-side in the process-message function
// to keep the client secret secure

/**
 * Add an event to Google Calendar
 */
export async function addCalendarEvent(accessToken, event) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to add event: ${error.error?.message || 'Unknown error'}`);
  }

  return await response.json();
}

/**
 * Get user's calendar list
 */
export async function getCalendarList(accessToken) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get calendars: ${error.error?.message || 'Unknown error'}`);
  }

  return await response.json();
}
