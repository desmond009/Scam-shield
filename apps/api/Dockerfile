# Build context: repository root. One image serves both the API and the worker.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @scamshield/api --workspace @scamshield/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @scamshield/shared \
 && npx -w @scamshield/api prisma generate \
 && npm run build -w @scamshield/api \
 && npm prune --omit=dev --workspace @scamshield/api --workspace @scamshield/shared --include-workspace-root

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "entrypoint.sh"]
