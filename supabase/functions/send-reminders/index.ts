import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

Deno.serve(async (req) => {
  try {
    console.log("Checking for pending reminders...");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Find reminders that are due (reminder_time <= now and message_sent = false)
    const now = new Date().toISOString();
    const { data: reminders, error } = await supabase
      .from("event_reminders")
      .select("*, accounts(sms_number, google_access_token, google_refresh_token, google_calendar_id)")
      .lte("reminder_time", now)
      .eq("message_sent", false)
      .limit(50); // Process up to 50 reminders at a time

    if (error) {
      console.error("Error fetching reminders:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch reminders" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reminders || reminders.length === 0) {
      console.log("No pending reminders found");
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending reminders" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reminders.length} pending reminders`);

    let processed = 0;
    let failed = 0;

    // Process each reminder
    for (const reminder of reminders) {
      try {
        // Get event details from Google Calendar
        const eventDetails = await getEventDetails(
          reminder.google_event_id,
          reminder.accounts.google_access_token,
          reminder.accounts.google_refresh_token
        );

        if (!eventDetails) {
          console.log(`Event ${reminder.google_event_id} not found, skipping`);
          // Mark as sent anyway to avoid retrying
          await supabase
            .from("event_reminders")
            .update({ message_sent: true, sent_at: new Date().toISOString() })
            .eq("id", reminder.id);
          continue;
        }

        // Format reminder message
        const startDate = new Date(eventDetails.start.dateTime || eventDetails.start.date);
        const dateStr = startDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const timeStr = eventDetails.start.dateTime
          ? startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "All day";

        const message = `Reminder: ${eventDetails.summary} - ${dateStr} at ${timeStr}`;

        // Send SMS via Twilio
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            },
            body: new URLSearchParams({
              From: TWILIO_PHONE_NUMBER!,
              To: `+${reminder.recipient_phone}`,
              Body: message,
            }),
          }
        );

        if (!twilioResponse.ok) {
          const error = await twilioResponse.text();
          console.error(`Failed to send SMS for reminder ${reminder.id}:`, error);
          failed++;
          continue;
        }

        // Mark reminder as sent
        await supabase
          .from("event_reminders")
          .update({ message_sent: true, sent_at: new Date().toISOString() })
          .eq("id", reminder.id);

        processed++;
        console.log(`Sent reminder for event ${eventDetails.summary}`);
      } catch (err) {
        console.error(`Error processing reminder ${reminder.id}:`, err);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        failed,
        total: reminders.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-reminders function:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Get event details from Google Calendar
async function getEventDetails(
  eventId: string,
  accessToken: string,
  refreshToken: string
): Promise<any> {
  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // Refresh token if needed
  if (response.status === 401) {
    const newAccessToken = await refreshGoogleToken(refreshToken);
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    await supabase
      .from("accounts")
      .update({ google_access_token: newAccessToken })
      .eq("google_refresh_token", refreshToken);

    response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
        },
      }
    );
  }

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

// Refresh Google access token
async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}
