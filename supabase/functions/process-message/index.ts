import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface EventDetails {
  title: string;
  date: string;
  time?: string;
  duration?: string;
  familyMembers: string[];
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

Deno.serve(async (req) => {
  try {
    console.log("Processing incoming message...");

    // Parse the incoming request
    const { message, sender, type } = await req.json();

    if (!message || !sender) {
      return new Response(
        JSON.stringify({ error: "Missing message or sender" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Received ${type} from ${sender}: ${message}`);

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Find the account by sender (phone or email)
    const senderType = type === "sms" ? "phone" : "email";
    const { data: approvedSenders } = await supabase
      .from("approved_senders")
      .select("account_id")
      .eq("sender_type", senderType)
      .eq("sender_value", sender);

    if (!approvedSenders || approvedSenders.length === 0) {
      console.log("Sender not approved:", sender);
      return new Response(
        JSON.stringify({ error: "Sender not authorized" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const accountId = approvedSenders[0].account_id;
    console.log("Found account:", accountId);

    // Get account details including family members
    const { data: account } = await supabase
      .from("accounts")
      .select("*, family_members(*)")
      .eq("id", accountId)
      .single();

    if (!account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse the message using Claude
    const eventDetails = await parseMessageWithClaude(
      message,
      account.family_members.map((m: any) => m.name),
      account.confirmation_preference
    );

    console.log("Parsed event:", eventDetails);

    // Check if clarification is needed
    if (eventDetails.needsClarification) {
      return new Response(
        JSON.stringify({
          status: "clarification_needed",
          message: eventDetails.clarificationQuestion,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Add event to Google Calendar
    const calendarEventId = await addToGoogleCalendar(
      account.google_access_token,
      account.google_refresh_token,
      eventDetails
    );

    console.log("Event added to calendar:", calendarEventId);

    // Return success response
    return new Response(
      JSON.stringify({
        status: "success",
        message: `Event "${eventDetails.title}" added to calendar for ${eventDetails.familyMembers.join(", ")}`,
        eventId: calendarEventId,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing message:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function parseMessageWithClaude(
  message: string,
  familyMembers: string[],
  confirmationPref: string
): Promise<EventDetails> {
  const prompt = `You are a smart calendar assistant. Parse the following message and extract event details.

Family members: ${familyMembers.join(", ")}

Message: "${message}"

Extract:
1. Event title/description
2. Date (convert relative dates like "tomorrow", "next Monday" to ISO format YYYY-MM-DD based on today being ${new Date().toISOString().split('T')[0]})
3. Time (if mentioned, in HH:MM format)
4. Duration (if mentioned)
5. Which family members this event is for (match names from the family members list)

If the message is unclear or missing critical information (date, title, or family member), set needsClarification to true and provide a clarificationQuestion.

Respond ONLY with a JSON object in this exact format:
{
  "title": "event title",
  "date": "YYYY-MM-DD",
  "time": "HH:MM" or null,
  "duration": "duration string" or null,
  "familyMembers": ["name1", "name2"],
  "needsClarification": false,
  "clarificationQuestion": null
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const result = await response.json();
  const content = result.content[0].text;

  console.log("Claude response:", content);

  // Parse the JSON response
  const eventDetails = JSON.parse(content);
  return eventDetails;
}

async function addToGoogleCalendar(
  accessToken: string,
  refreshToken: string,
  eventDetails: EventDetails
): Promise<string> {
  // Build the event object
  const event: any = {
    summary: eventDetails.title,
    description: `Family members: ${eventDetails.familyMembers.join(", ")}`,
  };

  // Handle date and time
  if (eventDetails.time) {
    // Event with specific time
    const startDateTime = `${eventDetails.date}T${eventDetails.time}:00`;
    event.start = {
      dateTime: startDateTime,
      timeZone: "America/New_York", // TODO: Make this configurable
    };

    // Calculate end time (default 1 hour if no duration specified)
    let endDateTime = startDateTime;
    if (eventDetails.duration) {
      // Simple duration parsing (e.g., "1 hour", "30 minutes")
      // In production, you'd want more robust parsing
      endDateTime = startDateTime; // TODO: Add duration logic
    } else {
      // Default 1 hour
      const end = new Date(startDateTime);
      end.setHours(end.getHours() + 1);
      endDateTime = end.toISOString().slice(0, 16);
    }

    event.end = {
      dateTime: endDateTime,
      timeZone: "America/New_York",
    };
  } else {
    // All-day event
    event.start = {
      date: eventDetails.date,
    };
    event.end = {
      date: eventDetails.date,
    };
  }

  // Add to Google Calendar
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }

  const result = await response.json();
  return result.id;
}
