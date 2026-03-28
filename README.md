# GameDay IPL Bot

A personal Slack bot for IPL updates. It stores the 2025 tournament schedule once, then sends four notifications for every match:

- 10:00 PM the night before: teams, start time, venue, likely weather
- 15 minutes before start: toss result and starting XIs
- Mid-innings break: first-innings score snapshot
- After the match: result, player of the match, and current standings

## How it works

Two short-lived scripts run via macOS `launchd`:

- `src/sync.ts` fetches the IPL 2025 schedule from Cricket Data API and stores the notification schedule in SQLite. It skips subsequent runs unless `FORCE_SYNC_SCHEDULE=true`.
- `src/checker.ts` runs every 5 minutes, sends due notifications, and retries if toss, innings-break, or final-result data is not available yet.

## Stack

- TypeScript + Node 22
- `node:sqlite` for the local schedule store
- Cricket Data API free plan for fixtures and match data
- Open-Meteo for forecast summaries
- Slack incoming webhooks
- `launchd` for scheduling on macOS

## Configuration

Copy `.env.example` to `.env` and set:

```bash
SLACK_WEBHOOK_URL=...
CRICKETDATA_API_KEY=...
TIMEZONE=America/New_York
IPL_SEASON=2025
IPL_SERIES_ID=d5a498c8-7596-4b93-8ab0-e0efc3345312
```

Optional timing controls:

```bash
PRE_GAME_LOCAL_HOUR=22
PRE_MATCH_MINUTES=15
MID_INNINGS_OFFSET_MINUTES=125
POST_MATCH_OFFSET_MINUTES=250
RETRY_INTERVAL_MINUTES=5
FORCE_SYNC_SCHEDULE=false
```

## Commands

```bash
npm run build
npm run sync
npm run check
./setup.sh
```

`npm run sync` is meant to be run once for the season unless you deliberately force a refresh.

## Notes

- The Cricket Data free API schema is inconsistent across endpoints, so the parser is defensive and may need small adjustments once you test it with your API key.
- Weather is resolved from the stored venue string via Open-Meteo geocoding, so some stadium names may need manual cleanup if forecasting is missing.
