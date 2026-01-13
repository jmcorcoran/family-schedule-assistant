# Testing SMS Before A2P Approval

Follow these steps to test SMS functionality with your phone number before A2P 10DLC registration is complete.

## Step 1: Verify Your Phone Number in Twilio ✅

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → **Manage** → **Verified Caller IDs**
3. Click **"+ Add a new Caller ID"**
4. Enter your phone number (with country code, e.g., +1-847-744-0465)
5. Select **SMS** as verification method
6. Enter the verification code you receive
7. ✅ Your number is now verified!

## Step 2: Verify Supabase Secrets Are Set

Check that these secrets are configured in your Supabase project:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **Edge Functions**
4. Verify these secrets exist:
   - `TWILIO_ACCOUNT_SID` - Your Twilio Account SID
   - `TWILIO_AUTH_TOKEN` - Your Twilio Auth Token
   - `TWILIO_PHONE_NUMBER` - Your Twilio phone number (format: +14146676770)
   - `ANTHROPIC_API_KEY` - Your Claude API key
   - `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret

### Set Missing Secrets

If any are missing, set them via CLI:
```bash
npx supabase secrets set TWILIO_ACCOUNT_SID=your_sid_here
npx supabase secrets set TWILIO_AUTH_TOKEN=your_token_here
npx supabase secrets set TWILIO_PHONE_NUMBER=+14146676770
```

Or via Dashboard: **Settings** → **Edge Functions** → **Add new secret**

## Step 3: Verify Webhook Configuration

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your Twilio number
4. Scroll to **Messaging Configuration**
5. Under **"A message comes in"**, verify:
   - Webhook URL: `https://[your-project-id].supabase.co/functions/v1/twilio-webhook`
   - HTTP Method: `POST`

Replace `[your-project-id]` with your actual Supabase project ID (from your Supabase URL).

## Step 4: Verify Your Phone is an Approved Sender

1. Go to your app: https://jmcorcoran.github.io/family-schedule-assistant/
2. Complete setup if not done
3. In **Step 4: Approved Senders**, add your phone number
4. **Format:** Either format works:
   - `847-744-0465` (with dashes)
   - `8477440465` (no dashes)
   - The system normalizes both to `18477440465`

## Step 5: Test It! 🎉

### Send Test SMS

Send this to your Twilio number (e.g., 414-667-6770):
```
Justin has soccer practice tomorrow at 5pm
```

### Expected Response

You should receive:
```
Event "soccer practice" added to calendar for Justin
```

### Try More Commands

```
What's on my calendar?
Add dentist appointment Friday at 2pm
Cancel practice tomorrow
Add note to practice: bring water bottle
```

## Troubleshooting

### Not Receiving Replies?

**Check Twilio Logs:**
1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Monitor** → **Logs** → **Messaging**
3. Look for recent messages
4. Check for errors like:
   - ❌ "Error 30034" - A2P block (need to verify your number - see Step 1)
   - ❌ "Error 11200" - Invalid webhook URL (check Step 3)
   - ✅ "Delivered" - Success!

**Check Supabase Logs:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Logs** → **Edge Functions**
3. Look for `twilio-webhook` and `process-message` logs
4. Check for errors

**Check Function Deployment:**
```bash
npx supabase functions list
```

Should show:
- ✅ process-message
- ✅ twilio-webhook
- ✅ send-reminders
- ✅ send-summaries

If missing, deploy:
```bash
npx supabase functions deploy twilio-webhook --no-verify-jwt
npx supabase functions deploy process-message --no-verify-jwt
```

### Still Not Working?

**Test the webhook directly:**
```bash
curl -X POST "https://[your-project-id].supabase.co/functions/v1/twilio-webhook" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+18477440465&Body=test"
```

Replace `[your-project-id]` with your actual project ID.

**Expected:** You should see a TwiML response in XML format.

## Common Issues

### Issue: "Sender not authorized"
**Solution:** Add your phone to approved senders (Step 4)

### Issue: "Error 30034" in Twilio logs
**Solution:** Verify your phone number in Twilio (Step 1)

### Issue: No response at all
**Solutions:**
1. Check webhook URL is correct (Step 3)
2. Verify functions are deployed
3. Check Supabase logs for errors
4. Verify secrets are set (Step 2)

### Issue: "Invalid JWT" errors
**Solution:** Functions need `--no-verify-jwt` flag:
```bash
npx supabase functions deploy twilio-webhook --no-verify-jwt
npx supabase functions deploy process-message --no-verify-jwt
```

## Once A2P is Approved

When your A2P 10DLC registration is approved:
- ✅ You can send to ANY phone number (not just verified ones)
- ✅ Higher message throughput
- ✅ Better deliverability
- ✅ Remove the verified phone number if you want

## Need Help?

1. Check Twilio logs: Monitor → Logs → Messaging
2. Check Supabase logs: Dashboard → Logs → Edge Functions
3. Review this checklist again
4. Check GitHub Issues for similar problems

---

**Pro Tip:** Once working, try creating events, canceling them, adding notes, and checking your calendar via SMS. It's pretty cool! 🚀
