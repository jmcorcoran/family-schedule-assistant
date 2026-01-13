import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROCESS_MESSAGE_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/process-message";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
  try {
    console.log("Received email webhook");

    // Parse the incoming form data from SendGrid Inbound Parse
    const formData = await req.formData();
    const from = formData.get("from") as string;
    const text = formData.get("text") as string;
    const subject = formData.get("subject") as string;

    console.log(`Email from ${from}: ${text}`);

    if (!from || !text) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Extract email address from "Name <email@example.com>" format
    const emailMatch = from.match(/<(.+?)>/) || from.match(/^(.+?)$/);
    const email = emailMatch ? emailMatch[1].trim() : from;

    console.log(`Extracted email: ${email}`);

    // Use subject + body as the message (if subject exists, prepend it)
    let message = text.trim();
    if (subject && subject.toLowerCase() !== "re:" && subject.toLowerCase() !== "fwd:") {
      message = subject + ": " + message;
    }

    // Call our process-message function
    const response = await fetch(PROCESS_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message: message,
        sender: email,
        type: "email",
      }),
    });

    const result = await response.json();
    console.log("Process-message result:", result);

    // Send email response back to user
    let responseMessage = "";

    if (result.status === "clarification_needed") {
      responseMessage = result.message;
    } else if (result.status === "success") {
      responseMessage = result.message;
    } else if (result.status === "conflict") {
      responseMessage = result.message;
    } else if (result.error) {
      responseMessage = `Error: ${result.error}`;
    } else {
      responseMessage = "Message received!";
    }

    // For email, we just return success (actual reply would need SendGrid API)
    // To send replies, you'd need to integrate SendGrid's send API
    console.log("Would reply with:", responseMessage);

    return new Response(JSON.stringify({
      success: true,
      reply: responseMessage
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing email webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
