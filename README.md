# kernel-script

Task queue manager for Chrome extensions with background processing, persistence, and React hooks.

## Features

- **Task Queue Management** - Queue, schedule, and execute tasks with configurable concurrency
- **Background Processing** - Run tasks in Chrome background service workers
- **Persistence** - Queue state persists across extension restarts
- **React Hooks** - Built-in `useQueue` hook for React integration
- **Engine System** - Pluggable engine architecture for different task types
- **TypeScript Support** - Full TypeScript support with type definitions

## Installation

```bash
npm install kernel-script
# or
bun add kernel-script
```

## Usage

### Basic Setup

```typescript
import { setupBackgroundEngine, registerAllEngines } from 'kernel-script';
import type { BaseEngine } from 'kernel-script';

// Define your engine
const myEngine: BaseEngine = {
  keycard: 'my-platform',
  async execute(ctx) {
    // Your task execution logic
    return { success: true, output: 'Done' };
  },
};

// Initialize in background script
setupBackgroundEngine({ 'my-platform': myEngine });
```

### Using React Hook

```typescript
import { useQueue, createTaskStore } from 'kernel-script';

// Create store
const store = createTaskStore({ name: 'my-tasks' });

// Use in component
const MyComponent = () => {
  const queue = useQueue({
    keycard: 'my-platform',
    getIdentifier: () => store.getIdentifier?.(),
    funcs: {
      getTasks: store.getTasks,
      setTasks: store.setTasks,
      // ...other funcs
    }
  })();

  const handleStart = () => queue.start();

  return <button onClick={handleStart}>Start Queue</button>;
};
```

## API

### Core

| Export                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `QueueManager`            | Main queue manager class                     |
| `getQueueManager()`       | Get queue manager singleton                  |
| `TaskContext`             | Context for task execution with abort signal |
| `setupBackgroundEngine()` | Initialize background engine                 |
| `engineHub`               | Engine registry                              |
| `persistenceManager`      | Persistence layer                            |

### Hooks

| Hook       | Description                     |
| ---------- | ------------------------------- |
| `useQueue` | React hook for queue operations |

### Store

| Function          | Description                    |
| ----------------- | ------------------------------ |
| `createTaskStore` | Create Zustand store for tasks |

### Types

| Type           | Description             |
| -------------- | ----------------------- |
| `Task`         | Task definition         |
| `TaskConfig`   | Queue configuration     |
| `QueueStatus`  | Queue status            |
| `BaseEngine`   | Engine interface        |
| `EngineResult` | Engine execution result |

## Scripts

| Script            | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Run dev mode                   |
| `npm run build`   | Build to `dist/` folder        |
| `npm run lint`    | ESLint code check              |
| `npm run format`  | Prettier code format           |
| `npm run release` | Build + bump version + git tag |

## Project Structure

```
src/
├── core/              # Core library code
│   ├── queue-manager.ts
│   ├── task-context.ts
│   ├── persistence-manager.ts
│   ├── engine-hub.ts
│   ├── bootstrap.ts
│   ├── hooks/         # React hooks
│   └── store/         # Zustand stores
└── index.ts           # Main exports
dist/                  # Build output
```

## License

MIT
