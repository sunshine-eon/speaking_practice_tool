#!/usr/bin/env python3
"""
Email Reminder Script for Speaking Practice Tool

Sends reminder emails via Gmail SMTP.
Run manually with: python3 send_reminder.py
Or schedule with cron for automatic reminders.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv
from progress_manager import load_progress, calculate_streak

# Load environment variables
load_dotenv()

# Email configuration from .env
GMAIL_SENDER = os.getenv('GMAIL_SENDER_ADDRESS')
GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD')
RECIPIENT_EMAIL = os.getenv('REMINDER_EMAIL_TO')

def send_reminder_email():
    """Send a reminder email via Gmail SMTP."""
    
    # Validate configuration
    if not GMAIL_SENDER:
        print("❌ Error: GMAIL_SENDER_ADDRESS not set in .env file")
        return False
    
    if not GMAIL_APP_PASSWORD:
        print("❌ Error: GMAIL_APP_PASSWORD not set in .env file")
        print("📝 Follow instructions in EMAIL_SETUP.md to create an App Password")
        return False
    
    if not RECIPIENT_EMAIL:
        print("❌ Error: REMINDER_EMAIL_TO not set in .env file")
        return False
    
    # Get current streak
    try:
        progress = load_progress()
        streak = calculate_streak(progress)
        streak_message = f"🔥 Your current streak: {streak} days in a row!\n\n" if streak > 0 else ""
    except Exception as e:
        print(f"⚠️ Warning: Could not load streak information: {e}")
        streak_message = ""
    
    # Email content (customizable)
    subject = "🎤 Speaking Practice Reminder"
    
    body = f"""
Hi!

This is your reminder to practice speaking today! 🗣️

{streak_message}Daily activities:
• Weekly Expressions (dictation practice)
• Voice Journaling (2-3 mins)
• Shadowing Practice (daily practice)
• Podcast Shadowing
• Weekly Speaking Prompt (3-5 mins)

Open your speaking practice tool: http://localhost:5001/

Keep up the great work! 💪

---
This is an automated reminder from your Speaking Practice Tool.
"""
    
    try:
        # Create message
        message = MIMEMultipart()
        message['From'] = GMAIL_SENDER
        message['To'] = RECIPIENT_EMAIL
        message['Subject'] = subject
        
        # Add body to email
        message.attach(MIMEText(body, 'plain'))
        
        # Connect to Gmail SMTP server
        print(f"📧 Connecting to Gmail SMTP server...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()  # Enable TLS encryption
        
        # Login
        print(f"🔐 Logging in as {GMAIL_SENDER}...")
        server.login(GMAIL_SENDER, GMAIL_APP_PASSWORD)
        
        # Send email
        print(f"📨 Sending email to {RECIPIENT_EMAIL}...")
        server.send_message(message)
        
        # Disconnect
        server.quit()
        
        print(f"✅ Email sent successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        return True
        
    except smtplib.SMTPAuthenticationError:
        print("❌ Authentication failed!")
        print("📝 Make sure you're using an App Password (not your regular Gmail password)")
        print("📝 Follow instructions in EMAIL_SETUP.md")
        return False
        
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("Speaking Practice Reminder - Email Test")
    print("=" * 50)
    print()
    
    success = send_reminder_email()
    
    print()
    if success:
        print("🎉 Test successful! Your email reminder system is working.")
        print("📅 Next step: Set up cron job to schedule automatic reminders")
    else:
        print("❌ Test failed. Please check the error messages above.")
        print("📖 See EMAIL_SETUP.md for setup instructions")
    print()

