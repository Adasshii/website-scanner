FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Copy shared types first
COPY types/ ./types/

# Copy scanner-service package files and install deps
COPY scanner-service/package*.json ./scanner-service/
WORKDIR /app/scanner-service
# --ignore-scripts skips the postinstall Playwright browser download
# (the mcr.microsoft.com/playwright image already has Chromium at /ms-playwright)
RUN npm ci --ignore-scripts

# The service source imports the shared scoring module (@shared-lib/scoring),
# and the service tsconfig maps that specifier one directory up (../lib/*),
# so this file has to be present in the image for tsc to resolve it. Copy
# only scoring.ts, not the rest of lib/ -- that directory also holds the
# outreach, send-gate, suppression, legal-basis and retention modules, which
# must stay out of the scanner container. Positioned after npm ci so editing
# scoring.ts does not invalidate the dependency install layer above.
COPY lib/scoring.ts /app/lib/scoring.ts

# Copy scanner-service source and build
COPY scanner-service/ .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/scanner-service/src/index.js"]
