# Investor Agent Backend

NestJS REST API backend with LangGraph Investor Agent service.

## Features

- REST API with OpenAPI/Swagger documentation
- Automatic DTO generation using Zod and `nestjs-zod`
- Health check endpoints
- Type-safe request/response handling
- LangGraph-powered investor agent with research and calculation capabilities
- **Real-time status updates via WebSocket**
- **Redis pub/sub for async status broadcasting**
- **Async request handling to prevent HTTP timeouts**

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Redis (via Docker Compose - see root README)

### Installation

```bash
pnpm install
```

### Running the Backend

Development mode:
```bash
pnpm start:dev
```

Production mode:
```bash
pnpm build
pnpm start:prod
```

### LangGraph Studio

To run the LangGraph Studio for agent development:
```bash
pnpm studio
```

### BAML Code Generation

To generate BAML client code:
```bash
pnpm baml:generate
```

### API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:3000/swagger
- Swagger JSON: http://localhost:3000/swagger-json (for client code generation)
- Health Check: http://localhost:3000/health

### Environment Variables

- `API_APP_PORT` - Port for the API server (default: 3000)
- `REDIS_HOST` - Redis host (default: `localhost`)
- `REDIS_PORT` - Redis port (default: `6379`)

## API Endpoints

### POST /investor-agent/chat

Send a message to the investor agent and get a response.

**Request Body:**
```json
{
  "message": "What is the current price of AAPL?",
  "threadId": "optional-thread-id",
  "messages": [
    {
      "role": "user",
      "message": "Previous message"
    }
  ]
}
```

**Response:**
```json
{
  "threadId": "thread-uuid",
  "messages": [
    {
      "role": "user",
      "message": "What is the current price of AAPL?"
    },
    {
      "role": "assistant",
      "message": "The current price of AAPL is..."
    }
  ],
  "turnCount": 1,
  "currentAction": "responding",
  "researchResults": "...",
  "calculationResults": "..."
}
```

## Project Structure

```
backend/
├── agent/                    # LangGraph agent implementation
│   ├── baml_src/            # BAML source files
│   ├── src/                 # Agent source code
│   │   ├── investor_agent.ts
│   │   ├── subagents.ts
│   │   ├── tools.ts
│   │   └── status-publisher.ts  # Status update publisher
│   └── langgraph.json       # LangGraph configuration
├── src/                     # NestJS API source code
│   ├── api/                 # API controllers and DTOs
│   │   ├── dto/            # Data Transfer Objects (Zod schemas)
│   │   └── *.controller.ts # REST controllers
│   ├── investor-agent/     # Investor agent service layer
│   │   ├── *.interface.ts  # Service interfaces
│   │   ├── *.service.ts    # Service implementation
│   │   └── *.module.ts     # NestJS module
│   ├── redis/              # Redis service for pub/sub
│   │   ├── redis.service.ts
│   │   └── redis.module.ts
│   ├── websocket/          # WebSocket gateway
│   │   ├── websocket.gateway.ts
│   │   └── websocket.module.ts
│   ├── health/             # Health check module
│   ├── config/             # Configuration
│   ├── api-app.module.ts   # Root application module
│   └── main.ts             # Application bootstrap
└── lib/                    # Shared utilities
    └── swagger.ts          # Swagger helper functions
```

## Real-time Status Updates

The backend uses Redis pub/sub and WebSocket to provide real-time status updates:

1. **Agent Processing**: As the agent processes requests, it publishes status updates to Redis channels
2. **WebSocket Gateway**: The WebSocket gateway subscribes to Redis channels and forwards updates to connected clients
3. **Status Types**: Updates include statuses like "thinking", "researching", "calculating", "responding", "asking", "complete", or "error"
4. **Thread-based**: Each conversation thread has its own Redis channel for status updates

### WebSocket Endpoint

- **Namespace**: `/agent-status`
- **Events**:
  - `subscribe` - Subscribe to status updates for a threadId
  - `unsubscribe` - Unsubscribe from status updates
  - `status-update` - Receive status updates (emitted by server)

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:cov
```

### Generating Swagger Documentation

The `swagger.json` file is automatically generated when the service starts. It will be created in the root directory of the backend project.

## Client Code Generation

The Swagger/OpenAPI specification can be used to generate client code for various languages using tools like:

- [openapi-generator](https://openapi-generator.tech/)
- [swagger-codegen](https://swagger.io/tools/swagger-codegen/)
- [openapi-ts](https://github.com/drwpow/openapi-typescript)

Example with openapi-generator (using the running server):
```bash
openapi-generator-cli generate \
  -i http://localhost:3000/swagger-json \
  -g typescript-axios \
  -o ./generated-client
```

Or using the generated swagger.json file (created automatically when the service starts):
```bash
openapi-generator-cli generate \
  -i ./swagger.json \
  -g typescript-axios \
  -o ./generated-client
```
