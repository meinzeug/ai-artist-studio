FROM node:22.23.1-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core postgresql-client ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /data/assets && chown -R node:node /data /app
USER node
ENV NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3210"]
