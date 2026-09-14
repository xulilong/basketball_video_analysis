#!/bin/bash
set -e
cd "$(dirname "$0")"
# Use the compatible Node installation available on this Mac.
if [ -x /opt/homebrew/opt/node@18/bin/node ]; then
  export PATH="/opt/homebrew/opt/node@18/bin:$PATH"
fi
export NEXT_TELEMETRY_DISABLED=1
exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "${PORT:-3001}"
