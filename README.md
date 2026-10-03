# Wardrobe Assistant Backend

A microservices-based backend for a wardrobe assistant application, providing intelligent wardrobe management, outfit suggestions, and conversational assistance. Built with NestJS, TypeORM, RabbitMQ, and integrating Google Generative AI (Gemini).

## 🏗️ Architecture
The system follows a Microservices Architecture using the API Gateway pattern:
- **API Gateway (`wardrobe-api-gateway`)**: Public-facing HTTP server that routes external traffic to backend services over RabbitMQ (port 3000).
- **Auth Service (`auth`)**: Manages user identity, registration, and sessions (JWT).
- **Wardrobe Service (`wardrobe`)**: Core domain handling clothing categories, attributes, and user relationships.
- **Media Storage Service (`media-storage`)**: Manages and processes asset uploads (images) using AWS S3.
- **AI Assistant Service (`ai-assistant`)**: Integrates Gemini Vision/Flash models, constructs context for outfits, and relies on a webhook polling/dispatching queue system for long-running generation tasks.

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js (for local development outside containers, optional)
- AWS Account (S3 access keys for `media-storage`)
- Google AI API Key (for `ai-assistant`)

### Environment Setup
You must configure the `.env` files for each microservice before running the platform. Base files off `.env.example` in each application.

1. **`apps/ai-assistant/.env`**:
   Needs `RABBIT_MQ_AI_ASSISTANT_QUEUE`, `GEMINI_API_KEY`, `AI_ASSISTANT_WEBHOOK_URL`, `AI_ASSISTANT_WEBHOOK_AUTH_HEADER`, `PROTECTED_DATA_SECRET`, `WEBHOOK_MAX_ATTEMPTS`, etc.
2. **`apps/media-storage/.env`**:
   Needs AWS S3 credentials (e.g., `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`).
3. **`apps/wardrobe-api-gateway/.env`**:
   Needs queue names like `RABBIT_MQ_AI_ASSISTANT_QUEUE`, `RABBIT_MQ_AUTH_QUEUE`, `RABBIT_MQ_WARDROBE_QUEUE`, etc.
4. **`apps/wardrobe/.env` & `apps/auth/.env`**:
   Needs Postgres connection variants and queue definitions.

Two more `.env` files are shared across services rather than living under `apps/*`, and are easy to miss because nothing under `apps/*/.env.example` inlines their variables (each affected app's `.env.example` only carries a comment pointing at them):

5. **`libs/common/src/database/.env`**:
   `POSTGRES_*` connection variables, read by every service that talks to Postgres (`wardrobe`, `auth`, `ai-assistant`).
6. **`libs/common/src/jwt/.env`**:
   `JWT_SECRET_KEY` and related JWT config, read by `auth` and `wardrobe-api-gateway`.

Copy both from their `.env.example` alongside the app-level files above — the stack will not boot without them.

### Starting the Project (Docker Compose)
The entire stack (microservices + Postgres + RabbitMQ) is wired within the root `docker-compose.yml`.

Start all containers natively:
```bash
docker-compose up --build
```
This builds each service (using their respective `DockerFile`) and boots up Postgres and RabbitMQ first. A one-shot `migrate` service then runs before `wardrobe`, `auth` and `ai-assistant` start: it creates the app's Postgres database if it does not already exist (handles both a fresh volume and a pre-existing one — no manual `docker compose down -v` needed) and applies all pending TypeORM migrations. `POSTGRES_SYNCHRONIZE` stays `false`; schema only ever changes through migrations, never through auto-sync.

Services map local directories to `/usr/src/app` inside the container for hot-reloading (`npm run start:dev [service]`).

### Updating dependencies (`Module not found` after pulling new packages)
Each service mounts the repository at `/usr/src/app` and layers an anonymous volume over `/usr/src/app/node_modules`, so containers use the `npm install` performed at image build time rather than the host's `node_modules`. Docker seeds an anonymous volume **only when it first creates it** and reuses it on every later `up` — including after `--build`. A rebuilt image therefore keeps serving the dependency set the volume was created with, and any package added since then fails to resolve:

```
ERROR in ./apps/wardrobe/src/wardrobe.module.ts
Module not found: Error: Can't resolve '@nestjs/schedule'
```

Whenever `package.json` changes, rebuild with the anonymous volumes renewed:
```bash
docker compose up -d --build --force-recreate --renew-anon-volumes
```
`--renew-anon-volumes` (`-V`) discards those volumes and re-seeds them from the freshly built image. Named volumes are left untouched, so `postgres_data` — and the database inside it — survives.

Do **not** reach for `docker compose down -v` here: that flag removes named volumes too, and will drop the database.

Recreating containers orphans the previous anonymous volumes instead of reusing them, so they accumulate and can eventually exhaust the disk — a build dying with `no space left on device` part-way through a layer is the usual symptom. Reclaim them periodically (`docker system df` shows how much is recoverable):
```bash
docker volume prune -f
docker builder prune -af
```

## 💅 Code Style & Conventions
**Formatting and Linting**
The repository uses **ESLint** and **Prettier** to enforce formatting rules across the codebase:
- Use **single quotes** (`'...'`) for strings, unless double quotes are necessary inside strings.
- Leave **trailing commas** everywhere (`trailingComma: "all"` in Prettier).
- Explicit `any`, missing interface name prefixes, and missing function return types form part of the relaxed TypeScript strictness in linting.
- Run `npm run format` and `npm run lint` before committing to ensure adherence.

**File Naming Conventions**
- Use **kebab-case** for file and directory names (e.g., `ai-assistant`, `user-account.entity.ts`).
- Include the **file type** as a dot-separated suffix before the `.ts` extension (e.g., `.module.ts`, `.controller.ts`, `.service.ts`, `.entity.ts`, `.dto.ts`, `.job.ts`).

## 🗄️ Database & Migrations
The project uses TypeORM & PostgreSQL. The primary entities are defined in `libs/common/src/database/entities/`. 

To manage schemas, use standard TypeORM CLI commands configured in `package.json`:
```bash
npm run typeorm:generate-migration --name=MigrationName
npm run typeorm:migrate
```

Running outside Docker (services on the host against a containerised Postgres), create the database and apply migrations in one step with:
```bash
npm run db:bootstrap
```
This is the same command the `migrate` compose service runs; it is idempotent, so re-running it on a database that already exists and has all migrations applied is a no-op.

## 🧪 Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e
```
