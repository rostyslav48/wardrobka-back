# Project Structure - Wardrobe Assistant (Backend)

## 🏗️ Architecture & Tech Stack
**Architecture Pattern:** Microservices Architecture (Monorepo), Clean Architecture principles, API Gateway Pattern.
**Frameworks & Libraries:** 
- **NestJS:** Core framework for building scalable Node.js server-side applications.
- **TypeScript:** Main programming language.
- **TypeORM & PostgreSQL:** Relational database management and ORM.
- **RabbitMQ:** Message broker for asynchronous inter-service communication.
- **JWT & Passport:** Authentication and authorization strategy.
- **Google Generative AI:** Gemini integration for the AI assistant module.
- **AWS S3:** Cloud storage strategy for media files.

## 🚀 Entry Points
- **API Gateway (`apps/wardrobe-api-gateway/src/main.ts`):** The primary entry point where all client HTTP requests arrive. It routes external traffic to the appropriate internal microservices via RabbitMQ.
- **Core Business Logic:** Distributed across the `apps/` directory, specifically inside `wardrobe/`, `ai-assistant/`, `auth/`, and `media-storage/`.
- **Microservice Entry Points:** Found in `apps/*/src/main.ts` which initialize their respective RabbitMQ listener contexts.

## 📂 Directory Tree & Module Purposes

```text
wardrobe-assistant-back/
├── apps/                          # Contains all deployed microservices and the API gateway
│   ├── ai-assistant/              # Microservice responsible for handling generative AI (Gemini) interactions
│   │   ├── src/main.ts            # Entry point initializing the AI microservice
│   │   ├── src/controllers/       # Listens for internal RMQ messages related to AI functionality
│   │   ├── src/jobs/              # Contains scheduled jobs like dispatching delayed webhooks
│   │   ├── src/services/          # Business logic: Context building, Gemini API client, conversation managers
│   │   └── src/webhook/           # Handles external webhooks for asynchronous AI completion responses
│   ├── auth/                      # Microservice managing user identity, sessions, and security
│   │   ├── src/auth/              # Authentication logic, password hashing, and token generation
│   │   ├── src/users/             # Handles CRUD operations and database interactions for user records
│   │   └── src/dto/               # Data Transfer Objects validating incoming auth requests
│   ├── media-storage/             # Microservice handling file uploads, serving, and cloud interactions (AWS S3)
│   │   └── src/utils/             # Helpers for pre-signing URLs and formatting S3 responses
│   ├── wardrobe/                  # Core microservice managing the primary business domain: clothing items & outfits
│   │   └── src/wardrobe/          # Repositories and logic for organizing apparel data
│   └── wardrobe-api-gateway/      # The public-facing HTTP server routing traffic to microservices
│       ├── src/ai-assistant/      # Exposes HTTP endpoints for AI features and forwards to RMQ
│       ├── src/auth/              # Exposes HTTP endpoints for login/registration and forwards to RMQ
│       ├── src/interceptors/      # Request/response formatters and global error catchers mapping
│       └── src/wardrobe/          # Exposes HTTP endpoints for wardrobe operations
├── libs/                          # Shared internal libraries used across multiple microservices
│   ├── ai-assistant/              # Shared types, constants, and global DTOs specific to the AI module
│   └── common/                    # Core infrastructural shared logic
│       ├── src/database/          # TypeORM config, base entities, and migration setup
│       ├── src/jwt/               # Shared JWT verification logic for microservices to decode tokens
│       ├── src/rmq/               # RabbitMQ setup logic to abstract message passing boilerplate
│       └── src/exception-filter/  # Global exception handling for internal RPC errors
├── package.json                   # Defines all Node dependencies, monorepo scripts, and typeorm commands
├── nest-cli.json                  # NestJS monorepo configuration listing applications and source roots
└── docker-compose.yml             # Container orchestration (likely starts RabbitMQ, PostgreSQL, etc.)
```

## 🗄️ Database Schema Outline (TypeORM)
The domain is centralized around users containing clothing items, and AI assistant interactions regarding these clothes. All entities are stored in `libs/common/src/database/entities/`.
- **`user_account`:** Core user model. Contains `email`, `password`, `name`, and related elements. Has one-to-many relationships to `wardrobe_item` and `assistant_session`.
- **`wardrobe_item`:** User's clothes. Includes traits like `type`, `color`, `season`, `status`, `favourite`, `fit_type`, `material`, `style`, `brand`, and an `img_path`.
- **`assistant_session`:** Chat sessions between the user and AI for continued context.
- **`assistant_message`:** Individual chat elements within a session. Has `role` (`user`, `assistant`, `system`), `content`, and potential `attachments`.
- **`assistant_outfit_suggestion` / `assistant_webhook_job`:** Models for AI generated outfit combinations and tracking asynchronous processing tasks.

## 📡 Microservice Communication Map (RabbitMQ)
Microservices communicate strictly asynchronously via @MessagePattern using Request-Response patterns on specific queues.
- `apps/wardrobe-api-gateway/` functions purely as the HTTP bridge, emitting RMQ messages to backend services.
- **Auth Service:** Listens to `AUTH_REQUESTS.login`, `AUTH_REQUESTS.signup`.
- **Wardrobe Service:** Listens to `WARDROBE_REQUESTS.findOne`, `create`, `update`, `delete`, `findMany` etc.
- **AI Assistant Service:** Listens to `AI_ASSISTANT_REQUESTS.enqueueChat`, `enqueueOutfitSuggestion`, `getSessions`. Uses Webhooks / background jobs.
- **Media Storage Service:** Handles `MEDIA_STORAGE_REQUESTS.store`, `getUrls`, `delete` for managing S3 uploads.

## 💅 Code Style & Conventions
**Formatting and Linting**
The repository uses **ESLint** and **Prettier** to enforce formatting rules across the codebase:
- Use **single quotes** (`'...'`) for strings, unless double quotes are necessary inside strings.
- Leave **trailing commas** everywhere (`trailingComma: "all"` in Prettier).
- Explicit `any`, missing interface name prefixes, and missing function return types form part of the relaxed TypeScript strictness in linting (in `.eslintrc.js`), but it's recommended to type strongly where practical.
- Run `npm run format` and `npm run lint` before committing to ensure adherence.

**File Naming Conventions**
- Use **kebab-case** for file and directory names (e.g., `ai-assistant`, `user-account.entity.ts`).
- Include the **file type** as a dot-separated suffix before the `.ts` extension (e.g., `.module.ts`, `.controller.ts`, `.service.ts`, `.entity.ts`, `.dto.ts`, `.job.ts`).

**NestJS Specific Guidelines**
- **Dependency Injection**: Leverage standard DI via class constructors with `@Injectable()`.
- **Validation**: Request bodies (DTOs) should use `class-validator` and `class-transformer` decorators for strict incoming payload types.
- **Modularity**: Domain logic always relies on separate `Module`, `Controller` (or RPC handler), and `Service` files. Every application must bundle its imports correctly in its root module.
