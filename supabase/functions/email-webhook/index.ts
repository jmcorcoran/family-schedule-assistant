import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROCESS_MESSAGE_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/process-message";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
  try {
    console.log("Received email webhook");
    console.log("Content-Type:", req.headers.get("content-type"));

    let from, text, subject;
    const contentType = req.headers.get("content-type") || "";

    // Handle different formats (CloudMailin JSON vs SendGrid form data)
    if (contentType.includes("application/json")) {
      // CloudMailin JSON format
      const body = await req.json();
      console.log("CloudMailin JSON body:", JSON.stringify(body).substring(0, 500));

      // CloudMailin sends data in envelope.from and plain/html
      from = body.envelope?.from || body.headers?.From;
      subject = body.headers?.Subject || body.subject;

      // Try to get plain text, fallback to HTML stripped
      text = body.plain || body.text || "";
      if (!text && body.html) {
        // Basic HTML stripping
        text = body.html.replace(/<[^>]*>/g, '').trim();
      }
    } else {
      // SendGrid or other form data format
      const formData = await req.formData();
      from = formData.get("from") as string;
      text = formData.get("text") as string || formData.get("plain") as string;
      subject = formData.get("subject") as string;
    }

    console.log(`Email from ${from}, subject: ${subject}`);
    console.log(`Text preview: ${text?.substring(0, 100)}`);

    if (!from || !text) {
      console.error("Missing fields - from:", !!from, "text:", !!text);
      return new Response(JSON.stringify({
        error: "Missing required fields",
        received: { from: !!from, text: !!text }
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Extract email address from "Name <email@example.com>" format
    const emailMatch = from.match(/<(.+?)>/) || from.match(/([^\s]+@[^\s]+)/);
    const email = emailMatch ? emailMatch[emailMatch.length - 1].trim() : from;

    console.log(`Extracted email: ${email}`);

    // Use subject + body as the message (if subject exists, prepend it)
    let message = text.trim();
    if (subject && subject.toLowerCase() !== "re:" && subject.toLowerCase() !== "fwd:" && !subject.toLowerCase().includes("automatic reply")) {
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

    console.log("Sending reply:", responseMessage);

    // Send email reply using SendGrid
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "calendar@fwnxzjogzquztqhtfuhd.supabase.co";

    if (SENDGRID_API_KEY) {
      try {
        const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SENDGRID_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: email }],
              subject: "Re: " + (subject || "Calendar Update"),
            }],
            from: { email: FROM_EMAIL, name: "Family Calendar Assistant" },
            content: [{
              type: "text/plain",
              value: responseMessage,
            }],
          }),
        });

        if (!sendGridResponse.ok) {
          const error = await sendGridResponse.text();
          console.error("SendGrid error:", error);
        } else {
          console.log("Email reply sent successfully");
        }
      } catch (emailError) {
        console.error("Failed to send email reply:", emailError);
      }
    } else {
      console.log("SENDGRID_API_KEY not configured - skipping email reply");
    }

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
