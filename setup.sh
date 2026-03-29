#!/usr/bin/env bash
# ============================================================
# Gameday setup script
# Installs dependencies, builds TypeScript, and registers
# the user LaunchAgents for the F1 and IPL bots.
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "=== Gameday Setup ==="
echo "Project: $PROJECT_DIR"
echo ""

# ── 1. Check Node ─────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "❌ node not found. Install via: brew install node"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "✅ Node: $NODE_VERSION"

# ── 2. Install npm dependencies ────────────────────────────────
echo "Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install --silent
echo "✅ Dependencies installed"

# ── 3. Ensure .env exists ──────────────────────────────────────
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo ""
    echo "⚠️  Created .env from .env.example"
    echo "   👉 Edit $PROJECT_DIR/.env and set:"
    echo "      SLACK_WEBHOOK_URL=https://hooks.slack.com/services/..."
    echo "      TIMEZONE=America/New_York"
    echo ""
    echo "   Then re-run this script."
    exit 0
fi

if grep -q "YOUR/WEBHOOK/URL" "$PROJECT_DIR/.env"; then
    echo "⚠️  SLACK_WEBHOOK_URL is still the placeholder. Edit .env first."
    exit 1
fi
echo "✅ .env configured"

# ── 4. Build TypeScript ────────────────────────────────────────
echo "Building TypeScript..."
npm run build
echo "✅ Build complete (dist/)"

# ── 5. Create log directory ────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"
echo "✅ Log directory ready"

# ── 6. Test Slack webhook ──────────────────────────────────────
echo "Testing Slack webhook..."
node -e "
const { IncomingWebhook } = require('@slack/webhook');
require('dotenv').config();
const wh = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
wh.send({ text: '✅ F1 Bot is being set up — race notifications will appear here!' })
  .then(() => { console.log('✅ Slack test message sent'); })
  .catch(e => { console.error('❌ Slack test failed:', e.message); process.exit(1); });
"

# ── 7. Run initial sync ────────────────────────────────────────
echo "Running initial schedule sync..."
node --experimental-sqlite dist/sync.js
echo "✅ Initial sync complete"

# ── 8. Install LaunchAgents ────────────────────────────────────
echo ""
echo "Installing LaunchAgents..."
npm run launchd:reload
echo "✅ LaunchAgents installed and started"

# ── 9. Show status ─────────────────────────────────────────────
echo ""
echo "=== Status ==="
launchctl print "gui/$(id -u)/com.utsavmehta.f1bot.sync" >/dev/null && echo "✅ f1bot.sync loaded" || echo "❌ f1bot.sync not found"
launchctl print "gui/$(id -u)/com.utsavmehta.f1bot.checker" >/dev/null && echo "✅ f1bot.checker loaded" || echo "❌ f1bot.checker not found"
launchctl print "gui/$(id -u)/com.utsavmehta.iplbot.sync" >/dev/null && echo "✅ iplbot.sync loaded" || echo "❌ iplbot.sync not found"
launchctl print "gui/$(id -u)/com.utsavmehta.iplbot.checker" >/dev/null && echo "✅ iplbot.checker loaded" || echo "❌ iplbot.checker not found"
echo ""
echo "📄 Logs:"
echo "   Checker: $PROJECT_DIR/logs/checker.log"
echo "   Sync:    $PROJECT_DIR/logs/sync.log"
echo "   IPL checker: $PROJECT_DIR/logs/ipl-checker.log"
echo "   IPL sync:    $PROJECT_DIR/logs/ipl-sync.log"
echo ""
echo "🛑 To stop:"
echo "   launchctl bootout gui/$(id -u)/com.utsavmehta.f1bot.sync"
echo "   launchctl bootout gui/$(id -u)/com.utsavmehta.f1bot.checker"
echo "   launchctl bootout gui/$(id -u)/com.utsavmehta.iplbot.sync"
echo "   launchctl bootout gui/$(id -u)/com.utsavmehta.iplbot.checker"
echo ""
echo "✅ Done! LaunchAgents are installed."
echo "   f1bot.checker runs every 15 minutes"
echo "   iplbot.checker runs every 5 minutes"
echo "   both sync jobs run Mondays at 6:00 AM"
echo ""
echo "ℹ️  To refresh launchd later:"
echo "   npm run launchd:reload"
