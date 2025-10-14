# SPDX-License-Identifier: Apache-2.0
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY .npmrc ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY tsconfig.json ./

ENV NODE_ENV=dev
ENV FUNCTION_NAME="data-enrichment"
ENV MAX_CPU=1
ENV DATABASE_URL=postgresql://postgres:postgres@10.10.80.37:5432/tcs?schema=public
ENV CONFIGURATION_DATABASE=tcs
ENV CONFIGURATION_DATABASE_USER=postgres
ENV CONFIGURATION_DATABASE_PASSWORD=postgres
ENV CONFIGURATION_DATABASE_HOST=10.10.80.37
ENV ENCRYPTION_KEY=8fj29dkd82hs91kd93kd82hs91kd83ks
ENV SALT_ROUNDS=9

EXPOSE 3001

CMD ["npm", "run", "start:dev"]