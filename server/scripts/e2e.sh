#!/usr/bin/env bash
#
# M0 end-to-end orchestration:
#   1. generate y-sweet auth
#   2. start the y-sweet CRDT server (with auth)
#   3. start the token issuer (pointed at y-sweet)
#   4. run the smoke client (write -> reconnect -> verify)
#   5. tear everything down
#
# Usage: ./scripts/e2e.sh   (run from the server/ directory)
set -euo pipefail

cd "$(dirname "$0")/.."

YS_HOST=127.0.0.1
YS_PORT=8080
ISSUER_HOST=127.0.0.1
ISSUER_PORT=3000
DATA_DIR="./.ysweet-data"

cleanup() {
  [[ -n "${ISSUER_PID:-}" ]] && kill "$ISSUER_PID" 2>/dev/null || true
  [[ -n "${YS_PID:-}" ]] && kill "$YS_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> generating y-sweet auth"
AUTH_JSON="$(npx --no-install y-sweet gen-auth --json)"
PRIVATE_KEY="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).private_key)" "$AUTH_JSON")"
SERVER_TOKEN="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).server_token)" "$AUTH_JSON")"
CONNECTION_STRING="ys://${SERVER_TOKEN}@${YS_HOST}:${YS_PORT}"

echo "==> starting y-sweet server on ${YS_HOST}:${YS_PORT}"
npx --no-install y-sweet serve --prod --host "$YS_HOST" --port "$YS_PORT" --auth "$PRIVATE_KEY" "$DATA_DIR" \
  >/tmp/ysweet.log 2>&1 &
YS_PID=$!

echo "==> starting token issuer on ${ISSUER_HOST}:${ISSUER_PORT}"
Y_SWEET_CONNECTION_STRING="$CONNECTION_STRING" \
  ISSUER_HOST="$ISSUER_HOST" ISSUER_PORT="$ISSUER_PORT" \
  npx --no-install tsx src/index.ts >/tmp/issuer.log 2>&1 &
ISSUER_PID=$!

echo "==> waiting for issuer health"
for i in $(seq 1 30); do
  if curl -sf "http://${ISSUER_HOST}:${ISSUER_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ "$i" == "30" ]]; then
    echo "issuer did not become healthy"; echo "--- ysweet.log ---"; cat /tmp/ysweet.log
    echo "--- issuer.log ---"; cat /tmp/issuer.log; exit 1
  fi
done

echo "==> running smoke client"
ISSUER_URL="http://${ISSUER_HOST}:${ISSUER_PORT}" npx --no-install tsx test/smoke-client.ts
