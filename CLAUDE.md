# CLAUDE.md — Wardrobe Assistant Backend

## Architecture

NestJS monorepo (5 apps, 2 libs). All HTTP traffic enters `apps/wardrobe-api-gateway`; it forwards requests to microservices via RabbitMQ using request-response pattern. Business logic lives in the respective microservice, not the gateway.

**Apps:** `wardrobe-api-gateway` (HTTP, port 3000), `auth`, `wardrobe`, `media-storage`, `ai-assistant`
**Libs:** `libs/common` (DB entities, RMQ, JWT, exception filter, security utils), `libs/ai-assistant` (constants, DTOs)

See `PROJECT_STRUCTURE.md` for the directory map.

## Commands

```
npm run start:dev          # dev mode (wardrobe-api-gateway default)
npm run build              # build all apps
npm run lint               # ESLint --fix
npm run format             # Prettier
npm run test               # Jest (*.spec.ts under apps/)
npm run test:cov           # coverage
npm run test:e2e           # E2E suite
npm run typeorm:migrate    # run pending migrations
npm run typeorm:rollback   # revert last migration
npm run typeorm:generate-migration --name=Name
```

Docker: `docker-compose up` starts postgres, rabbitmq, and all 5 services.

## Code Patterns

### Microservice communication
- Gateway calls microservices via `ClientProxy.send(pattern, payload)` wrapped in `firstValueFrom()`.
- Payload shape: `RequestType<T>` = `{ user: UserAccountPreview | null, data: T }` — defined in `libs/common/src/types/`.
- Message pattern strings live in `apps/*/src/constants/` (gateway side) and `libs/ai-assistant/src/constants/` (shared). Always use the constants, never inline string literals.

### Adding a new microservice endpoint
1. Add pattern constant in the relevant `constants/` file.
2. Add `@MessagePattern(pattern)` handler in the microservice controller.
3. Call it from the gateway service using `ClientProxyService`.
4. DTOs go in `libs/<service>/src/dto/` if shared, or `apps/<service>/src/dto/` if internal.

### Auth & Guards
- Global `AuthGuard` validates JWT on every gateway route (`apps/wardrobe-api-gateway/src/auth/auth.guard.ts`).
- Use `@Public()` decorator to opt out of auth for a route.
- JWT config lives in `libs/common/src/jwt/`.

### Entities & Migrations
- Entities in `libs/common/src/database/entities/`. TypeORM `POSTGRES_SYNCHRONIZE=false` — always use migrations.
- Never modify an entity without creating a migration (`npm run typeorm:generate-migration --name=<Name>`).
- Cascade delete is configured on user → wardrobeItems and user → assistantSessions.

### Error handling
- Microservices throw `RpcException` (not `HttpException`). The gateway's `MicroserviceExceptionFilter` (`libs/common/src/exception-filter/`) maps RPC errors back to HTTP responses.

### File uploads
- Images are base64-encoded when sent over RabbitMQ between gateway and wardrobe service.
- The `ImageUploadValidationPipe` runs at the gateway before the message is dispatched.

### Async jobs (ai-assistant only)
- Long-running AI tasks use a webhook delivery pattern with retries — see `apps/ai-assistant/src/jobs/`.
- User webhook keys are stored encrypted; uses `ProtectedDataUtil` from `libs/common/src/security/`.

## Naming Conventions

- Files: `kebab-case` with type suffix — e.g. `wardrobe-item.entity.ts`, `create-wardrobe-item-request.dto.ts`.
- Classes: PascalCase with type suffix — `WardrobeItemEntity`, `CreateWardrobeItemRequestDto`, `WardrobeService`.
- Enums: PascalCase values — `ItemType.Hoodie`, `Season.Spring`.
- No `I` prefix on interfaces.

## Code Style

- Single quotes, trailing commas (enforced by Prettier — see `.prettierrc`).
- ESLint extends `@typescript-eslint/recommended` with explicit return types and `no-explicit-any` turned off.
- `@typescript-eslint/explicit-function-return-type` is off — do not add return types unless they add clarity.

## Environment Variables

Each app has its own `.env.example`. Copy and fill before running locally. Key variables:
- `RABBIT_MQ_URI` — required by every service
- `POSTGRES_*` — database (used by `libs/common/src/database/`)
- `JWT_SECRET_KEY` — used by `libs/common/src/jwt/`
- `PROTECTED_DATA_SECRET` — min 16 chars, used by `ai-assistant` to encrypt webhook keys
- `GEMINI_API_KEY` / `GEMINI_MODEL` — AI service only

## Testing

- Test runner: Jest with ts-jest. Specs go in `apps/<service>/src/` alongside source files (`*.spec.ts`).
- No tests exist yet — test infrastructure is configured but the suite is empty.
- Run a single test file: `npx jest path/to/file.spec.ts`.

## Gotchas

- **No `POSTGRES_SYNCHRONIZE`**: it is set to `false` — never enable it in any environment; always migrate.
- **Webpack enabled** in `nest-cli.json` — the build output path is `dist/apps/<app-name>/main.js`.
- **Root project** in `nest-cli.json` is `wardrobe-api-gateway`, so `npm run start` starts only that service.
- **RMQ manual ack**: microservices acknowledge messages manually — do not return early from a controller handler without handling the result.
- _(Uncertain)_ Whether `ai-assistant` also acts as an RMQ client to `wardrobe` and `media-storage` directly, or only via the gateway — verify in `apps/ai-assistant/src/ai-assistant.module.ts`.
