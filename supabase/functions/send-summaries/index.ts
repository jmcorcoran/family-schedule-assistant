import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

Deno.serve(async (req) => {
  try {
    const { type } = await req.json(); // "daily" or "weekly"
    console.log(`Sending ${type} summaries...`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get all accounts with approved senders (people who can receive SMS)
    const { data: approvedSenders, error } = await supabase
      .from("approved_senders")
      .select("*, accounts(*)")
      .eq("sender_type", "phone");

    if (error) {
      console.error("Error fetching approved senders:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch accounts" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!approvedSenders || approvedSenders.length === 0) {
      console.log("No approved senders found");
      return new Response(
        JSON.stringify({ sent: 0, message: "No approved senders" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    // Group by account to avoid duplicate summaries
    const accountMap = new Map();
    for (const sender of approvedSenders) {
      if (!accountMap.has(sender.account_id)) {
        accountMap.set(sender.account_id, {
          account: sender.accounts,
          phones: [sender.sender_value],
        });
      } else {
        accountMap.get(sender.account_id).phones.push(sender.sender_value);
      }
    }

    // Send summary to each account
    for (const [accountId, { account, phones }] of accountMap) {
      try {
        // Determine time range based on summary type
        const now = new Date();
        let timeMin, timeMax, summaryTitle;

        if (type === "daily") {
          // Today's events
          const todayStart = new Date(now);
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(now);
          todayEnd.setHours(23, 59, 59, 999);

          timeMin = todayStart.toISOString();
          timeMax = todayEnd.toISOString();
          summaryTitle = "Today's Schedule";
        } else {
          // This week's events
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + 7);

          timeMin = now.toISOString();
          timeMax = weekEnd.toISOString();
          summaryTitle = "This Week's Schedule";
        }

        // Get events from Google Calendar
        const events = await getCalendarEvents(
          account.google_access_token,
          account.google_refresh_token,
          timeMin,
          timeMax,
          account.timezone || "America/Chicago",
          supabase
        );

        if (!events || events.length === 0) {
          console.log(`No events for account ${accountId}`);
          continue;
        }

        // Format summary message
        const timezone = account.timezone || "America/Chicago";
        const eventList = events.slice(0, 10).map((event: any) => {
          const start = new Date(event.start.dateTime || event.start.date);
          const dateStr = start.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: timezone
          });
          const timeStr = event.start.dateTime
            ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })
            : "All day";

          return `• ${event.summary} - ${dateStr} at ${timeStr}`;
        }).join("\n");

        const moreEvents = events.length > 10 ? `\n...and ${events.length - 10} more` : "";
        const message = `${summaryTitle}:\n\n${eventList}${moreEvents}`;

        // Send SMS to all approved phones for this account
        for (const phone of phones) {
          try {
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
                  To: `+${phone}`,
                  Body: message,
                }),
              }
            );

            if (twilioResponse.ok) {
              sent++;
              console.log(`Sent ${type} summary to ${phone}`);
            } else {
              const error = await twilioResponse.text();
              console.error(`Failed to send to ${phone}:`, error);
              failed++;
            }
          } catch (err) {
            console.error(`Error sending to ${phone}:`, err);
            failed++;
          }
        }
      } catch (err) {
        console.error(`Error processing account ${accountId}:`, err);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ sent, failed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-summaries function:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Get events from Google Calendar
async function getCalendarEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: string,
  timeMax: string,
  timezone: string,
  supabase: any
): Promise<any[]> {
  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&` +
    `timeMax=${encodeURIComponent(timeMax)}&` +
    `singleEvents=true&` +
    `orderBy=startTime&` +
    `maxResults=50`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // Refresh token if needed
  if (response.status === 401) {
    const newAccessToken = await refreshGoogleToken(refreshToken);
    await supabase
      .from("accounts")
      .update({ google_access_token: newAccessToken })
      .eq("google_refresh_token", refreshToken);

    response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true&` +
      `orderBy=startTime&` +
      `maxResults=50`,
      {
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
        },
      }
    );
  }

  if (!response.ok) {
    console.error("Error fetching calendar events");
    return [];
  }

  const data = await response.json();
  return data.items || [];
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
