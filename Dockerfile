# SPDX-License-Identifier: Apache-2.0

ARG BUILD_IMAGE=node:20-bullseye
ARG RUN_IMAGE=gcr.io/distroless/nodejs20-debian11:nonroot

FROM ${BUILD_IMAGE} AS builder
LABEL stage=build
# TS -> JS stage

WORKDIR /home/app
COPY ./src ./src
COPY ./package*.json ./
COPY ./tsconfig.json ./
COPY .npmrc ./
ARG GH_TOKEN

RUN npm ci --ignore-scripts
RUN npm run build

FROM ${BUILD_IMAGE} AS dep-resolver
LABEL stage=pre-prod
# To filter out dev dependencies from final build

COPY package*.json ./
COPY .npmrc ./
ARG GH_TOKEN
RUN npm ci --omit=dev --ignore-scripts

FROM ${RUN_IMAGE} AS run-env
USER nonroot

WORKDIR /home/app
COPY --from=dep-resolver /node_modules ./node_modules
COPY --from=builder /home/app/dist ./build
COPY package.json ./

# GLOBAL
ENV NODE_ENV=dev
ENV FUNCTION_NAME=data-enrichment
ENV PORT=3001
ENV MAX_CPU=1
ENV SIZE=150mb
ENV CORS_ORIGINS=localhost

# POSTGRES
ENV POSTGRES_CONTAINER_NAME=my_postgres
ENV POSTGRES_PORT=5432
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_DB=mydb
ENV CONFIGURATION_DATABASE_URL=postgresql://postgres:postgres@localhost/uat

# REDIS
ENV REDIS_CONTAINER_NAME=data-enrichment-redis
ENV REDIS_HOST=10.10.80.37
ENV REDIS_PORT=6379
ENV REDIS_PASSWORD=redis-password
ENV CACHE_TTL=86400

# NATS
ENV NATS_CONTAINER_NAME=data-enrichment-nats
ENV SERVER_URL=nats://localhost:4222
ENV NATS_PORT=4222
ENV NATS_HTTP_PORT=8222
ENV STARTUP_TYPE=nats
ENV PRODUCER_STREAM=config.notification.response
ENV CONSUMER_STREAM=config.notification
ENV STREAM_SUBJECT=config.notification

# ENCRYPTION
ENV ENCRYPTION_KEY=encryption_key_here
ENV SALT_ROUNDS=9

# APM
ENV APM_ACTIVE=true
ENV APM_URL=http://localhost:8200
ENV APM_SERVICE_NAME=data-enrichment-uat

# AUTH
ENV TAZAMA_AUTH_URL=http://localhost:3020/v1/auth
ENV AUTH_PUBLIC_KEY_PATH=/opt/cert/public-key.pem
ENV CERT_PATH_PUBLIC=/opt/cert/public-key.pem

# SIDECAR
ENV SIDECAR_HOST=localhost:5000

# LOGGING
ENV LOGSTASH_LEVEL=info

# Execute watchdog command
CMD ["build/main.js"]