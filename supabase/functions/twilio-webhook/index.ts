import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROCESS_MESSAGE_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/process-message";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
  try {
    console.log("Received Twilio webhook");

    // Parse the incoming form data from Twilio
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;

    console.log(`SMS from ${from}: ${body}`);

    if (!from || !body) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error: Invalid message</Message></Response>',
        { status: 400, headers: { "Content-Type": "text/xml" } }
      );
    }

    // Call our process-message function
    const response = await fetch(PROCESS_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        message: body,
        sender: from,
        type: "sms",
      }),
    });

    const result = await response.json();
    console.log("Process-message result:", result);

    // Send TwiML response back to user
    let responseMessage = "";

    if (result.status === "clarification_needed") {
      responseMessage = result.message;
    } else if (result.status === "success") {
      responseMessage = result.message;
    } else if (result.error) {
      responseMessage = `Error: ${result.error}`;
    } else {
      responseMessage = "Message received!";
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${responseMessage}</Message>
</Response>`;

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error processing Twilio webhook:", error);

    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, there was an error processing your message.</Message>
</Response>`;

    return new Response(errorTwiml, {
      status: 500,
      headers: { "Content-Type": "text/xml" },
    });
  }
});
