# Noema — zero-dependency vanilla Node.js app with built-in SQLite.
FROM node:24-alpine

ARG SOURCE_COMMIT=unknown

# Backups use zip/unzip; curl is used by the build and runtime health checks.
RUN apk add --no-cache curl unzip zip

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY test ./test

# Run deterministic syntax and storage tests without production authentication requirements.
RUN NODE_ENV=test \
    ALLOW_INSECURE_NO_AUTH=true \
    NOEMA_DATA_DIR=/tmp/noema-tests \
    ENCRYPTION_KEY=container-test-key \
    npm run check \
    && rm -rf /tmp/noema-tests

# Expose the deployed source revision to the footer.
RUN node -e "const fs=require('node:fs');const commit=(process.env.SOURCE_COMMIT||'unknown').trim();fs.writeFileSync('/app/public/build-version.json',JSON.stringify({commit}));"

# Fail the image build if the complete strict production graph cannot start.
# The production smoke test intentionally uses only UI_PASSWORD for browser
# authentication and protection of the installation data-encryption key.
RUN set -eu; \
    NODE_ENV=production \
    NOEMA_DATA_DIR=/tmp/noema-build-smoke \
    HOST=127.0.0.1 \
    PORT=3999 \
    PUBLIC_BASE_URL=https://127.0.0.1:3999 \
    NOEMA_CORS_ORIGIN=https://127.0.0.1:3999 \
    UI_PASSWORD=ci-ui-master-password \
    NOEMA_API_TOKEN=ci-api-token \
    NOEMA_BACKUP_PASSWORD=ci-backup-password \
    node src/index.js >/tmp/noema-build-smoke.log 2>&1 & \
    pid=$!; healthy=0; \
    for attempt in 1 2 3 4 5; do \
      sleep 1; \
      if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3999/healthz >/dev/null; then healthy=1; break; fi; \
    done; \
    if [ "$healthy" -ne 1 ]; then cat /tmp/noema-build-smoke.log; kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; exit 1; fi; \
    kill "$pid"; wait "$pid" 2>/dev/null || true; rm -rf /tmp/noema-build-smoke /tmp/noema-build-smoke.log

RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent --show-error --max-time 4 "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null || exit 1

USER node
CMD ["node", "src/index.js"]
