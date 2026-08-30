#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/uploads/profiles
  chown node:node /data /data/uploads /data/uploads/profiles
  exec gosu node "$@"
fi

exec "$@"
