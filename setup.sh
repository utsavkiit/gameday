#!/usr/bin/env bash
# ============================================================
# F1 Slack Bot — setup script
# Installs dependencies, builds TypeScript, and registers
# the two LaunchDaemon plists.
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKER_PLIST_SRC="$PROJECT_DIR/com.utsavmehta.f1bot.checker.plist"
SYNC_PLIST_SRC="$PROJECT_DIR/com.utsavmehta.f1bot.sync.plist"
CHECKER_PLIST_DEST="/Library/LaunchDaemons/com.utsavmehta.f1bot.checker.plist"
SYNC_PLIST_DEST="/Library/LaunchDaemons/com.utsavmehta.f1bot.sync.plist"

echo ""
echo "=== F1 Slack Bot Setup ==="
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

# ── 8. Install LaunchDaemons (requires sudo) ───────────────────
echo ""
echo "Installing LaunchDaemons (requires sudo)..."

# Unload existing if running
sudo launchctl unload "$CHECKER_PLIST_DEST" 2>/dev/null || true
sudo launchctl unload "$SYNC_PLIST_DEST" 2>/dev/null || true

sudo cp "$CHECKER_PLIST_SRC" "$CHECKER_PLIST_DEST"
sudo cp "$SYNC_PLIST_SRC" "$SYNC_PLIST_DEST"
sudo launchctl load "$CHECKER_PLIST_DEST"
sudo launchctl load "$SYNC_PLIST_DEST"
echo "✅ LaunchDaemons installed and started"

# ── 9. Show status ─────────────────────────────────────────────
echo ""
echo "=== Status ==="
sudo launchctl list | grep "f1bot" || echo "(not found — check logs)"
echo ""
echo "📄 Logs:"
echo "   Checker: $PROJECT_DIR/logs/checker.log"
echo "   Sync:    $PROJECT_DIR/logs/sync.log"
echo ""
echo "🛑 To stop:"
echo "   sudo launchctl unload $CHECKER_PLIST_DEST"
echo "   sudo launchctl unload $SYNC_PLIST_DEST"
echo ""
echo "✅ Done! F1 Bot is running. Checker fires every 5 min, sync runs daily at 6am."
