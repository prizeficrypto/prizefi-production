# Discord Leaderboard Integration Guide

This guide will help you set up automatic leaderboard posting to your Discord server.

## Quick Setup

### 1. Create a Discord Webhook

1. Open your Discord server
2. Go to **Server Settings** → **Integrations** → **Webhooks**
3. Click **New Webhook** or **Create Webhook**
4. Give it a name (e.g., "PrizeFi Leaderboard")
5. Choose the channel where you want leaderboards posted
6. Click **Copy Webhook URL** - save this for later!
7. Click **Save**

### 2. Post a Leaderboard

Once you have your webhook URL, you can post leaderboards using the admin API:

**Endpoint:** `POST /api/admin/discord/post-leaderboard`

**Headers:**
```
Content-Type: application/json
x-admin-session: <YOUR_ADMIN_SESSION_TOKEN>
```

**Body:**
```json
{
  "eventId": 1,
  "webhookUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_HERE"
}
```

**Important:** You must be logged in to the admin panel with MFA verification enabled to get a valid admin session token. The session token is automatically included when making requests from the admin panel.

### 3. Example Usage

#### From Admin Panel (Recommended):
```javascript
// This example assumes you're adding a button to the admin panel
const response = await fetch('/api/admin/discord/post-leaderboard', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-session': sessionToken // Already available in admin panel
  },
  body: JSON.stringify({
    eventId: 1,
    webhookUrl: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_URL'
  })
})

const result = await response.json()
console.log(result)
```

#### Using cURL (Advanced):
```bash
# You'll need to extract the session token from your admin panel session
curl -X POST https://your-app.replit.app/api/admin/discord/post-leaderboard \
  -H "Content-Type: application/json" \
  -H "x-admin-session: YOUR_ADMIN_SESSION_TOKEN" \
  -d '{
    "eventId": 1,
    "webhookUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
  }'
```

## What Gets Posted

The leaderboard message includes:
- 🏆 Event number and status (Active/Finalized)
- 📅 Event end date
- 💰 Prize pool in WLD
- 🎯 Top 10 players with:
  - Rank (with medals 🥇🥈🥉🏅)
  - Username or shortened wallet address
  - Score
  - Prize amount in WLD

## Advanced: Automatic Posting

### Option 1: Manual Post After Finalizing Events
After finalizing an event in the admin panel, call this endpoint to post the results.

### Option 2: Scheduled Posts (Future Enhancement)
You can create a cron job or scheduled task that automatically posts:
- Daily leaderboard updates during active events
- Final results when events end

### Option 3: Add to Admin Panel
Create a button in your admin panel that calls this endpoint with one click.

## Security Notes

⚠️ **Keep your webhook URL private!** Anyone with the URL can post to your Discord channel.

Consider:
- Storing the webhook URL as an environment variable
- Using the Replit Discord connector for better security
- Creating a separate webhook for testing

## Troubleshooting

**"Discord webhook failed" error:**
- Check that your webhook URL is valid and hasn't been deleted
- Verify the webhook has permission to post in the channel
- Make sure the Discord server is accessible

**"Event not found" error:**
- Verify the eventId exists in your database
- Check that the event has players with scores

**"No players found" error:**
- The event exists but has no leaderboard entries
- Wait for players to complete runs before posting

## Next Steps

Want to enhance this further?
1. **Add to Admin Panel**: Create a UI button to post with one click
2. **Automatic Posting**: Set up cron jobs to post at event end
3. **Rich Embeds**: Customize the Discord message appearance
4. **Multiple Channels**: Post to different channels for different events
