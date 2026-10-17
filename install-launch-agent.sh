#!/bin/sh
set -eu
HERE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
AGENT="$HERE/agent.py"
PYTHON=$(command -v python3)
CONFIG="$HOME/.observer/config.json"
if [ ! -f "$CONFIG" ] && [ -f "$HOME/.codex-monitor/config.json" ]; then CONFIG="$HOME/.codex-monitor/config.json"; fi
LABEL='dev.observer.agent'
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ ! -f "$CONFIG" ]; then
  echo 'First run: python3 agent.py init' >&2
  exit 2
fi
if [ ! -f "$AGENT" ]; then
  echo 'agent.py not found in script folder' >&2
  exit 2
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.observer"
# XML-escape the paths before interpolating them into a plist.
ESCAPED_PYTHON=$(/usr/bin/python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$PYTHON")
ESCAPED_AGENT=$(/usr/bin/python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$AGENT")
ESCAPED_LOG=$(/usr/bin/python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$HOME/.observer/agent.log")
ESCAPED_ERR=$(/usr/bin/python3 -c 'import html,sys; print(html.escape(sys.argv[1]))' "$HOME/.observer/agent-errors.log")
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$ESCAPED_PYTHON</string><string>$ESCAPED_AGENT</string><string>watch</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$ESCAPED_LOG</string>
<key>StandardErrorPath</key><string>$ESCAPED_ERR</string>
</dict></plist>
EOF
chmod 600 "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed and started $LABEL"
echo "Read logs in $HOME/.codex-monitor/"
