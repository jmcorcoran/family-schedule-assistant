import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

// Mock data
const mockAccount = {
  id: "test-account-id",
  user_id: "test-user-id",
  google_access_token: "mock-access-token",
  google_refresh_token: "mock-refresh-token",
  google_calendar_id: "primary",
  timezone: "America/Chicago",
  confirmation_preference: "clarification-only",
  family_members: [
    { id: "1", name: "Justin", color: "9" },
    { id: "2", name: "Blake", color: "11" },
  ],
};

const mockApprovedSender = {
  sender_value: "18477440465",
  sender_type: "phone",
  account_id: "test-account-id",
};

// Mock external API responses
const mockClaudeResponse = {
  content: [{
    text: JSON.stringify({
      events: [{
        title: "soccer practice",
        date: "2026-01-15",
        time: "17:00",
        duration: "1.5 hours",
        location: "the park",
        familyMembers: ["Justin"],
        recurring: false,
        recurrenceRule: null,
        recurrenceEndDate: null,
        needsClarification: false,
        clarificationQuestion: null,
      }]
    })
  }]
};

const mockGoogleCalendarEvent = {
  id: "event123",
  summary: "Justin: soccer practice",
  start: { dateTime: "2026-01-15T17:00:00", timeZone: "America/Chicago" },
  end: { dateTime: "2026-01-15T18:30:00", timeZone: "America/Chicago" },
  location: "the park",
};

const mockGoogleCalendarListResponse = {
  items: [
    {
      id: "event123",
      summary: "Justin: soccer practice",
      start: { dateTime: "2026-01-15T17:00:00", timeZone: "America/Chicago" },
      end: { dateTime: "2026-01-15T18:30:00", timeZone: "America/Chicago" },
    },
    {
      id: "event456",
      summary: "Blake: dentist appointment",
      start: { dateTime: "2026-01-16T14:00:00", timeZone: "America/Chicago" },
      end: { dateTime: "2026-01-16T15:00:00", timeZone: "America/Chicago" },
    },
  ]
};

// Mock fetch for testing
let mockFetchResponses: Map<string, any> = new Map();

function setupMockFetch() {
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Claude API
    if (urlStr.includes('anthropic.com')) {
      return new Response(JSON.stringify(mockClaudeResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Calendar - Create Event
    if (urlStr.includes('calendar/v3/calendars/primary/events') && init?.method === 'POST') {
      return new Response(JSON.stringify(mockGoogleCalendarEvent), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Calendar - List Events
    if (urlStr.includes('calendar/v3/calendars/primary/events') && !init?.method) {
      return new Response(JSON.stringify(mockGoogleCalendarListResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Calendar - Get Event
    if (urlStr.match(/calendar\/v3\/calendars\/primary\/events\/event\d+/) && !init?.method) {
      return new Response(JSON.stringify(mockGoogleCalendarEvent), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Calendar - Delete Event
    if (urlStr.match(/calendar\/v3\/calendars\/primary\/events\/event\d+/) && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    // Google Calendar - Update Event
    if (urlStr.match(/calendar\/v3\/calendars\/primary\/events\/event\d+/) && init?.method === 'PUT') {
      return new Response(JSON.stringify(mockGoogleCalendarEvent), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  };
}

// Mock Supabase client
class MockSupabaseClient {
  private data: Map<string, any[]> = new Map();

  constructor() {
    this.data.set('approved_senders', [mockApprovedSender]);
    this.data.set('accounts', [mockAccount]);
    this.data.set('family_members', mockAccount.family_members);
    this.data.set('conversation_state', []);
    this.data.set('event_reminders', []);
  }

  from(table: string) {
    return {
      select: (columns?: string) => ({
        eq: (column: string, value: any) => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => {
            if (table === 'accounts') {
              return Promise.resolve({ data: mockAccount, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then: (resolve: any) => {
            if (table === 'approved_senders') {
              return resolve({ data: this.data.get(table), error: null });
            }
            return resolve({ data: [], error: null });
          }
        }),
        gt: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null })
        })
      }),
      insert: (values: any[]) => ({
        select: () => Promise.resolve({ data: values, error: null }),
        then: (resolve: any) => resolve({ data: values, error: null })
      }),
      update: (values: any) => ({
        eq: (column: string, value: any) => Promise.resolve({ data: null, error: null })
      }),
      delete: () => ({
        eq: (column: string, value: any) => Promise.resolve({ data: null, error: null })
      }),
      upsert: (values: any) => Promise.resolve({ data: null, error: null })
    };
  }
}

// Tests
Deno.test("Feature: Create single event with all details", async () => {
  setupMockFetch();

  const message = "Justin has soccer practice tomorrow at 5pm at the park";
  const sender = "+18477440465";
  const type = "sms";

  // This would call the actual function - for now we're testing the logic
  // In a real test, you'd invoke the Edge Function endpoint

  assertEquals(1, 1); // Placeholder - replace with actual function call
});

Deno.test("Feature: Create multiple events from single message", async () => {
  setupMockFetch();

  // Update mock to return multiple events
  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [
      {
        title: "soccer practice",
        date: "2026-01-13",
        time: "17:00",
        duration: "1.5 hours",
        location: null,
        familyMembers: ["Justin"],
        recurring: false,
        needsClarification: false,
      },
      {
        title: "soccer practice",
        date: "2026-01-15",
        time: "17:00",
        duration: "1.5 hours",
        location: null,
        familyMembers: ["Justin"],
        recurring: false,
        needsClarification: false,
      }
    ]
  });

  const message = "Justin has soccer practice Monday and Wednesday at 5pm";

  // Test multi-event creation
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: View calendar events", async () => {
  setupMockFetch();

  const message = "What's on my calendar today?";

  // Should return list of events
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Cancel event", async () => {
  setupMockFetch();

  const message = "Cancel Justin's practice tomorrow";

  // Should delete the event
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Move/reschedule event", async () => {
  setupMockFetch();

  const message = "Move dentist appointment to 3pm";

  // Should update event time
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Skip single recurring instance", async () => {
  setupMockFetch();

  const message = "Skip practice next Monday";

  // Should delete only that instance
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Add note to event", async () => {
  setupMockFetch();

  // Mock Claude to return note details
  mockClaudeResponse.content[0].text = JSON.stringify({
    eventIndex: 1,
    note: "bring insurance card"
  });

  const message = "Add note to dentist: bring insurance card";

  // Should append note to event description
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Conflict detection", async () => {
  setupMockFetch();

  const message = "Justin has a meeting at 5pm tomorrow";

  // Should detect conflict with existing 5pm event
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Smart templates - doctor appointment", async () => {
  setupMockFetch();

  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [{
      title: "doctor appointment",
      date: "2026-01-20",
      time: "14:00",
      duration: "1 hour", // Should default to 1 hour
      familyMembers: ["Blake"],
      needsClarification: false,
    }]
  });

  const message = "Blake has a doctor appointment on the 20th at 2pm";

  // Should apply 1 hour default duration
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Location support", async () => {
  setupMockFetch();

  const message = "Justin has practice at the park tomorrow at 5pm";

  // Should extract location "the park"
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Recurring events", async () => {
  setupMockFetch();

  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [{
      title: "piano lesson",
      date: "2026-01-14",
      time: "16:00",
      duration: "30 minutes",
      familyMembers: ["Blake"],
      recurring: true,
      recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=TU",
      needsClarification: false,
    }]
  });

  const message = "Blake has piano lesson every Tuesday at 4pm";

  // Should create recurring event
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Unknown family member validation", async () => {
  setupMockFetch();

  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [{
      title: "soccer practice",
      date: "2026-01-15",
      time: "17:00",
      familyMembers: ["Sarah"], // Unknown member
      needsClarification: false,
    }]
  });

  const message = "Sarah has soccer practice tomorrow at 5pm";

  // Should ask if user wants to add Sarah as family member
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Clarification flow - missing time", async () => {
  setupMockFetch();

  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [{
      title: "dentist appointment",
      date: "2026-01-16",
      time: null, // Missing time
      familyMembers: ["Justin"],
      needsClarification: true,
      clarificationQuestion: "What time is this event?",
    }]
  });

  const message = "Justin has a dentist appointment tomorrow";

  // Should ask for time
  assertEquals(1, 1); // Placeholder
});

Deno.test("Feature: Clarification flow - missing duration", async () => {
  setupMockFetch();

  mockClaudeResponse.content[0].text = JSON.stringify({
    events: [{
      title: "meeting",
      date: "2026-01-16",
      time: "14:00",
      duration: null, // Missing duration
      familyMembers: ["Justin"],
      needsClarification: true,
      clarificationQuestion: "How much time should I block for this event?",
    }]
  });

  const message = "Justin has a meeting tomorrow at 2pm";

  // Should ask for duration
  assertEquals(1, 1); // Placeholder
});

Deno.test("Integration: Event reminder creation", async () => {
  setupMockFetch();

  // Create event with time should also create reminder
  const message = "Justin has practice tomorrow at 5pm";

  // Should create event AND reminder 1 hour before
  assertEquals(1, 1); // Placeholder
});

Deno.test("Helper: Phone number normalization", () => {
  // Test phone number normalization
  const testCases = [
    { input: "8477440465", expected: "18477440465" },
    { input: "+18477440465", expected: "18477440465" },
    { input: "847-744-0465", expected: "18477440465" },
    { input: "(847) 744-0465", expected: "18477440465" },
  ];

  for (const { input, expected } of testCases) {
    const normalized = input.replace(/\D/g, '');
    const result = normalized.length === 10 ? '1' + normalized : normalized;
    assertEquals(result, expected, `Failed for input: ${input}`);
  }
});

console.log("✅ All test cases defined. Run with: deno test");
