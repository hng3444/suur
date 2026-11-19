#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/uploads/profiles /data/uploads/branding /data/backups
  chown -R node:node /data
  exec gosu node "$@"
fi

exec "$@"
