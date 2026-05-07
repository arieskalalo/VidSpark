FROM node:20-slim

# Install system dependencies required by Remotion (FFmpeg + Chromium)
RUN apt-get update && apt-get install -y \
  ffmpeg \
  chromium \
  fonts-liberation \
  fonts-noto-color-emoji \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Remotion/Puppeteer to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source files (src/remotion/ must exist at runtime for bundling)
COPY . .

# Build the Next.js app
RUN npm run build

# Pre-bundle the Remotion compositions so the first render is not slow
RUN node scripts/prebundle.mjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "run", "start"]
