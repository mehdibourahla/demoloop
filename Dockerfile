# One image serves both roles the architecture describes: a customer-run capture runner and a
# cloud worker. They differ by DEMOLOOP_KINDS and by which credentials they hold.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.docker.json ./
COPY src ./src
COPY runner ./runner
RUN npx tsc -p tsconfig.docker.json --outDir dist

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only chromium: the runner drives one browser, and this is a container customers host.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium && rm -rf /root/.npm

COPY --from=build /app/dist ./dist
COPY remotion ./remotion

RUN useradd --create-home runner && chown -R runner /app
USER runner

ENV DEMOLOOP_KINDS=capture
CMD ["node", "dist/runner/src/main.js"]
