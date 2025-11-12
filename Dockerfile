FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY .npmrc ./
RUN npm ci

# Copy and build
COPY . .
RUN npm run build

FROM node:22-alpine as runner
WORKDIR /app

# Copy only necessary artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

EXPOSE 3001
CMD ["node", "/app/dist/main.js"]
