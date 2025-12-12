# Simple LangGraph Agent with Conversation Support

A minimal LangGraph agent in TypeScript with real-time conversation capabilities and LangGraph Studio integration.

## What is LangGraph?

LangGraph is a framework for building **stateful, multi-actor applications** with LLMs. Think of it as a way to create workflows where:

- **State** flows through the graph (like data in a pipeline)
- **Nodes** are processing units that transform the state
- **Edges** define the flow between nodes (the execution path)
- **Checkpointing** allows conversations to persist across multiple interactions

## Features

- ✅ Real-time conversation support with checkpointing
- ✅ LangGraph Studio integration for visualization and debugging
- ✅ Simple placeholder agent (ready for LLM integration)
- ✅ Conversation memory across multiple turns

## Key Concepts

### 1. **State**
The state contains the conversation history and metadata:

```typescript
const State = z.object({
  messages: z.array(z.string()),
  turnCount: z.number().default(0),
});
```

### 2. **Nodes**
Nodes process the state and return updates:

```typescript
const respondNode = (state: StateType) => {
  const response = "I'm not smart enough yet, try again later.";
  return {
    messages: [...state.messages, response],
    turnCount: state.turnCount + 1,
  };
};
```

### 3. **Checkpointing**
Checkpointing enables conversation persistence:

```typescript
const checkpointer = new MemorySaver();
const graph = new StateGraph({ state: State })
  .addNode("respond", respondNode)
  .compile({ checkpointer });
```

## How to Run

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start LangGraph Studio

This will start the development server and open LangGraph Studio in your browser:

```bash
pnpm studio
```

Or use the CLI directly:

```bash
langgraph dev
```

LangGraph Studio provides:
- **Visual Graph Editor**: See your graph structure
- **Real-Time Chat**: Interact with your agent
- **State Inspection**: Debug state at each step
- **Conversation History**: View all previous interactions

### 3. Interact with Your Agent

Once LangGraph Studio is running:
1. The UI will open automatically in your browser
2. You can send messages to your agent
3. The agent will respond with: "I'm not smart enough yet, try again later."
4. Conversations persist across multiple messages (thanks to checkpointing!)

## Project Structure

```
.
├── src/
│   └── index.ts          # Main graph definition
├── langgraph.json        # LangGraph Studio configuration
├── package.json
└── README.md
```

## Current Agent Behavior

The agent currently:
- Accepts user messages
- Responds with a placeholder: "I'm not smart enough yet, try again later."
- Maintains conversation history across turns
- Tracks the number of conversation turns

## Next Steps

1. **Add LLM Integration**: Replace the placeholder response with actual LLM calls
2. **Add Tools**: Give your agent capabilities (web search, calculations, etc.)
3. **Conditional Routing**: Add branching logic based on user input
4. **Multi-Agent Systems**: Create multiple agents that work together

## Learn More

- [LangGraph Documentation](https://docs.langchain.com/oss/javascript/langgraph)
- [LangGraph Studio Guide](https://docs.langchain.com/oss/javascript/langgraph/studio)
- [LangGraph 101 TypeScript](https://github.com/langchain-ai/langgraph-101-ts)
