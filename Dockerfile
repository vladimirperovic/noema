# Noema — zero-dependency vanilla Node.js app with built-in SQLite.
FROM node:24-alpine

# Coolify can inject the deployed Git SHA when "Include Source Commit in Build" is enabled.
ARG SOURCE_COMMIT=unknown

# The full archive-backup endpoint invokes the system `zip` command.
RUN apk add --no-cache zip

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

# Expose the exact source revision to the browser without baking it into source files.
RUN node -e "const fs=require('node:fs');const commit=(process.env.SOURCE_COMMIT||'unknown').trim();fs.writeFileSync('/app/public/build-version.json',JSON.stringify({commit}));"

RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/index.js"]
