#!/bin/sh
set -eu

DATA_DIR="${NOEMA_DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # Mounted volumes and disaster-recovery restores can reintroduce root-owned
  # files after a previously healthy deployment. Inspect each top-level tree
  # instead of trusting a persistent ownership marker.
  chown node:node "$DATA_DIR"

  for target in "$DATA_DIR"/* "$DATA_DIR"/.[!.]* "$DATA_DIR"/..?*; do
    [ -e "$target" ] || continue
    if find "$target" \( ! -user node -o ! -group node \) -print -quit 2>/dev/null | grep -q .; then
      chown -R node:node "$target"
    fi
  done

  exec su-exec node "$@"
fi

exec "$@"
