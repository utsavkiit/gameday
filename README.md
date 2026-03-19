# F1 Bot

A personal Formula 1 Slack bot that runs forever on a Mac mini and sends notifications before, during, and after every session.

## How it works

Two short-lived scripts run on a schedule via macOS LaunchDaemons:

- **`sync.ts`** — runs once daily at 6am. Fetches the F1 calendar from [OpenF1](https://openf1.org/) and writes sessions + notification schedule to a local SQLite database.
- **`checker.ts`** — runs every 5 minutes. Checks if any notifications are due, sends them to Slack, and marks them sent.

No long-running process. No job queue. launchd handles scheduling and restarts.

## Notifications

| When | What you get |
|------|-------------|
| 24 hours before | Session reminder with location and local time |
| 30 minutes before | Final "starting soon" alert |
| Session start | Start notification + track weather |
| Every 5 min (Race & Sprint only) | Live top-10 standings |
| 45 min after session ends | Final results with fastest lap |

## Stack

- **TypeScript** + Node 22
- **node:sqlite** — built-in SQLite, no native dependencies
- **OpenF1 API** — free, no API key required
- **Slack Incoming Webhooks** — no bot token needed
- **launchd** — macOS system scheduler, runs even when Mac mini is locked

## Setup

### 1. Prerequisites

- Mac mini with Node 22+
- A Slack workspace where you can add an app

### 2. Create a Slack Incoming Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. Add the **Incoming Webhooks** feature and activate it
3. Click **Add New Webhook to Workspace** and pick a channel
4. Copy the webhook URL

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
TIMEZONE=America/New_York
```

Find your timezone name [here](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

### 4. Install and deploy

```bash
./setup.sh
```

This will:
- Install npm dependencies
- Build TypeScript
- Test your Slack webhook
- Run the initial schedule sync
- Install and start both LaunchDaemons (requires `sudo`)

## Mac mini tips

- **System Settings → Energy** → enable "Prevent automatic sleeping when display is off" so jobs don't miss while the machine sleeps
- **System Settings → Energy** → enable "Start up automatically after a power failure" so the bot survives power outages without you touching anything

## Commands

```bash
# Manual sync (re-fetch schedule from OpenF1)
npm run sync

# Manual check (send any due notifications now)
npm run check

# Rebuild after editing source
npm run build

# View logs
tail -f logs/checker.log
tail -f logs/sync.log

# Stop the bot
sudo launchctl unload /Library/LaunchDaemons/com.utsavmehta.f1bot.checker.plist
sudo launchctl unload /Library/LaunchDaemons/com.utsavmehta.f1bot.sync.plist

# Start the bot
sudo launchctl load /Library/LaunchDaemons/com.utsavmehta.f1bot.checker.plist
sudo launchctl load /Library/LaunchDaemons/com.utsavmehta.f1bot.sync.plist
```

## Optional: filter session types

To only get notifications for certain sessions, set `SESSION_FILTER` in `.env`:

```
# Options: Practice, Qualifying, Sprint Qualifying, Sprint, Race
SESSION_FILTER=Qualifying,Race
```

Leave blank to receive notifications for all sessions.
