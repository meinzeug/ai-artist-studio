#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if test "$(id -u)" -eq 0; then echo 'Bitte als normaler Benutzer ausführen.'; exit 1; fi
for binary in node npm ffmpeg ffprobe cc apt dpkg-deb; do command -v "$binary" >/dev/null || { echo "Fehlt: $binary"; exit 1; }; done
test -x /usr/lib/postgresql/16/bin/initdb || { echo 'PostgreSQL 16 Serverwerkzeuge fehlen. Siehe docs/OPERATIONS.md.'; exit 1; }
mkdir -p .local
npm ci
cc -O2 -Wall -Wextra src/runner/isolate.c -o .local/studio-isolate
if ! test -f .env; then node --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';import {randomBytes} from 'node:crypto';import {userInfo} from 'node:os';const user=userInfo().username;const pass=randomBytes(24).toString('hex');writeFileSync('.env',`DATABASE_URL=postgresql://${user}:${pass}@127.0.0.1:56432/artist_studio\nREDIS_URL=redis://127.0.0.1:57379\nAPP_ORIGIN=http://127.0.0.1:3210\nSTORAGE_ROOT=./data/assets\nRUNNER_URL=http://127.0.0.1:3211\nRUNNER_TOKEN=${randomBytes(32).toString('hex')}\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`,{mode:0o600});
JS
fi
if ! test -f .env.runner; then node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';import dotenv from 'dotenv';const e=dotenv.parse(readFileSync('.env'));writeFileSync('.env.runner',`RUNNER_TOKEN=${e.RUNNER_TOKEN}\nRUNNER_PORT=3211\nRUNNER_BIND=127.0.0.1\n`,{mode:0o600});
JS
fi
if ! test -d .local/postgres; then /usr/lib/postgresql/16/bin/initdb -D .local/postgres -A trust --no-locale -E UTF8 > .local/initdb.log; fi
if ! test -x .local/redis/usr/bin/redis-server; then
  (cd .local && apt download redis-server redis-tools liblzf1 liblua5.1-0 && for file in ./*.deb; do dpkg-deb -x "$file" redis; done)
fi
bash scripts/local-services.sh start
node --import tsx scripts/setup-database.ts
npm run db:migrate
npm run build
echo 'Startbereit. npm run studio:start; danach http://127.0.0.1:3210 öffnen.'
