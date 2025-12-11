# Data Enrichment Service

## Overview

High-performance middleware service for the Tazama FRMS (Fraud Risk Management System) that receives, validates, and enriches data.

**Key Capabilities:**

- Validates incoming transactions using JSON Schema
- Enriches transaction data with additional context
- Routes processed events via NATS messaging
- Persists transaction relationships in PostgreSQL
- Provides Redis caching for improved performance
- Implements job queue processing for asynchronous tasks

### Setting Up

```sh
git clone https://github.com/tazama-lf/data-enrichment-service
cd data-enrichment-service
```

You then need to configure your environment: a [sample](.env.sample) configuration file has been provided and you may adapt that to your environment. Copy it to `.env` and modify as needed:

```sh
cp .env.sample .env
```

#### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Valkey 7+
- NATS Server 2.10+

#### Build and Start

```sh
npm install
docker-compose up -d redis nats postgres (do not worry if full-stack-docker is running)
npm run start:dev
```

The service will be available at `http://localhost:3001`

## Configuration

### Application Variables

| Variable         | Purpose                                | Default | Example                  | Required |
| ---------------- | -------------------------------------- | ------- | ------------------------ | -------- |
| `FUNCTION_NAME`  | Service identifier                     | -       | `data-enrichment`        | Yes      |
| `NODE_ENV`       | Application environment                | `dev`   | `dev`, `prod`, `test`    | Yes      |
| `MAX_CPU`        | Maximum CPU cores to use               | `1`     | `1`, `2`, `4`            | Yes      |
| `SIZE`           | Maximum request body size              | `100mb` | `150mb`                  | Yes      |
| `SALT_ROUNDS`    | Password hashing rounds                | `9`     | `10`, `12`               | Yes      |
| `ENCRYPTION_KEY` | AES encryption key for sensitive data  | -       | `32-character-hex-key`   | Yes      |

### Database Variables

| Variable                      | Purpose                          | Example                                                  | Required |
| ----------------------------- | -------------------------------- | -------------------------------------------------------- | -------- |
| `CONFIGURATION_DATABASE_URL`  | PostgreSQL connection string     | `postgresql://postgres:password@localhost:5432/database` | Yes      |

**Note:** The connection string format is `postgresql://[user[:password]@][host][:port][/database]`

### Redis Cache Variables

| Variable         | Purpose                       | Default | Example          | Required |
| ---------------- | ----------------------------- | ------- | ---------------- | -------- |
| `REDIS_HOST`     | Redis server hostname         | -       | `localhost`      | Yes      |
| `REDIS_PORT`     | Redis server port             | `6379`  | `6379`           | Yes      |
| `REDIS_PASSWORD` | Redis authentication password | -       | `redis-password` | Yes      |
| `CACHE_TTL`      | Cache time-to-live (seconds)  | `3600`  | `86400`          | Yes      |

### NATS Messaging Variables

| Variable          | Purpose                              | Example                        | Required |
| ----------------- | ------------------------------------ | ------------------------------ | -------- |
| `SERVER_URL`      | NATS server address                  | `localhost:4222`               | Yes      |
| `STARTUP_TYPE`    | Service startup type                 | `nats`                         | Yes      |
| `PRODUCER_STREAM` | Stream name for outbound messages    | `config.notification.response` | Yes      |
| `CONSUMER_STREAM` | Stream name for inbound messages     | `config.notification`          | Yes      |
| `STREAM_SUBJECT`  | NATS subject for configuration       | `config.notification`          | Yes      |

### APM (Application Performance Monitoring) Variables

| Variable            | Purpose                       | Example                         | Required |
| ------------------- | ----------------------------- | ------------------------------- | -------- |
| `APM_ACTIVE`        | Enable/disable APM monitoring | `true`, `false`                 | No       |
| `APM_URL`           | Elastic APM server URL        | `http://localhost:8200`         | No       |
| `APM_SECRET_TOKEN`  | APM authentication token      | `your-secret-token`             | No       |
| `APM_SERVICE_NAME`  | Service name in APM           | `data-enrichment`               | No       |

### Authentication Variables

| Variable               | Purpose                               | Example                                    | Required |
| ---------------------- | ------------------------------------- | ------------------------------------------ | -------- |
| `TAZAMA_AUTH_URL`      | Tazama authentication service URL     | `http://localhost:3020/v1/auth`            | Yes      |
| `AUTH_PUBLIC_KEY_PATH` | Path to JWT public key file           | `public-key.pem`                           | Yes      |
| `CERT_PATH_PUBLIC`     | Path to public certificate            | `public-key.pem`                           | Yes      |

### Logging Variables

| Variable          | Purpose                                   | Default | Example                  | Required |
| ----------------- | ----------------------------------------- | ------- | ------------------------ | -------- |
| `SIDECAR_HOST`    | Logstash sidecar host and port            | -       | `localhost:5000`         | Yes      |
| `LOGSTASH_LEVEL`  | Logging level for Logstash                | `info`  | `info`, `debug`, `error` | Yes      |

## API

### 1. Process Enrichment

#### Description

Validates, enriches, and processes data.

**Endpoint:** `POST /{endpoint}`

**Headers:**
- `Authorization: Bearer <jwt-token>`
- `Content-Type: application/json`

**Request Body:**

```json
{
  "body": {
    "Name": "John Doe",
    "country": "USA",
    "city": "New York",
    "email": "john.doe@example.com"
  }
}
```

#### Response

- **Status Code:** 200 OK
- **Content-Type:** application/json
- **Body:**

```json
{
  "message": "Data Enriched Successfully",
  "success": true
}
```

## Internal Process Flow

### Push Job Flow

Push jobs are triggered by external API calls and process data immediately.

```mermaid
sequenceDiagram
    participant Client as Client/Service
    participant DEAPI as Data Enrichment Service
    participant Redis as Redis Cache
    participant DB as PostgreSQL
    
    Client->>DEAPI: 1. POST /{endpoint} (with JWT)
    DEAPI->>DEAPI: 2. Validate JWT token
    DEAPI->>Redis: 3. Fetch job config from cache
    Redis-->>DEAPI: Job configuration
    DEAPI->>DEAPI: 4. Validate data against schema
    alt Validation Failed
        DEAPI-->>Client: 400: Validation errors
    end
    DEAPI->>DEAPI: 5. Transform & enrich data
    DEAPI->>DB: 6. Store enriched data
    DEAPI-->>Client: 7. 200: Success response
```

### Pull Job Flow

Pull jobs are scheduled via NATS notifications and execute based on cron expressions.

```mermaid
sequenceDiagram
    participant TCS as TCS Configuration Service
    participant NATS as NATS Server
    participant DEAPI as Data Enrichment Service
    participant Source as External Source (HTTP/SFTP)
    participant DB as PostgreSQL
    
    TCS->>NATS: 1. Publish job configuration
    NATS->>DEAPI: 2. Notify job activation
    DEAPI->>DEAPI: 3. Schedule cron job
    Note over DEAPI: Wait for cron trigger
    DEAPI->>Source: 4. Fetch data (HTTP/SFTP)
    Source-->>DEAPI: Raw data (JSON/CSV/TSV)
    DEAPI->>DEAPI: 5. Transform to JSON
    alt Transformation Failed
        DEAPI->>DEAPI: Increment failure count
        DEAPI->>DEAPI: Remove job if limit reached
    end
    DEAPI->>DB: 6. Ingest transformed data
    DEAPI->>NATS: 7. Send ACK/NACK response
```

## Testing

Run the test suite to validate functionality:

```sh
# Run all tests
npm run test

# Run tests with coverage
npm run test:cov

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Service won't start

**Issue:** `npm install` fails
- Ensure Node.js 20+ is installed
- Check network access to npm registry

**Issue:** Database connection errors
- Verify PostgreSQL is running: `docker ps` or check service status
- Confirm credentials in `.env` match your database

**Issue:** Redis connection errors
- Check REDIS is running: `docker ps` or service status
- Verify `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` in `.env`

**Issue:** NATS messaging failures
- Check NATS server is running: `docker ps` or service status
- Verify `NATS_URL` in `.env`

### Authentication Errors

- Verify JWT token is valid and not expired
- Check `JWT_SECRET` matches across services
- Ensure `AUTH_SERVICE_URL` is reachable
