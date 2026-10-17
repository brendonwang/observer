#!/bin/sh
# Legacy alternative to 'observer start'. Use a stable installed runtime path.
set -eu
HERE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
CONFIG="$HOME/.observer/config.json"
if [ ! -f "$CONFIG" ] && [ -f "$HOME/.codex-monitor/config.json" ]; then CONFIG="$HOME/.codex-monitor/config.json"; fi
if [ ! -f "$CONFIG" ]; then
  echo 'First configure Observer with node bin/observer.js setup or python3 agent.py init.' >&2
  exit 2
fi
if [ ! -f "$HERE/agent.py" ] || [ ! -f "$HERE/service_adapter.py" ]; then
  echo 'Observer agent source is missing. Use node bin/observer.js start.' >&2
  exit 2
fi
PYTHON=$(command -v python3)
"$PYTHON" -c 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"'
LABEL='dev.observer.agent'
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNTIME="$HOME/.observer/runtime"
mkdir -p "$RUNTIME" "$HOME/Library/LaunchAgents"
chmod 700 "$RUNTIME"
cp "$HERE/agent.py" "$HERE/service_adapter.py" "$RUNTIME/"
chmod 600 "$RUNTIME/agent.py" "$RUNTIME/service_adapter.py"
ESCAPED_PYTHON=$("$PYTHON" -c 'import html,sys; print(html.escape(sys.argv[1]))' "$PYTHON")
ESCAPED_AGENT=$("$PYTHON" -c 'import html,sys; print(html.escape(sys.argv[1]))' "$RUNTIME/agent.py")
ESCAPED_LOG=$("$PYTHON" -c 'import html,sys; print(html.escape(sys.argv[1]))' "$HOME/.observer/agent.log")
ESCAPED_ERR=$("$PYTHON" -c 'import html,sys; print(html.escape(sys.argv[1]))' "$HOME/.observer/agent-errors.log")
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList/1.0/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$ESCAPED_PYTHON</string><string>$ESCAPED_AGENT</string><string>watch</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$ESCAPED_LOG</string>
<key>StandardErrorPath</key><string>$ESCAPED_ERR</string>
</dict></plist>
EOF
chmod 600 "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL (logs: $HOME/.observer)"
