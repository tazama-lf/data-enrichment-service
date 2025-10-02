# SPDX-License-Identifier: Apache-2.0

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY .npmrc .npmrc ./
RUN npm install
COPY . .

RUN npm run build

FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY tsconfig.json ./

EXPOSE 3000

CMD ["npm", "run", "start:dev"]