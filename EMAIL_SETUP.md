# Email Reminder Setup Guide

This guide will help you set up automated email reminders for your speaking practice.

## Step 1: Enable 2-Factor Authentication on Gmail

If you don't have 2FA enabled yet:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click on "2-Step Verification"
3. Follow the prompts to enable 2-Step Verification

## Step 2: Create a Gmail App Password

An App Password is a special 16-character password that lets apps access your Gmail securely.

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
   - Or: Google Account → Security → 2-Step Verification → App passwords
2. You may need to sign in again
3. Under "Select app", choose **"Mail"**
4. Under "Select device", choose **"Other (Custom name)"**
5. Type: **"Speaking Practice Reminder"**
6. Click **"Generate"**
7. Google will show you a 16-character password (e.g., `abcd efgh ijkl mnop`)
8. **Copy this password** - you'll need it in the next step
9. Click **"Done"**

**Important**: This password only appears once! If you lose it, you'll need to generate a new one.

## Step 3: Configure Your .env File

Add these three lines to your `.env` file:

```bash
# Email Reminder Configuration
GMAIL_SENDER_ADDRESS=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
REMINDER_EMAIL_TO=your-email@gmail.com
```

**Replace with your actual values:**
- `GMAIL_SENDER_ADDRESS`: Your Gmail address (the one you created the App Password for)
- `GMAIL_APP_PASSWORD`: The 16-character password from Step 2 (no spaces)
- `REMINDER_EMAIL_TO`: Email address to receive reminders (can be the same as sender)

**Example:**
```bash
GMAIL_SENDER_ADDRESS=hebinna91@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
REMINDER_EMAIL_TO=hebinna91@gmail.com
```

**Note**: Remove spaces from the App Password when pasting!

## Step 4: Test the Email Script

Run the test command:

```bash
python3 send_reminder.py
```

**If successful**, you'll see:
```
✅ Email sent successfully at 2025-11-10 14:30:00
🎉 Test successful! Your email reminder system is working.
```

**Check your inbox** (and spam folder) for the test email!

## Step 5: Troubleshooting

### "Authentication failed"
- Make sure you're using the **App Password**, not your regular Gmail password
- Remove any spaces from the App Password
- Make sure 2FA is enabled on your Google account

### "GMAIL_APP_PASSWORD not set"
- Check that your `.env` file is in the project root directory
- Make sure there are no typos in the variable names
- Remove any quotes around the values

### Email not received
- Check your spam folder
- Make sure `REMINDER_EMAIL_TO` is set correctly
- Wait a few minutes (sometimes emails are delayed)

## Step 6: Schedule Automatic Reminders (Optional)

Once the test works, you can schedule automatic reminders using cron.

**Example**: Send reminder at 9 AM and 6 PM every day:

```bash
# Edit crontab
crontab -e

# Add these lines (adjust paths to match your setup):
0 9 * * * cd /Users/hebinna/Desktop/fail\ to\ learn/speaking_practice_tool && /usr/bin/python3 send_reminder.py >> reminder.log 2>&1
0 18 * * * cd /Users/hebinna/Desktop/fail\ to\ learn/speaking_practice_tool && /usr/bin/python3 send_reminder.py >> reminder.log 2>&1
```

**Cron format**: `minute hour day month weekday command`
- `0 9 * * *` = 9:00 AM every day
- `0 18 * * *` = 6:00 PM every day

## Customizing Email Content

To customize the reminder email, edit `send_reminder.py`:

```python
# Around line 32-33
subject = "🎤 Speaking Practice Reminder"  # Change subject here

body = """
Your custom message here!
"""  # Change body here
```

## Security Notes

✅ **Safe:**
- App Passwords are stored in `.env` (not committed to git)
- App Passwords can be revoked anytime from Google Account settings
- App Passwords only work with the specific app/device you created them for

⚠️ **Never:**
- Commit `.env` to git (it's already gitignored)
- Share your App Password
- Use your regular Gmail password in the script

## Revoking Access

If you want to stop the reminders:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click "2-Step Verification"
3. Scroll to "App passwords"
4. Find "Speaking Practice Reminder" and click "Remove"

Or simply delete the three email variables from your `.env` file.

