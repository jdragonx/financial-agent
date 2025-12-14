# Investor Agent

A full-stack application featuring a LangGraph-powered investor agent with a React frontend. The agent can perform web research, execute Python calculations, and provide investment advice through a conversational interface.

## Architecture

- **Backend**: NestJS REST API with LangGraph agent
- **Frontend**: React + TypeScript chat interface with WebSocket support
- **Agent**: LangGraph-powered investor agent with research and calculation capabilities
- **Real-time Updates**: Redis pub/sub with WebSocket for live status updates
- **Infrastructure**: Docker Compose for Redis service

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker and Docker Compose (for Redis)

### Running the Application

1. **Start Redis**

   ```bash
   docker-compose up -d
   ```

   This starts a Redis instance on `localhost:6379` for pub/sub communication.

2. **Start the Backend**

   ```bash
   cd backend
   pnpm install
   pnpm start:dev
   ```

   The backend will run on `http://localhost:3000`

3. **Start the Frontend**

   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

   The frontend will run on `http://localhost:5173`

4. **Open the Application**

   Navigate to `http://localhost:5173` in your browser and start chatting with the investor agent!

## Project Structure

```
alinea/
├── backend/                 # NestJS REST API backend
│   ├── agent/              # LangGraph agent implementation
│   ├── src/                # NestJS API source code
│   └── README.md           # Backend documentation
├── frontend/               # React frontend application
│   ├── src/                # React source code
│   └── README.md           # Frontend documentation
└── rules/                  # Project rules and guidelines
```

## Features

### Backend

- REST API with OpenAPI/Swagger documentation
- LangGraph-powered investor agent
- Web research capabilities
- Python calculation execution
- Conversation thread management
- Health check endpoints
- Type-safe request/response handling
- **Real-time status updates via WebSocket**
- **Redis pub/sub for async status broadcasting**

### Frontend

- Simple, clean chat interface
- Real-time conversation with live status updates
- **WebSocket connection for status updates**
- **Visual feedback during agent processing (thinking, researching, calculating)**
- Markdown rendering for responses
- Conversation thread management
- Auto-focus on input
- Responsive design

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:3000/swagger
- **Health Check**: http://localhost:3000/health

## Configuration

### Backend

Set environment variables in the backend directory:

- `API_APP_PORT` - Port for the API server (default: 3000)
- `REDIS_HOST` - Redis host (default: `localhost`)
- `REDIS_PORT` - Redis port (default: `6379`)

### Frontend

Create a `.env` file in the frontend directory (optional):

```env
VITE_API_URL=http://localhost:3000
```

- `VITE_API_URL` - Backend API URL (default: `http://localhost:3000`)

### Redis

Redis is configured via Docker Compose. The default configuration:
- Host: `localhost`
- Port: `6379`
- Persistence: Enabled with AOF (Append Only File)

## Development

### Backend Development

See [backend/README.md](./backend/README.md) for detailed backend documentation.

### Frontend Development

See [frontend/README.md](./frontend/README.md) for detailed frontend documentation.

## Agent Capabilities

The investor agent can:

- **Research**: Perform web research on investment topics, stocks, and market data
- **Calculate**: Execute Python calculations for financial analysis (P/E ratios, valuations, etc.)
- **Advise**: Provide investment advice and insights
- **Clarify**: Ask clarifying questions when needed
- **Remember**: Maintain conversation context within threads

## Real-time Status Updates

The application uses an async architecture with WebSocket and Redis pub/sub to provide real-time status updates:

1. **User sends a message** → HTTP POST to `/investor-agent/chat`
2. **Backend starts processing** → Publishes status updates to Redis
3. **Frontend subscribes** → WebSocket connection receives status updates
4. **User sees live updates** → Status messages like "Thinking...", "Researching...", "Calculating..."
5. **Final response** → Complete message delivered when ready

This architecture:
- ✅ Prevents HTTP timeout issues on cloud platforms
- ✅ Provides real-time feedback to users
- ✅ Handles long-running agent operations gracefully
- ✅ Scales with Redis pub/sub for multiple clients

## Example Queries

- "What is the current price of AAPL?"
- "Calculate the P/E ratio for a stock with price $150 and earnings $6.11"
- "Compare AAPL and MSFT market caps"
- "What are the latest analyst ratings for Tesla?"

## License

This project is for interview practice purposes.
