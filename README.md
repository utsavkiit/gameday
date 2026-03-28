# GameDay

This repo now contains two separate bots:

- F1 bot: the original OpenF1-based workflow and `f1bot.sqlite` schema are unchanged.
- IPL bot: a separate Cricket Data workflow with its own `iplbot.sqlite` database and commands.

## F1 bot

The existing F1 bot still uses:

- `src/sync.ts` and `src/checker.ts`
- `src/db.ts` and `f1bot.sqlite`
- `npm run sync` and `npm run check`

## IPL bot

The IPL bot uses separate files so it does not touch the F1 tables:

- `src/ipl-sync.ts` and `src/ipl-checker.ts`
- `src/ipl-db.ts` and `iplbot.sqlite`
- `npm run ipl:sync` and `npm run ipl:check`

Notifications for each IPL 2025 match:

- 10:00 PM EDT the night before: teams, start time, venue, likely weather
- 15 minutes before start: toss result and starting XIs
- Mid-innings break: first-innings score update
- Post-match: result, player of the match, and standings

## Config

Copy `.env.example` to `.env`.

Required for F1:

```bash
SLACK_WEBHOOK_URL=...
TIMEZONE=America/New_York
```

Required for IPL:

```bash
CRICKETDATA_API_KEY=...
IPL_SEASON=2025
IPL_SERIES_ID=d5a498c8-7596-4b93-8ab0-e0efc3345312
```

Optional IPL overrides:

```bash
IPL_SLACK_WEBHOOK_URL=
IPL_TIMEZONE=
IPL_HEALTHCHECK_URL=
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
npm run ipl:sync
npm run ipl:check
./setup.sh
```

`./setup.sh` still sets up the original F1 launchd jobs. The IPL bot is currently runnable via the `ipl:*` scripts without altering the existing F1 daemon setup.
