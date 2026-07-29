# Noema — zero-dependency vanilla Node.js app.
# There is no npm install step because the project has no external Node.js dependencies.
FROM node:22-alpine

# The full archive-backup endpoint invokes the system `zip` command.
RUN apk add --no-cache zip

# Do not run as root.
WORKDIR /app

# Copy only what is required at runtime.
COPY package.json ./
COPY src ./src
COPY public ./public

# data/ is mounted as a volume for persistence outside the image.
# Create it in advance and give the non-root `node` user ownership.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

# Health check uses the built-in /healthz endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/index.js"]
