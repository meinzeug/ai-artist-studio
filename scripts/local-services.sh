#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-start}" in
start)
  test -d .local/postgres || { echo 'Zuerst npm run setup:local ausführen.'; exit 1; }
  /usr/lib/postgresql/16/bin/pg_ctl -D .local/postgres status >/dev/null 2>&1 || /usr/lib/postgresql/16/bin/pg_ctl -D .local/postgres -l .local/postgres.log -o '-h 127.0.0.1 -p 56432 -k /tmp' start
  if ! test -f .local/redis.pid || ! kill -0 "$(cat .local/redis.pid)" 2>/dev/null; then
    LD_LIBRARY_PATH="$PWD/.local/redis/usr/lib/x86_64-linux-gnu" .local/redis/usr/bin/redis-server --port 57379 --bind 127.0.0.1 --dir "$PWD/.local" --appendonly yes --daemonize yes --pidfile "$PWD/.local/redis.pid" --logfile "$PWD/.local/redis.log"
  fi
  ;;
stop)
  /usr/lib/postgresql/16/bin/pg_ctl -D .local/postgres stop -m fast
  if test -f .local/redis.pid; then kill -TERM "$(cat .local/redis.pid)"; fi
  ;;
*) echo 'Aufruf: scripts/local-services.sh start|stop'; exit 1;;
esac
