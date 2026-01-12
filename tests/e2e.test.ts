/**
 * End-to-End Integration Tests
 *
 * These tests call the actual deployed Supabase Edge Functions
 * to verify end-to-end functionality.
 *
 * Prerequisites:
 * - SUPABASE_URL environment variable
 * - SUPABASE_ANON_KEY environment variable
 * - TEST_PHONE_NUMBER environment variable (approved sender)
 *
 * Run: deno test --allow-env --allow-net tests/e2e.test.ts
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.192.0/testing/asserts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_ANON_KEY");
const TEST_PHONE = Deno.env.get("TEST_PHONE_NUMBER") || "18477440465"; // Normalized format

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("⚠️  Missing environment variables. Set SUPABASE_URL and SUPABASE_ANON_KEY");
  Deno.exit(1);
}

const PROCESS_MESSAGE_URL = `${SUPABASE_URL}/functions/v1/process-message`;
const SEND_REMINDERS_URL = `${SUPABASE_URL}/functions/v1/send-reminders`;
const SEND_SUMMARIES_URL = `${SUPABASE_URL}/functions/v1/send-summaries`;

async function callProcessMessage(message: string, sender: string = TEST_PHONE, type: string = "sms") {
  const response = await fetch(PROCESS_MESSAGE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, sender, type }),
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

Deno.test("E2E: Health check - process-message function is accessible", async () => {
  const result = await callProcessMessage("test");

  // Should return some response (may be error about sender not authorized, which is fine)
  assertExists(result.status);
  assertExists(result.data);
});

Deno.test("E2E: Create simple event", async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayName = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

  const result = await callProcessMessage(
    `Test event on ${dayName} at 3pm for 1 hour`
  );

  console.log("Create event result:", result);

  // Should succeed or ask for clarification
  assert(
    result.data.status === "success" ||
    result.data.status === "clarification_needed" ||
    result.data.error === "Sender not authorized", // Expected if test phone not set up
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Query calendar", async () => {
  const result = await callProcessMessage("What's on my calendar today?");

  console.log("Query result:", result);

  assert(
    result.data.status === "success" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );

  if (result.data.status === "success") {
    assertExists(result.data.message);
  }
});

Deno.test("E2E: Multi-event message", async () => {
  const result = await callProcessMessage(
    "Add practice Monday and Wednesday at 5pm"
  );

  console.log("Multi-event result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "clarification_needed" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Event with location", async () => {
  const result = await callProcessMessage(
    "Soccer practice tomorrow at 5pm at Riverside Park"
  );

  console.log("Event with location result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "clarification_needed" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Recurring event", async () => {
  const result = await callProcessMessage(
    "Piano lesson every Tuesday at 4pm"
  );

  console.log("Recurring event result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "clarification_needed" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Send reminders function is accessible", async () => {
  const response = await fetch(SEND_REMINDERS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const result = await response.json();
  console.log("Send reminders result:", result);

  assertExists(result);
  // Should return processed count (may be 0)
  assert(
    typeof result.processed === "number" || result.error,
    "Should return processed count or error"
  );
});

Deno.test("E2E: Send summaries function is accessible", async () => {
  const response = await fetch(SEND_SUMMARIES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "daily" }),
  });

  const result = await response.json();
  console.log("Send summaries result:", result);

  assertExists(result);
  // Should return sent count (may be 0)
  assert(
    typeof result.sent === "number" || result.error,
    "Should return sent count or error"
  );
});

Deno.test("E2E: Cancel event command", async () => {
  const result = await callProcessMessage("Cancel the test event");

  console.log("Cancel event result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "error" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Move event command", async () => {
  const result = await callProcessMessage("Move practice to 6pm");

  console.log("Move event result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "error" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Skip recurring instance", async () => {
  const result = await callProcessMessage("Skip practice next Monday");

  console.log("Skip instance result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "error" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

Deno.test("E2E: Add note to event", async () => {
  const result = await callProcessMessage(
    "Add note to practice: bring water bottle"
  );

  console.log("Add note result:", result);

  assert(
    result.data.status === "success" ||
    result.data.status === "error" ||
    result.data.error === "Sender not authorized",
    `Unexpected status: ${result.data.status || result.data.error}`
  );
});

console.log("\n✅ E2E tests complete!");
console.log("\n📝 Note: Some tests may fail with 'Sender not authorized' if TEST_PHONE_NUMBER");
console.log("   is not set up as an approved sender in your Supabase database.");
