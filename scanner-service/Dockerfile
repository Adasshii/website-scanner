FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Copy shared types first
COPY types/ ./types/

# Copy scanner-service package files and install deps
COPY scanner-service/package*.json ./scanner-service/
WORKDIR /app/scanner-service
# --ignore-scripts skips the postinstall Playwright browser download
# (the mcr.microsoft.com/playwright image already has Chromium at /ms-playwright)
RUN npm ci --ignore-scripts

# Copy scanner-service source and build
COPY scanner-service/ .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/scanner-service/src/index.js"]
