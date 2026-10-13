FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts playwright.config.ts ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY tests ./tests
COPY browser-tests ./browser-tests
COPY scripts ./scripts
COPY Video/README.md ./Video/README.md
# The backend build does not package frontend images, videos or fonts.
# TypeScript needs the media import declaration, not the binary file.
RUN npm run build:api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 SERVE_STATIC=false DATA_DIR=/var/lib/empregatos PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir -p /var/lib/empregatos && chown node:node /var/lib/empregatos
COPY --from=builder /app/dist-server ./dist-server
COPY migrations ./migrations
USER node
EXPOSE 3001
CMD ["node", "dist-server/index.js"]
