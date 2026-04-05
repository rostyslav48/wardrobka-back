# Wardrobe Assistant Backend

A microservices-based backend for a wardrobe assistant application, providing intelligent wardrobe management, outfit suggestions, and conversational assistance. Built with NestJS, TypeORM, RabbitMQ, and integrating Google Generative AI (Gemini).

## 🏗️ Architecture
The system follows a Microservices Architecture using the API Gateway pattern:
- **API Gateway (`wardrobe-api-gateway`)**: Public-facing HTTP server that routes external traffic to backend services over RabbitMQ (port 3000).
- **Auth Service (`auth`)**: Manages user identity, registration, and sessions (JWT).
- **Wardrobe Service (`wardrobe`)**: Core domain handling clothing categories, attributes, and user relationships.
- **Media Storage Service (`media-storage`)**: Manages and processes asset uploads (images) using AWS S3.
- **AI Assistant Service (`ai-assistant`)**: Integrates Gemini Vision/Flash models, constructs context for outfits, and relies on a webhook polling/dispatching queue system for long-running generation tasks.

## Project setup

## 🗄️ Database & Migrations
The project uses TypeORM & PostgreSQL. The primary entities are defined in `libs/common/src/database/entities/`. 

To manage schemas, use standard TypeORM CLI commands configured in `package.json`:
```bash
npm run typeorm:generate-migration --name=MigrationName
npm run typeorm:migrate
```

## 🧪 Testing

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e
```

