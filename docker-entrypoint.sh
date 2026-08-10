#!/bin/sh
set -eu

DATA_DIR="${NOEMA_DATA_DIR:-/app/data}"
PERMISSION_MARKER="$DATA_DIR/.noema-node-owned-v1"

mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  if [ ! -e "$PERMISSION_MARKER" ]; then
    chown -R node:node "$DATA_DIR"
    touch "$PERMISSION_MARKER"
    chown node:node "$PERMISSION_MARKER"
  else
    # Coolify may recreate the mount point with root ownership between deploys.
    chown node:node "$DATA_DIR"
  fi

  exec su-exec node "$@"
fi

exec "$@"
