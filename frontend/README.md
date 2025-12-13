# Investor Agent Frontend

React-based chat interface for the Investor Agent backend service.

## Features

- Simple, clean chat interface
- Real-time conversation with the investor agent
- Markdown rendering for assistant responses
- Conversation thread management
- Auto-focus on input after responses
- Responsive design with modern UI

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Backend service running (see [backend README](../backend/README.md))

### Installation

```bash
pnpm install
```

### Running the Frontend

Development mode:
```bash
pnpm dev
```

The frontend will be available at `http://localhost:5173`

Production build:
```bash
pnpm build
pnpm preview
```

### Environment Variables

Create a `.env` file in the frontend directory (optional):

```env
VITE_API_URL=http://localhost:3000
```

- `VITE_API_URL` - Backend API URL (default: `http://localhost:3000`)

**Note:** In Vite, environment variables must be prefixed with `VITE_` to be exposed to the client code.

## Project Structure

```
frontend/
├── src/
│   ├── api.ts              # API client for backend communication
│   ├── App.tsx             # Root component
│   ├── Chat.tsx            # Main chat component
│   ├── Chat.css            # Chat component styles
│   ├── config/             # Configuration
│   │   └── api.config.ts   # API configuration (env-based)
│   ├── index.css           # Global styles
│   └── main.tsx             # Application entry point
├── index.html              # HTML template
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

## Development

### Building

```bash
pnpm build
```

The build output will be in the `dist/` directory.

### Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **react-markdown** - Markdown rendering for assistant messages
- **Zod** - Configuration validation

## Usage

1. Start the backend service (see [backend README](../backend/README.md))
2. Start the frontend: `pnpm dev`
3. Open `http://localhost:5173` in your browser
4. Start chatting with the investor agent!

The frontend automatically manages conversation threads and maintains context throughout the conversation.
