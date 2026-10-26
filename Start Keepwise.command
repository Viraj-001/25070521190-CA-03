#!/bin/zsh
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE_HOME="$ROOT/.runtime/node/bin"
MONGOD="$ROOT/.runtime/mongodb/bin/mongod"
DB_PATH="$ROOT/.runtime/mongodb-data"

if [[ ! -x "$NODE_HOME/node" ]]; then
  echo "Keepwise's local Node.js runtime is missing. Install Node.js LTS from nodejs.org, then run again."
  read "?Press Return to close..."
  exit 1
fi
if [[ ! -x "$MONGOD" ]]; then
  echo "Keepwise's local MongoDB server is missing. Follow the MongoDB setup in README.md, then run again."
  read "?Press Return to close..."
  exit 1
fi

export PATH="$NODE_HOME:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$DB_PATH"

if ! nc -z -G 1 127.0.0.1 27017 2>/dev/null; then
  "$MONGOD" --dbpath "$DB_PATH" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$ROOT/.runtime/mongodb.log"
fi

cd "$ROOT/Server"
npm run seed
npm run dev &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:5000/api/health >/dev/null; then
    break
  fi
  sleep 1
done

cd "$ROOT/Client"
npm run desktop
