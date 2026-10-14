# Build context: repository root.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @scamshield/web --workspace @scamshield/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:4000
RUN npm run build -w @scamshield/shared && npm run build -w @scamshield/web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
