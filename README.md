# kernel-script

Task queue manager for Chrome extensions with background processing, persistence, and React hooks.

## Features

- **Task Queue Management** - Queue, schedule, and execute tasks with configurable concurrency
- **Background Processing** - Run tasks in Chrome background service workers
- **Persistence** - Queue state persists across extension restarts
- **React Hooks** - Built-in `useQueue` hook for React integration
- **Engine System** - Pluggable engine architecture for different task types
- **TypeScript Support** - Full TypeScript support with type definitions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI (React)                               │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │  TaskStore       │    │  use-*-queue.ts                 │   │
│  │  (Zustand)       │◄───│  (queue-hook.ts)                │   │
│  └──────────────────┘    └──────────────┬──────────────────┘   │
└──────────────────────────────────────────┼──────────────────────┘
                                            │ chrome.runtime.sendMessage
                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Background (Service Worker)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              QueueManager (p-queue)                     │   │
│  │  - Scheduling                                            │   │
│  │  - Concurrency                                          │   │
│  │  - Lifecycle management                                 │   │
│  └──────────────┬───────────────────────────┬───────────────┘   │
│                 │                           │                   │
│                 ▼                           ▼                   │
│  ┌─────────────────────┐        ┌────────────────────────┐     │
│  │   EngineHub         │        │  PersistenceManager    │     │
│  │   (Router)          │        │  (IndexedDB)           │     │
│  └──────────┬──────────┘        └────────────────────────┘     │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Engines                               │   │
│  │  fxImageGenEngine │ bingEngine │ metaAiEngine...        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Task Processing Flow

### 1. Create Task

```typescript
const task = {
  id: 'task-001',
  type: 'image',
  name: 'Generate cat image',
  status: 'Waiting',
  progress: 0,
  payload: { prompt: 'a cat' },
};

await addTask(task);
```

Flow:

1. UI calls `addTask(task)` → `funcs.updateTask()` updates local store
2. Send `QUEUE_COMMAND` message with command `ADD` to Background

### 2. Receive Command

```typescript
switch (command) {
  case 'ADD':
    await queueManager.add(platformId, identifier, task);
    break;
  case 'ADD_MANY':
    await queueManager.addMany(platformId, identifier, tasks);
    break;
  case 'START':
    queueManager.start(platformId, identifier);
    break;
}
```

### 3. QueueManager Processing

```typescript
async add(platformId, identifier, task) {
  const entry = getOrCreateQueue(platformId, identifier);
  tasks.push(task);

  if (task.status === "Waiting" && !queuedIds.has(task.id)) {
    task.isQueued = true;
    queuedIds.add(task.id);
    queue.add(() => processTask(platformId, identifier, task));
  }

  updateTasks(platformId, identifier, tasks);
  notifyStatusChange(platformId, identifier);
}
```

### 4. Task Processing

```typescript
private async processTask(platformId, identifier, task) {
  const engine = engineHub.get(platformId);

  const taskIndex = entry.tasks.findIndex(t => t.id === task.id);
  entry.tasks[taskIndex].status = "Running";
  updateTasks(platformId, identifier, entry.tasks);

  try {
    const result = await engine.execute(task);
    if (result.success) {
      entry.tasks[idx].status = "Completed";
      entry.tasks[idx].output = result.output;
    } else {
      entry.tasks[idx].status = "Error";
      entry.tasks[idx].errorMessage = result.error;
    }
  } catch (error) {
    entry.tasks[idx].status = "Error";
    entry.tasks[idx].errorMessage = error.message;
  }

  entry.queuedIds.delete(task.id);

  if (queue.size === 0 && queue.pending === 0) {
    opts.forEach(opt => opt.onQueueEmpty(...));
  }
}
```

### 5. Engine Execution

```typescript
interface BaseEngine {
  execute(task: Task): Promise<EngineResult>;
  cancel(taskId: string): void;
}

async execute(task: Task): Promise<EngineResult> {
  try {
    const tab = await chrome.tabs.create({ url: task.payload.url });
    await this.runAutomation(tab.id, task);
    const output = await this.getResult(tab.id);
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### 6. Sync Back to UI

```typescript
const handleMessage = (message) => {
  if (message.type === 'QUEUE_EVENT') {
    switch (event) {
      case 'TASKS_UPDATED':
        funcs.setTasks(data.tasks);
        funcs.setPendingCount(data.status.size + data.status.pending);
        break;
    }
  }
};
```

## Task Lifecycle

```
┌─────────┐     add()     ┌─────────┐    start()    ┌─────────┐
│  Draft  │ ───────────►  │ Waiting │ ──────────►  │ Running │
└─────────┘               └─────────┘               └────┬────┘
                                                          │
                         ┌────────────────────────────────┤
                         ▼                                ▼
                  ┌──────────────┐               ┌──────────────┐
                  │ Completed   │               │    Error     │
                  └──────────────┘               └──────────────┘
                                                ▲
                                                │
                                          retryTasks()
                                                │
                                                └──────────► Waiting
```

## Persistence & Hydration

| Event               | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| **Browser restart** | Service Worker restarts                                  |
| **Hydrate**         | Load queue state from IndexedDB                          |
| **RehydrateTasks**  | Scan tasks, reset "Running" → "Waiting", re-add to queue |

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

### Queue Operations

| Operation         | Description                   |
| ----------------- | ----------------------------- |
| `add(task)`       | Add 1 task to queue           |
| `addMany(tasks)`  | Add multiple tasks            |
| `start()`         | Start processing queue        |
| `pause()`         | Pause (don't cancel tasks)    |
| `resume()`        | Resume processing             |
| `stop()`          | Stop + halt all running tasks |
| `haltTask(id)`    | Halt 1 task → Waiting         |
| `cancelTask(id)`  | Cancel completely from list   |
| `retryTasks(ids)` | Retry failed tasks            |

## Message Flow

```
UI (React)                    Background (SW)
     │                               │
     │  QUEUE_COMMAND: ADD           │
     ├──────────────────────────────►│
     │                               │ queueManager.add()
     │                               │   │
     │                               │   ▼
     │                               │ processTask()
     │                               │   │
     │  QUEUE_EVENT: TASKS_UPDATED   │   │ (after execute)
     │◄──────────────────────────────┤   │
     │                               │   ▼
     │                               │ engine.execute()
     │                               │   │
     │                               ▼   │
     │ setTasks(tasks)              │ EngineResult
     │ (Zustand update)             │   │
```

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
