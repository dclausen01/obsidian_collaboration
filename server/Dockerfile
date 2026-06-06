# Token-issuing control plane (Fastify). Built and run as a container so it can
# be deployed alongside y-sweet via Docker / docker-compose (see docker-compose.yml
# and docs/deploy-plesk.md).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# Compile only src (test/ isn't copied, so the test-only devDeps aren't needed
# at runtime). tsconfig's test/** glob simply matches nothing here.
RUN npx tsc -p tsconfig.json

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    ISSUER_HOST=0.0.0.0 \
    ISSUER_PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
