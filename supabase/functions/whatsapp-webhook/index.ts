import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROCESS_MESSAGE_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/process-message";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

Deno.serve(async (req) => {
  try {
    console.log("Received WhatsApp webhook");

    // Parse the form data from Twilio
    const formData = await req.formData();
    const from = formData.get("From") as string; // whatsapp:+1234567890
    const to = formData.get("To") as string;     // whatsapp:+14155238886 (sandbox)
    const body = formData.get("Body") as string;

    console.log(`WhatsApp from ${from}: ${body}`);

    if (!from || !body) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Extract just the phone number (remove 'whatsapp:' prefix)
    const phoneNumber = from.replace("whatsapp:", "");
    // Normalize to digits only (remove +)
    const normalizedPhone = phoneNumber.replace(/\D/g, "");

    console.log(`Normalized phone: ${normalizedPhone}`);

    // Call our process-message function
    const response = await fetch(PROCESS_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message: body,
        sender: normalizedPhone,
        type: "phone", // Use phone type so it matches family_members.phone
      }),
    });

    const result = await response.json();
    console.log("Process-message result:", result);

    // Determine response message
    let responseMessage = "";
    if (result.status === "clarification_needed") {
      responseMessage = result.message;
    } else if (result.status === "success") {
      responseMessage = result.message;
    } else if (result.error) {
      if (result.error === "Sender not authorized") {
        responseMessage = "Sorry, your phone number isn't registered. Please add it to your family member profile in the app.";
      } else {
        responseMessage = `Error: ${result.error}`;
      }
    } else {
      responseMessage = "Message received!";
    }

    console.log("Sending WhatsApp reply:", responseMessage);

    // Send WhatsApp reply via Twilio API
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: to,   // Reply from the sandbox number
          To: from,   // Reply to the sender
          Body: responseMessage,
        }),
      }
    );

    if (!twilioResponse.ok) {
      const error = await twilioResponse.text();
      console.error("Twilio error:", error);
    } else {
      console.log("WhatsApp reply sent successfully");
    }

    // Return empty TwiML (we're sending the reply via REST API instead)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
});
