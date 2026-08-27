#!/bin/bash
# Session Timeline — shows key events for the most recent custom-llm session
# Usage: ./session-timeline.sh [lines]  (default: 2000 lines of logs)

LINES=${1:-2000}
LOG=$(pm2 logs server-custom-llm --lines "$LINES" --nostream 2>&1)

# Find the most recent channel
CHANNEL=$(echo "$LOG" | grep -oP 'channel=\K[A-Z0-9]+' | tail -1)
if [ -z "$CHANNEL" ]; then
  echo "No active session found in last $LINES log lines."
  exit 1
fi

echo "Session: $CHANNEL"
echo "=================================================="
echo ""

# 1. First /chat/completions request (agent call arrived)
echo "--- Agent & Connection ---"
FIRST_REQ=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Context:')
[ -n "$FIRST_REQ" ] && echo "  Chat request:      $(echo "$FIRST_REQ" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1 || echo '(no timestamp)')"

# 2. Agent registered
REG=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'AgentRegistered\|RegisterAgent.*registered')
[ -n "$REG" ] && echo "  Agent registered:   $(echo "$REG" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1 || echo '(see log)')"

# 3. Audio subscriber spawned
SPAWN=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Spawning child')
[ -n "$SPAWN" ] && echo "  Audio sub spawned:  $(echo "$SPAWN" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1 || echo '(see log)')"

# 4. Audio subscriber connected to channel
CONNECTED=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Connected to channel')
[ -n "$CONNECTED" ] && echo "  Audio sub connected:$(echo "$CONNECTED" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 5. Audio frame observer registered
OBSERVER=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Audio frame observer')
[ -n "$OBSERVER" ] && echo "  Frame observer:     $(echo "$OBSERVER" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 6. Thymia WS connected
THYMIA_WS=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Thymia connected\|Config sent\|flushing buffered')
[ -n "$THYMIA_WS" ] && echo "  Thymia WS ready:    $(echo "$THYMIA_WS" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 7. User UID joined
USER_JOIN=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'target=101.*User joined.*101\|Subscribed to audio from UID 101')
[ -n "$USER_JOIN" ] && echo "  User audio sub'd:   $(echo "$USER_JOIN" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 8. RTM logged in
RTM_LOGIN=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Logged in as')
[ -n "$RTM_LOGIN" ] && echo "  RTM logged in:      $(echo "$RTM_LOGIN" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 9. RTM subscribed
RTM_SUB=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Subscribed$')
[ -n "$RTM_SUB" ] && echo "  RTM subscribed:     $(echo "$RTM_SUB" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

echo ""
echo "--- Thymia Biomarkers ---"

# 10. First progress with speech > 0
FIRST_SPEECH=$(echo "$LOG" | grep 'speech_seconds:[1-9]\|speech_seconds:0\.[1-9]' | head -1)
if [ -n "$FIRST_SPEECH" ]; then
  TS=$(echo "$FIRST_SPEECH" | grep -oP 't=\K\d+' | head -1)
  [ -n "$TS" ] && echo "  First speech:       $(date -u -d @$((TS/1000)) '+%H:%M:%S' 2>/dev/null || echo "t=$TS")"
fi

# 11. First POLICY_RESULT (biomarkers from Thymia)
FIRST_BIO=$(echo "$LOG" | grep -m1 'POLICY_RESULT.*passthrough.*biomarkers')
if [ -n "$FIRST_BIO" ]; then
  BIO_TS=$(echo "$FIRST_BIO" | grep -oP '"timestamp":\K[0-9.]+' | head -1)
  [ -n "$BIO_TS" ] && echo "  First biomarkers:   $(date -u -d @${BIO_TS%.*} '+%H:%M:%S' 2>/dev/null || echo "ts=$BIO_TS")"
fi

# 12. First biomarkers published to client
FIRST_PUB=$(echo "$LOG" | grep -m1 'biomarkers published=true')
if [ -n "$FIRST_PUB" ]; then
  PUB_TS=$(echo "$FIRST_PUB" | grep -oP 't=\K\d+' | head -1)
  [ -n "$PUB_TS" ] && echo "  Published to client:$(date -u -d @$((PUB_TS/1000)) '+%H:%M:%S' 2>/dev/null || echo "t=$PUB_TS")"
fi

echo ""
echo "--- Shen Camera Vitals ---"

# 13. Shen vitals received
FIRST_SHEN=$(echo "$LOG" | grep -m1 'shen\.vitals\|Received shen')
if [ -n "$FIRST_SHEN" ]; then
  echo "  First shen.vitals:  $(echo "$FIRST_SHEN" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1 || echo '(see log)')"
else
  echo "  First shen.vitals:  (none received)"
fi

echo ""
echo "--- Session End ---"

# 14. Target left
TARGET_LEFT=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Target UID.*left\|target_left')
[ -n "$TARGET_LEFT" ] && echo "  User left:          $(echo "$TARGET_LEFT" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

# 15. Cleanup
CLEANUP=$(echo "$LOG" | grep "$CHANNEL" | grep -m1 'Session stopped\|Child exited')
[ -n "$CLEANUP" ] && echo "  Cleaned up:         $(echo "$CLEANUP" | grep -oP '\d{2}:\d{2}:\d{2}' | head -1)"

echo ""
echo "--- Active Sessions ---"
echo "$LOG" | grep -c 'status: connected' | xargs -I{} echo "  Audio subscribers running: {}"
echo "$LOG" | grep 'RTM.*Logged in\|RTM.*Subscribed' | tail -3
