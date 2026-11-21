#!/usr/bin/env bash
# Teste de ponta a ponta: servidor simulado + vigia rodando ~75 s, depois confere os alertas recebidos.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
export MOCK_PORT=8787 MOCK_SMTP_PORT=2526 PHASE_S=15 MOCK_OUT="$T/received.jsonl"
node test/mock-server.js > "$T/mock.log" 2>&1 & MOCK=$!
trap 'kill $MOCK 2>/dev/null || true' EXIT
sleep 1
env -i PATH="$PATH" HOME="$HOME" ${CHROMIUM_PATH:+CHROMIUM_PATH=$CHROMIUM_PATH} \
  CONFIG_FILE=test/config.test.js STATE_FILE="$T/state.json" EXTRA_FILE="$T/none.txt" \
  WHATSAPP_TO="+5511999990000:KEY123" CALLMEBOT_URL="http://127.0.0.1:$MOCK_PORT/callmebot" WHATSAPP_MIN_GAP_S=0 \
  NTFY_TOPIC=teste NTFY_URL="http://127.0.0.1:$MOCK_PORT/ntfy" \
  EMAIL_TO=voce@exemplo.com SMTP_HOST=127.0.0.1 SMTP_PORT=$MOCK_SMTP_PORT SMTP_SECURE=false SMTP_USER=u SMTP_PASS=p \
  TICK_MS=500 MAX_RUNTIME_S=70 node watch.js > "$T/watch.log" 2>&1 || { echo "vigia saiu com erro"; tail -30 "$T/watch.log"; exit 1; }
node test/assert.js "$T/received.jsonl" "$T/state.json"
echo "logs em $T"
