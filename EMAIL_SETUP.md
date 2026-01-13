# Email Integration Setup Guide

Test your Family Schedule Assistant via email RIGHT NOW (no waiting for A2P approval)!

## Option 1: SendGrid Inbound Parse (Recommended - Free)

SendGrid has a free tier that lets you receive emails and forward them to your webhook.

### Step 1: Create SendGrid Account

1. Go to https://sendgrid.com/
2. Click **"Start for Free"** or **"Sign Up"**
3. Complete registration (free tier is fine)
4. Verify your email address

### Step 2: Set Up Inbound Parse

1. **Log in to SendGrid Dashboard**
   - Go to https://app.sendgrid.com/

2. **Navigate to Inbound Parse**
   - Click **Settings** → **Inbound Parse** in the left sidebar
   - Or go directly to: https://app.sendgrid.com/settings/parse

3. **Add Host & URL**
   - Click **"Add Host & URL"**
   - Fill in the form:

   **Subdomain:** `calendar` (or any name you want)
   **Domain:** Choose one of SendGrid's domains (e.g., `parse.email`)
   **Destination URL:**
   ```
   https://fwnxzjogzquztqhtfuhd.supabase.co/functions/v1/email-webhook
   ```
   **Check spam:** ✅ Enabled (recommended)
   **Send raw:** ❌ Disabled

4. **Click "Add"**

### Step 3: Your Email Address is Ready!

Your calendar email is now:
```
calendar@parse.email
```
(Replace `calendar` with whatever subdomain you chose)

### Step 4: Add Your Email as Approved Sender

1. Go to your app: https://jmcorcoran.github.io/family-schedule-assistant/
2. Navigate to **Step 4: Approved Senders**
3. Click **"Add Email Address"**
4. Enter your personal email (e.g., `justin@example.com`)
5. Click **"Add Email"**

### Step 5: Test It! 🎉

**Send an email to:** `calendar@parse.email`

**From:** Your approved email address

**Subject or Body:**
```
Justin has soccer practice tomorrow at 5pm
```

**What happens:**
1. SendGrid receives your email
2. Forwards it to your webhook
3. Webhook processes it with Claude AI
4. Event gets added to Google Calendar
5. You can check your calendar to see the event!

---

## Option 2: CloudMailin (Alternative - Also Free)

CloudMailin is another service specialized in email-to-webhook.

### Step 1: Create CloudMailin Account

1. Go to https://www.cloudmailin.com/
2. Sign up for free account
3. Verify your email

### Step 2: Create Email Address

1. In CloudMailin dashboard, click **"Create Address"**
2. Choose **HTTP Post** format
3. Set **Target URL:**
   ```
   https://fwnxzjogzquztqhtfuhd.supabase.co/functions/v1/email-webhook
   ```
4. **POST Format:** Choose **Multipart** or **Raw**
5. Click **"Create Address"**

### Step 3: Your Email Address

CloudMailin will give you an email like:
```
xyz123@cloudmailin.net
```

Use this as your calendar email address.

### Step 4: Add Your Email as Approved Sender

Same as Option 1, Step 4.

### Step 5: Test It!

Send an email to your CloudMailin address with:
```
Blake has dentist appointment Friday at 2pm
```

---

## Option 3: Your Own Domain (Advanced)

If you have your own domain, you can set up email forwarding:

### Requirements:
- Your own domain (e.g., `yourdomain.com`)
- Access to DNS settings
- Email forwarding or mail server

### Setup:

1. **Configure MX Records** to point to SendGrid or CloudMailin
2. **Set up forwarding** to your webhook
3. **Use email like:** `calendar@yourdomain.com`

See SendGrid or CloudMailin docs for detailed instructions.

---

## Testing Email Integration

### Test Commands

Send these emails to test different features:

**Create Event:**
```
Subject: Soccer Practice
Body: Justin has practice tomorrow at 5pm at the park
```

**Create Multi-Event:**
```
Practice Monday and Wednesday at 5pm
```

**View Calendar:**
```
What's on my calendar today?
```

**Cancel Event:**
```
Cancel Justin's practice tomorrow
```

**Add Note:**
```
Add note to practice: bring water bottle
```

**With Location:**
```
Dentist appointment Friday at 2pm at Dr. Smith's office
```

### How to Check Results

1. **Google Calendar:** Check if events were created
2. **Supabase Logs:**
   - Go to https://supabase.com/dashboard
   - Navigate to **Logs** → **Edge Functions**
   - Check `email-webhook` and `process-message` logs

---

## Troubleshooting

### Not Working?

**1. Check SendGrid/CloudMailin Logs:**
   - SendGrid: Settings → Activity
   - CloudMailin: Dashboard → Address → Activity

**2. Check Supabase Logs:**
   - Dashboard → Logs → Edge Functions
   - Look for `email-webhook` entries

**3. Verify Approved Sender:**
   - Make sure you added YOUR email address in the app
   - Format: `your.email@gmail.com` (exact match)

**4. Test Webhook Directly:**
```bash
curl -X POST "https://fwnxzjogzquztqhtfuhd.supabase.co/functions/v1/email-webhook" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=justin@example.com&text=test&subject=Test"
```

### Common Issues

**"Sender not authorized"**
- Add your email to approved senders list

**No response/nothing happens**
- Check SendGrid/CloudMailin webhook URL is correct
- Check Supabase function logs for errors

**"Invalid email format"**
- Email should be plain text, not HTML only
- Check that SendGrid is parsing correctly

---

## Email vs SMS

**✅ Works Right Now:**
- Email (no A2P waiting)
- All features work the same
- Same AI parsing

**⏳ Coming Soon:**
- SMS (waiting for A2P approval)
- SMS reminders
- SMS summaries

**Pro Tip:** You can use BOTH once SMS is approved:
- Email for detailed requests
- SMS for quick updates

---

## Next Steps

1. **Choose Option 1 (SendGrid)** - it's the easiest
2. **Set up your calendar email address**
3. **Add your personal email as approved sender**
4. **Send a test email**
5. **Check your Google Calendar**

Once A2P is approved, SMS will work automatically alongside email!

---

## Need Help?

- Check Supabase logs for errors
- Check SendGrid Activity logs
- Verify webhook URL is correct
- Test with the curl command above

🎉 **You can now test your entire system via email!**
