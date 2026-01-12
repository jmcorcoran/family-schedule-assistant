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
  location?: string;
  familyMembers: string[];
  needsClarification?: boolean;
  clarificationQuestion?: string;
  recurring?: boolean;
  recurrenceRule?: string; // RRULE format for Google Calendar
  recurrenceEndDate?: string | null; // End date for recurring events (YYYY-MM-DD), null means no end date
  _askedForEndDate?: boolean; // Internal flag to track if we've asked the user
  _unknownMembers?: string[]; // Internal flag for unknown family members
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

    // Normalize phone numbers to E.164 format without + (e.g., +18477440465 -> 18477440465)
    let normalizedSender = sender;
    if (senderType === "phone") {
      // Strip all non-numeric characters
      normalizedSender = sender.replace(/\D/g, '');
      // If it's 10 digits, add US country code
      if (normalizedSender.length === 10) {
        normalizedSender = '1' + normalizedSender;
      }
    }

    console.log(`Normalized sender: ${sender} -> ${normalizedSender}`);

    const { data: approvedSenders } = await supabase
      .from("approved_senders")
      .select("account_id")
      .eq("sender_type", senderType)
      .eq("sender_value", normalizedSender);

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

    // Check if there's an ongoing conversation for this sender
    const { data: conversationState } = await supabase
      .from("conversation_state")
      .select("*")
      .eq("account_id", accountId)
      .eq("sender_value", normalizedSender)
      .eq("sender_type", senderType)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let eventDetails: EventDetails;

    if (conversationState) {
      // Continuing an existing conversation
      console.log("Continuing conversation, awaiting:", conversationState.awaiting_field);
      console.log("User response:", message);

      // Get the partial event and update it with the user's response
      eventDetails = conversationState.partial_event as EventDetails;

      // Update the field we were waiting for
      if (conversationState.awaiting_field === "time") {
        eventDetails.time = await extractTime(message);
      } else if (conversationState.awaiting_field === "duration") {
        eventDetails.duration = message;
      } else if (conversationState.awaiting_field === "end_date") {
        eventDetails._askedForEndDate = true;
        if (message.toLowerCase().includes("no end")) {
          eventDetails.recurrenceEndDate = null;
        } else {
          eventDetails.recurrenceEndDate = await extractDate(message, account.timezone || "America/Chicago");
        }
      } else if (conversationState.awaiting_field === "add_family_member") {
        // User is responding to "do you want to add this family member?"
        const response = message.toLowerCase().trim();

        if (response.includes("yes") || response.includes("y")) {
          // Add the unknown family members
          const unknownMembers = conversationState.partial_event._unknownMembers || [];

          for (const memberName of unknownMembers) {
            await supabase
              .from("family_members")
              .insert({
                account_id: accountId,
                name: memberName,
              });
          }

          console.log(`Added new family members: ${unknownMembers.join(", ")}`);

          // Remove the _unknownMembers marker
          delete eventDetails._unknownMembers;

          // Now continue with normal clarification flow (don't return yet)
        } else {
          // User said no - abort event creation
          await supabase
            .from("conversation_state")
            .delete()
            .eq("id", conversationState.id);

          return new Response(
            JSON.stringify({
              status: "cancelled",
              message: "No problem! No event was created. Text me anytime to create a new event.",
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
      } else if (conversationState.awaiting_field === "conflict_confirmation") {
        // User is responding to conflict warning
        const response = message.toLowerCase().trim();

        if (response.includes("add anyway") || response.includes("proceed") || response.includes("yes")) {
          // User wants to proceed despite conflict - skip conflict check and add event
          await supabase
            .from("conversation_state")
            .delete()
            .eq("id", conversationState.id);

          // Get event color
          let eventColor = null;
          if (eventDetails.familyMembers && eventDetails.familyMembers.length > 0) {
            const primaryMember = eventDetails.familyMembers[0];
            const memberData = account.family_members.find(
              (m: any) => m.name.toLowerCase() === primaryMember.toLowerCase()
            );
            if (memberData && memberData.color) {
              eventColor = memberData.color;
            }
          }

          // Add event to calendar (bypassing conflict check)
          const calendarEventId = await addToGoogleCalendar(
            account.google_access_token,
            account.google_refresh_token,
            eventDetails,
            account.timezone || "America/Chicago",
            eventColor
          );

          // Create reminder
          if (eventDetails.time && eventDetails.date) {
            try {
              const eventStartTime = new Date(`${eventDetails.date}T${eventDetails.time}:00`);
              const reminderTime = new Date(eventStartTime.getTime() - 60 * 60 * 1000);
              if (reminderTime > new Date()) {
                await supabase.from("event_reminders").insert([{
                  account_id: accountId,
                  google_event_id: calendarEventId,
                  reminder_time: reminderTime.toISOString(),
                  recipient_phone: normalizedSender,
                }]);
              }
            } catch (reminderError) {
              console.error("Failed to create reminder:", reminderError);
            }
          }

          return new Response(
            JSON.stringify({
              status: "success",
              message: `Event "${eventDetails.title}" added to calendar for ${eventDetails.familyMembers.join(", ")}`,
              eventId: calendarEventId,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        } else {
          // User wants to cancel
          await supabase
            .from("conversation_state")
            .delete()
            .eq("id", conversationState.id);

          return new Response(
            JSON.stringify({
              status: "cancelled",
              message: "No problem! Event was not created.",
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // Delete the conversation state
      await supabase
        .from("conversation_state")
        .delete()
        .eq("id", conversationState.id);

      // Check if we need more clarifications
      const needsMore = checkForClarifications(eventDetails);
      if (needsMore) {
        // Save updated state and ask next question
        await supabase
          .from("conversation_state")
          .insert({
            account_id: accountId,
            sender_value: normalizedSender,
            sender_type: senderType,
            partial_event: eventDetails,
            awaiting_field: needsMore.field,
          });

        return new Response(
          JSON.stringify({
            status: "clarification_needed",
            message: needsMore.question,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      // Check if this is a query/management request (not creating an event)
      const managementAction = detectManagementAction(message);

      if (managementAction) {
        console.log("Detected management action:", managementAction.type);

        const result = await handleManagementAction(
          managementAction,
          message,
          account,
          accountId,
          supabase
        );

        return new Response(
          JSON.stringify(result),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // New conversation - parse the message using Claude to create an event
      const parseResult = await parseMessageWithClaude(
        message,
        account.family_members.map((m: any) => m.name),
        account.confirmation_preference,
        account.timezone || "America/Chicago"
      );

      console.log("Parsed result:", parseResult);

      // Handle multi-event messages
      if (parseResult.events && parseResult.events.length > 1) {
        // Multiple events detected - process them all
        const createdEvents = [];
        for (const event of parseResult.events) {
          try {
            // Get event color
            let eventColor = null;
            if (event.familyMembers && event.familyMembers.length > 0) {
              const primaryMember = event.familyMembers[0];
              const memberData = account.family_members.find(
                (m: any) => m.name.toLowerCase() === primaryMember.toLowerCase()
              );
              if (memberData && memberData.color) {
                eventColor = memberData.color;
              }
            }

            // Create event (skip conflict detection for multi-event messages)
            const calendarEventId = await addToGoogleCalendar(
              account.google_access_token,
              account.google_refresh_token,
              event,
              account.timezone || "America/Chicago",
              eventColor
            );

            // Create reminder
            if (event.time && event.date) {
              try {
                const eventStartTime = new Date(`${event.date}T${event.time}:00`);
                const reminderTime = new Date(eventStartTime.getTime() - 60 * 60 * 1000);
                if (reminderTime > new Date()) {
                  await supabase.from("event_reminders").insert([{
                    account_id: accountId,
                    google_event_id: calendarEventId,
                    reminder_time: reminderTime.toISOString(),
                    recipient_phone: normalizedSender,
                  }]);
                }
              } catch (reminderError) {
                console.error("Failed to create reminder:", reminderError);
              }
            }

            createdEvents.push(event.title);
          } catch (error) {
            console.error(`Failed to create event "${event.title}":`, error);
          }
        }

        return new Response(
          JSON.stringify({
            status: "success",
            message: `Created ${createdEvents.length} events: ${createdEvents.join(", ")}`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // Single event - extract it and continue with normal flow
      eventDetails = parseResult.events[0];
      console.log("Parsed event:", eventDetails);

      // Check for unknown family members FIRST (before other clarifications)
      if (eventDetails.familyMembers && eventDetails.familyMembers.length > 0) {
        const knownMembers = account.family_members.map((m: any) => m.name.toLowerCase());
        const unknownMembers = eventDetails.familyMembers.filter(
          (name: string) => !knownMembers.includes(name.toLowerCase())
        );

        if (unknownMembers.length > 0) {
          // Ask if user wants to add the unknown family member(s)
          const memberList = unknownMembers.join(", ");
          const question = unknownMembers.length === 1
            ? `I don't recognize "${memberList}" as a family member. Would you like to add them to your family? (Yes/No)`
            : `I don't recognize these family members: ${memberList}. Would you like to add them to your family? (Yes/No)`;

          // Save conversation state with the full event but mark unknown members separately
          await supabase
            .from("conversation_state")
            .insert({
              account_id: accountId,
              sender_value: normalizedSender,
              sender_type: senderType,
              partial_event: {
                ...eventDetails,
                _unknownMembers: unknownMembers, // Store which ones are unknown
              },
              awaiting_field: "add_family_member",
            });

          return new Response(
            JSON.stringify({
              status: "clarification_needed",
              message: question,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // Check if clarification is needed
      if (eventDetails.needsClarification) {
        // Determine which field we're asking for
        let awaitingField = "time";
        if (eventDetails.clarificationQuestion?.toLowerCase().includes("block")) {
          awaitingField = "duration";
        } else if (eventDetails.clarificationQuestion?.toLowerCase().includes("end")) {
          awaitingField = "end_date";
        }

        // Save conversation state
        await supabase
          .from("conversation_state")
          .insert({
            account_id: accountId,
            sender_value: normalizedSender,
            sender_type: senderType,
            partial_event: eventDetails,
            awaiting_field: awaitingField,
          });

        return new Response(
          JSON.stringify({
            status: "clarification_needed",
            message: eventDetails.clarificationQuestion,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Get the color for the primary family member (first in the list)
    let eventColor = null;
    if (eventDetails.familyMembers && eventDetails.familyMembers.length > 0) {
      const primaryMember = eventDetails.familyMembers[0];
      const memberData = account.family_members.find(
        (m: any) => m.name.toLowerCase() === primaryMember.toLowerCase()
      );
      if (memberData && memberData.color) {
        eventColor = memberData.color;
      }
    }

    // Check for conflicts before adding the event
    if (eventDetails.time && eventDetails.date) {
      const conflicts = await checkForConflicts(
        account.google_access_token,
        account.google_refresh_token,
        eventDetails,
        account.timezone || "America/Chicago"
      );

      if (conflicts.length > 0) {
        const conflictList = conflicts.map((event: any) => {
          const start = new Date(event.start.dateTime || event.start.date);
          const timeStr = event.start.dateTime
            ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: account.timezone || "America/Chicago" })
            : "All day";
          return `"${event.summary}" at ${timeStr}`;
        }).join(", ");

        // Save event details to conversation state for potential override
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await supabase
          .from("conversation_state")
          .upsert({
            account_id: accountId,
            sender_value: normalizedSender,
            sender_type: senderType,
            partial_event: eventDetails,
            awaiting_field: "conflict_confirmation",
            expires_at: expiresAt.toISOString(),
          });

        return new Response(
          JSON.stringify({
            status: "conflict",
            message: `Warning: This event conflicts with: ${conflictList}. Reply "add anyway" to proceed or "cancel" to cancel.`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Add event to Google Calendar
    const calendarEventId = await addToGoogleCalendar(
      account.google_access_token,
      account.google_refresh_token,
      eventDetails,
      account.timezone || "America/Chicago",
      eventColor
    );

    console.log("Event added to calendar:", calendarEventId);

    // Create reminder for the event (1 hour before)
    if (eventDetails.time && eventDetails.date) {
      try {
        // Calculate reminder time (1 hour before event start)
        const eventStartTime = new Date(`${eventDetails.date}T${eventDetails.time}:00`);
        const reminderTime = new Date(eventStartTime.getTime() - 60 * 60 * 1000); // 1 hour before

        // Only create reminder if it's in the future
        if (reminderTime > new Date()) {
          await supabase.from("event_reminders").insert([{
            account_id: accountId,
            google_event_id: calendarEventId,
            reminder_time: reminderTime.toISOString(),
            recipient_phone: normalizedSender,
          }]);
          console.log(`Reminder scheduled for ${reminderTime.toISOString()}`);
        }
      } catch (reminderError) {
        console.error("Failed to create reminder:", reminderError);
        // Don't fail the whole operation if reminder creation fails
      }
    }

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
  confirmationPref: string,
  timezone: string
): Promise<EventDetails> {
  console.log("ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
  console.log("API key first 10 chars:", ANTHROPIC_API_KEY?.substring(0, 10));

  // Get current date in the user's timezone
  const now = new Date();
  const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const todayStr = userTime.toISOString().split('T')[0];
  const dayOfWeek = userTime.toLocaleDateString("en-US", { weekday: 'long', timeZone: timezone });

  console.log("Current date calculation:", { todayStr, dayOfWeek, timezone, utcNow: now.toISOString() });

  const prompt = `You are a smart calendar assistant. Parse the following message and extract event details.

Today is ${dayOfWeek}, ${todayStr}.

Family members: ${familyMembers.join(", ")}

Message: "${message}"

Extract:
1. Event title/description (e.g., "meeting about baseball")
2. Date (convert relative dates like "tomorrow", "next Monday" to ISO format YYYY-MM-DD based on today being ${todayStr}. For recurring events, use the date of the FIRST occurrence)
3. Time (if mentioned, in HH:MM format, 24-hour)
4. Duration - Look for phrases like:
   - "for 1 hour" → "1 hour"
   - "for 30 minutes" → "30 minutes"
   - "1.5 hours" → "1.5 hours"
   - "90 minutes" → "90 minutes"
   - If duration is clearly stated, extract it
5. Location (if mentioned, e.g., "at the park", "at 123 Main St", "at school", "at home")
6. Which family members this event is for (match names from the family members list)
7. Recurring pattern (detect phrases like "every Monday", "every week", "daily", "every Saturday", etc.)
8. End date for recurring events (if mentioned, e.g., "until December", "for 6 weeks")

For recurring events, generate a recurrenceRule in Google Calendar RRULE format:
- "every day" or "daily" -> "RRULE:FREQ=DAILY"
- "every week" or "weekly" -> "RRULE:FREQ=WEEKLY"
- "every Monday" -> "RRULE:FREQ=WEEKLY;BYDAY=MO"
- "every Tuesday" -> "RRULE:FREQ=WEEKLY;BYDAY=TU"
- "every Wednesday" -> "RRULE:FREQ=WEEKLY;BYDAY=WE"
- "every Thursday" -> "RRULE:FREQ=WEEKLY;BYDAY=TH"
- "every Friday" -> "RRULE:FREQ=WEEKLY;BYDAY=FR"
- "every Saturday" -> "RRULE:FREQ=WEEKLY;BYDAY=SA"
- "every Sunday" -> "RRULE:FREQ=WEEKLY;BYDAY=SU"
- "every month" or "monthly" -> "RRULE:FREQ=MONTHLY"

IMPORTANT CLARIFICATION RULES (check in this order, only ask ONE question):
1. If NO time is specified -> set needsClarification=true and ask "What time is this event?"
2. Else if time IS specified but NO duration (check carefully - "for 1 hour", "1 hour long", "30 minutes" all count as duration) -> set needsClarification=true and ask "How much time should I block for this event?"
3. Else if event is recurring but NO end date specified -> set needsClarification=true and ask "When should this recurring event end? (provide a date or say 'no end date')"
4. Else if missing critical info (title or family member) -> set needsClarification=true with appropriate question

IMPORTANT: If the message includes duration information (like "for 1 hour", "30 minutes", "1.5 hours"), make sure to extract it to the duration field so we don't ask for it again.

SMART TEMPLATES - Apply intelligent defaults based on event type:
- "doctor appointment" / "dentist" / "medical" -> default duration "1 hour" if not specified
- "soccer practice" / "basketball practice" / "sports practice" -> default duration "1.5 hours" if not specified
- "meeting" / "conference call" -> default duration "1 hour" if not specified
- "birthday party" / "party" -> default duration "2 hours" if not specified
- "lunch" / "dinner" / "breakfast" -> default duration "1 hour" if not specified
- "piano lesson" / "guitar lesson" / "music lesson" -> default duration "30 minutes" if not specified

MULTI-EVENT DETECTION:
If the message describes multiple distinct events (e.g., "Justin has practice Monday and Wednesday" or "Add dentist on Tuesday and meeting on Friday"), extract each as a separate event in the events array.
- "Justin has practice Monday and Wednesday at 5pm" -> 2 events (one Monday, one Wednesday)
- "Add soccer practice at 5pm and piano lesson at 6pm tomorrow" -> 2 events
For single events, still return an array with one event.

Respond ONLY with a JSON object in this exact format:
{
  "events": [
    {
      "title": "event title",
      "date": "YYYY-MM-DD",
      "time": "HH:MM" or null,
      "duration": "duration string" or null,
      "location": "location string" or null,
      "familyMembers": ["name1", "name2"],
      "recurring": true or false,
      "recurrenceRule": "RRULE:FREQ=..." or null,
      "recurrenceEndDate": "YYYY-MM-DD" or null,
      "needsClarification": false,
      "clarificationQuestion": null
    }
  ]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
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

async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

  console.log("Refreshing Google OAuth token...");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const result = await response.json();
  console.log("Token refreshed successfully");
  return result.access_token;
}

async function addToGoogleCalendar(
  accessToken: string,
  refreshToken: string,
  eventDetails: EventDetails,
  timezone: string,
  colorId?: string | null
): Promise<string> {
  console.log("Creating Google Calendar event:", eventDetails);

  // Build the event object
  // Include family member name in title if specified
  let eventTitle = eventDetails.title;
  if (eventDetails.familyMembers && eventDetails.familyMembers.length > 0) {
    const memberNames = eventDetails.familyMembers.join(" & ");
    eventTitle = `${memberNames}: ${eventDetails.title}`;
  }

  const event: any = {
    summary: eventTitle,
    description: eventDetails.familyMembers?.length > 0
      ? `Family members: ${eventDetails.familyMembers.join(", ")}`
      : undefined,
  };

  // Add color if specified
  if (colorId) {
    event.colorId = colorId;
    console.log(`Applying color ${colorId} to event`);
  }

  // Add location if specified
  if (eventDetails.location) {
    event.location = eventDetails.location;
    console.log(`Adding location: ${eventDetails.location}`);
  }

  // Handle date and time
  if (eventDetails.time) {
    // Event with specific time - use timezone-aware datetime
    // Create start time in user's timezone
    const startDateTime = `${eventDetails.date}T${eventDetails.time}:00`;
    event.start = {
      dateTime: startDateTime,
      timeZone: timezone,
    };

    // Calculate end time based on duration
    const startDate = new Date(eventDetails.date + "T" + eventDetails.time + ":00");
    let durationMinutes = 60; // Default 1 hour

    if (eventDetails.duration) {
      // Parse duration (e.g., "1 hour", "30 minutes", "1.5 hours", "90 minutes")
      const duration = eventDetails.duration.toLowerCase();
      if (duration.includes('hour')) {
        const hours = parseFloat(duration.match(/[\d.]+/)?.[0] || '1');
        durationMinutes = hours * 60;
      } else if (duration.includes('minute') || duration.includes('min')) {
        durationMinutes = parseInt(duration.match(/\d+/)?.[0] || '60');
      }
    }

    startDate.setMinutes(startDate.getMinutes() + durationMinutes);

    const endYear = startDate.getFullYear();
    const endMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(startDate.getDate()).padStart(2, '0');
    const endHour = String(startDate.getHours()).padStart(2, '0');
    const endMin = String(startDate.getMinutes()).padStart(2, '0');

    const endDateTime = `${endYear}-${endMonth}-${endDay}T${endHour}:${endMin}:00`;

    event.end = {
      dateTime: endDateTime,
      timeZone: timezone,
    };

    console.log("Event times:", { start: startDateTime, end: endDateTime, duration: eventDetails.duration, durationMinutes, timezone });
  } else {
    // All-day event
    event.start = {
      date: eventDetails.date,
    };
    event.end = {
      date: eventDetails.date,
    };
    console.log("All-day event:", eventDetails.date);
  }

  // Add recurrence rule if this is a recurring event
  if (eventDetails.recurring && eventDetails.recurrenceRule) {
    let rrule = eventDetails.recurrenceRule;

    // Add end date to recurrence rule if specified
    if (eventDetails.recurrenceEndDate) {
      // Convert YYYY-MM-DD to YYYYMMDD format for RRULE
      const untilDate = eventDetails.recurrenceEndDate.replace(/-/g, '');
      rrule = `${rrule};UNTIL=${untilDate}`;
    }

    event.recurrence = [rrule];
    console.log("Recurring event:", rrule);
  }

  // Try to add to Google Calendar
  let response = await fetch(
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

  // If we get 401, refresh the token and retry
  if (response.status === 401) {
    console.log("Access token expired, refreshing...");
    const newAccessToken = await refreshGoogleToken(refreshToken);

    // Update the token in the database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    await supabase
      .from("accounts")
      .update({
        google_access_token: newAccessToken,
        google_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      })
      .eq("google_refresh_token", refreshToken);

    // Retry the request with new token
    response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }

  const result = await response.json();
  return result.id;
}

// Helper function to extract time from user message
async function extractTime(message: string): Promise<string> {
  // Simple time extraction - can be enhanced
  const timeMatch = message.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)?/i);

  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[3] || "00";
    const meridiem = timeMatch[4]?.toLowerCase();

    if (meridiem === "pm" && hours < 12) {
      hours += 12;
    } else if (meridiem === "am" && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  // If we can't parse it, return null and let it fail
  return "12:00";
}

// Helper function to extract date from user message
async function extractDate(message: string, timezone: string): Promise<string | null> {
  // Use current date in user's timezone
  const now = new Date();
  const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const todayStr = userTime.toISOString().split('T')[0];
  const dayOfWeek = userTime.toLocaleDateString("en-US", { weekday: 'long', timeZone: timezone });

  // Ask Claude to parse the date
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Today is ${dayOfWeek}, ${todayStr}. Convert this date to YYYY-MM-DD format: "${message}". Respond with ONLY the date in YYYY-MM-DD format, nothing else.`,
      }],
    }),
  });

  if (response.ok) {
    const result = await response.json();
    const dateStr = result.content[0].text.trim();
    // Validate it looks like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
  }

  return null;
}

// Helper function to check what clarifications are still needed
function checkForClarifications(event: EventDetails): { field: string; question: string } | null {
  // Check in priority order
  if (!event.time) {
    return { field: "time", question: "What time is this event?" };
  }

  if (!event.duration) {
    return { field: "duration", question: "How much time should I block for this event?" };
  }

  // For recurring events, ask for end date if we haven't asked yet
  if (event.recurring && !event._askedForEndDate) {
    return { field: "end_date", question: "When should this recurring event end? (provide a date or say 'no end date')" };
  }

  return null; // All required fields present
}

// Detect if message is asking to view/manage calendar (not create event)
function detectManagementAction(message: string): { type: string; data?: any } | null {
  const lowerMessage = message.toLowerCase().trim();

  // View calendar queries
  if (
    lowerMessage.includes("what's on") ||
    lowerMessage.includes("whats on") ||
    lowerMessage.includes("what is on") ||
    lowerMessage.includes("show me") && lowerMessage.includes("calendar") ||
    lowerMessage.includes("list") && (lowerMessage.includes("events") || lowerMessage.includes("calendar")) ||
    lowerMessage.match(/^(what|show|list|view).*(today|tomorrow|this week|next week|calendar)/)
  ) {
    return { type: "view" };
  }

  // Cancel/delete event
  if (
    lowerMessage.includes("cancel") ||
    lowerMessage.includes("delete") ||
    lowerMessage.includes("remove")
  ) {
    return { type: "cancel" };
  }

  // Move/reschedule event
  if (
    lowerMessage.includes("move") ||
    lowerMessage.includes("reschedule") ||
    lowerMessage.includes("change") && lowerMessage.includes("time")
  ) {
    return { type: "move" };
  }

  return null;
}

// Handle management actions (view, cancel, move)
async function handleManagementAction(
  action: { type: string; data?: any },
  message: string,
  account: any,
  accountId: string,
  supabase: any
): Promise<any> {
  const timezone = account.timezone || "America/Chicago";

  if (action.type === "view") {
    // Query upcoming events from Google Calendar
    const events = await queryGoogleCalendar(
      account.google_access_token,
      account.google_refresh_token,
      timezone,
      message
    );

    if (!events || events.length === 0) {
      return {
        status: "success",
        message: "No upcoming events found.",
      };
    }

    // Format events into readable text
    const eventList = events.map((event: any, index: number) => {
      const start = event.start.dateTime || event.start.date;
      const date = new Date(start);
      const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone });
      const timeStr = event.start.dateTime
        ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })
        : "All day";

      return `${index + 1}. ${event.summary} - ${dateStr} at ${timeStr}`;
    }).join("\n");

    return {
      status: "success",
      message: `Upcoming events:\n${eventList}`,
    };
  }

  if (action.type === "cancel") {
    // Use Claude to identify which event to cancel
    const eventToCancel = await identifyEventToManage(
      message,
      account.google_access_token,
      account.google_refresh_token,
      timezone,
      "cancel"
    );

    if (!eventToCancel) {
      return {
        status: "error",
        message: "I couldn't find that event. Try: 'What's on my calendar?' to see upcoming events.",
      };
    }

    // Delete the event
    await deleteGoogleCalendarEvent(
      account.google_access_token,
      account.google_refresh_token,
      eventToCancel.id
    );

    return {
      status: "success",
      message: `Canceled: ${eventToCancel.summary}`,
    };
  }

  if (action.type === "move") {
    // Use Claude to identify event and new time
    const moveDetails = await identifyEventToManage(
      message,
      account.google_access_token,
      account.google_refresh_token,
      timezone,
      "move"
    );

    if (!moveDetails || !moveDetails.event) {
      return {
        status: "error",
        message: "I couldn't find that event. Try: 'What's on my calendar?' to see upcoming events.",
      };
    }

    // Update the event time
    await updateGoogleCalendarEvent(
      account.google_access_token,
      account.google_refresh_token,
      moveDetails.event.id,
      moveDetails.newTime,
      timezone
    );

    return {
      status: "success",
      message: `Moved: ${moveDetails.event.summary} to ${moveDetails.newTime}`,
    };
  }

  return {
    status: "error",
    message: "I didn't understand that request.",
  };
}

// Query Google Calendar for upcoming events
async function queryGoogleCalendar(
  accessToken: string,
  refreshToken: string,
  timezone: string,
  query: string
): Promise<any[]> {
  // Determine time range based on query
  const now = new Date();
  let timeMin = now.toISOString();
  let timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Default: next 7 days

  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes("today")) {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    timeMax = endOfDay.toISOString();
  } else if (lowerQuery.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    timeMin = tomorrow.toISOString();
    tomorrow.setHours(23, 59, 59, 999);
    timeMax = tomorrow.toISOString();
  } else if (lowerQuery.includes("this week")) {
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    timeMax = endOfWeek.toISOString();
  }

  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(timeMin)}&` +
    `timeMax=${encodeURIComponent(timeMax)}&` +
    `singleEvents=true&` +
    `orderBy=startTime&` +
    `maxResults=10`,
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
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true&` +
      `orderBy=startTime&` +
      `maxResults=10`,
      {
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
        },
      }
    );
  }

  if (!response.ok) {
    const error = await response.text();
    console.error("Error querying calendar:", error);
    return [];
  }

  const data = await response.json();
  return data.items || [];
}

// Delete an event from Google Calendar
async function deleteGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string
): Promise<void> {
  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
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
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
        },
      }
    );
  }

  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    throw new Error(`Failed to delete event: ${error}`);
  }
}

// Update/move an event in Google Calendar
async function updateGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  newTimeStr: string,
  timezone: string
): Promise<void> {
  // First, get the existing event
  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

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
    throw new Error("Failed to fetch event for update");
  }

  const event = await response.json();

  // Parse new time
  const newTime = await extractTime(newTimeStr);

  // Update start time
  if (event.start.dateTime) {
    const startDate = new Date(event.start.dateTime);
    const [hours, minutes] = newTime.split(":");
    startDate.setHours(parseInt(hours), parseInt(minutes));

    event.start.dateTime = startDate.toISOString().replace(/\.\d{3}Z$/, "");
    event.start.timeZone = timezone;

    // Update end time (maintain duration)
    const endDate = new Date(event.end.dateTime);
    const duration = endDate.getTime() - new Date(event.start.dateTime).getTime();
    endDate.setTime(startDate.getTime() + duration);

    event.end.dateTime = endDate.toISOString().replace(/\.\d{3}Z$/, "");
    event.end.timeZone = timezone;
  }

  // Update the event
  response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update event: ${error}`);
  }
}

// Use Claude to identify which event the user is referring to
async function identifyEventToManage(
  message: string,
  accessToken: string,
  refreshToken: string,
  timezone: string,
  action: string
): Promise<any> {
  // Get upcoming events
  const events = await queryGoogleCalendar(accessToken, refreshToken, timezone, "next 7 days");

  if (!events || events.length === 0) {
    return null;
  }

  // Format events for Claude
  const eventList = events.map((event: any, index: number) => {
    const start = event.start.dateTime || event.start.date;
    const date = new Date(start);
    return `${index + 1}. "${event.summary}" on ${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone })} at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })}`;
  }).join("\n");

  const prompt = action === "move"
    ? `User said: "${message}"\n\nUpcoming events:\n${eventList}\n\nWhich event is the user referring to? What new time do they want? Respond with JSON: {"eventIndex": number, "newTime": "time string"}`
    : `User said: "${message}"\n\nUpcoming events:\n${eventList}\n\nWhich event is the user referring to? Respond with JSON: {"eventIndex": number}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: prompt,
      }],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  const content = result.content[0].text;

  try {
    const parsed = JSON.parse(content);

    if (action === "move") {
      return {
        event: events[parsed.eventIndex - 1],
        newTime: parsed.newTime,
      };
    } else {
      return events[parsed.eventIndex - 1];
    }
  } catch (e) {
    return null;
  }
}

// Check for conflicting events
async function checkForConflicts(
  accessToken: string,
  refreshToken: string,
  eventDetails: EventDetails,
  timezone: string
): Promise<any[]> {
  // Calculate start and end time for the proposed event
  const startDateTime = `${eventDetails.date}T${eventDetails.time}:00`;
  const startDate = new Date(startDateTime);

  // Calculate duration
  let durationMinutes = 60; // Default 1 hour
  if (eventDetails.duration) {
    const duration = eventDetails.duration.toLowerCase();
    if (duration.includes('hour')) {
      const hours = parseFloat(duration.match(/[\d.]+/)?.[0] || '1');
      durationMinutes = hours * 60;
    } else if (duration.includes('minute') || duration.includes('min')) {
      durationMinutes = parseInt(duration.match(/\d+/)?.[0] || '60');
    }
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  // Query Google Calendar for events in this time range
  let response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(startDate.toISOString())}&` +
    `timeMax=${encodeURIComponent(endDate.toISOString())}&` +
    `singleEvents=true`,
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
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(startDate.toISOString())}&` +
      `timeMax=${encodeURIComponent(endDate.toISOString())}&` +
      `singleEvents=true`,
      {
        headers: {
          Authorization: `Bearer ${newAccessToken}`,
        },
      }
    );
  }

  if (!response.ok) {
    console.error("Error checking for conflicts");
    return []; // Return empty array on error to allow event creation
  }

  const data = await response.json();
  return data.items || [];
}
