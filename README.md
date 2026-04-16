# kernel-script

[npm-version]: https://npmjs.org/package/kernel-script
[npm-downloads]: https://npmjs.org/package/kernel-script
[license]: https://mit-license.org
[license-url]: LICENSE

[![npm version](https://img.shields.io/npm/v/kernel-script.svg?style=flat-square)](https://npmjs.org/package/kernel-script)
[![npm downloads](https://img.shields.io/npm/dm/kernel-script.svg?style=flat-square)](https://npmjs.org/package/kernel-script)
[![license](https://img.shields.io/npm/l/kernel-script.svg?style=flat-square)](LICENSE)

Task queue manager for Chrome extensions with background processing, persistence, and React hooks.

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Setup](#basic-setup)
  - [React Hook](#react-hook)
  - [Advanced](#advanced)
- [API Reference](#api-reference)
  - [Core](#core)
  - [Hooks](#hooks)
  - [Store](#store)
  - [Queue Operations](#queue-operations)
- [Types](#types)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

```bash
npm install kernel-script
# or
bun add kernel-script
```

```typescript
import {
  setupKernelScript,
  registerEngines,
  useWorker,
  createTaskStore,
} from 'kernel-script';

// 1. Define your engine
const myEngine = {
  keycard: 'my-platform',
  execute: async (ctx) => {
    // Your automation logic here
    return { success: true, output: 'Done' };
  },
};

// 2. Initialize in background script
setupKernelScript({ 'my-platform': myEngine });

// 3. Create store and use hook in React
const taskStore = createTaskStore({ name: 'my-tasks' });
const TaskQueue = () => {
  const { start, pause, addTask } = useWorker({
    keycard: 'my-platform',
    getIdentifier: () => 'default',
    funcs: taskStore,
  });
  // ...
};
```

## Examples

Check the [`example/`](example/) folder for a complete project using kernel-script.

```bash
cd example
bun install
bun dev
```

| File                                                                           | Description                      |
| ------------------------------------------------------------------------------ | -------------------------------- |
| [`example/src/background.ts`](example/src/background.ts)                       | Engine setup                     |
| [`example/src/hooks/use-task-worker.ts`](example/src/hooks/use-task-worker.ts) | Queue hook usage                 |
| [`example/src/stores/task.store.ts`](example/src/stores/task.store.ts)         | Store with IndexedDB persistence |

## Features

- **Task Queue Management** - Queue, schedule, and execute tasks with configurable concurrency
- **Background Processing** - Run tasks in Chrome background service workers
- **Persistence** - Queue state persists across extension restarts
- **React Hooks** - Built-in `useWorker` hook for React integration
- **Engine System** - Pluggable engine architecture for different task types
- **TypeScript Support** - Full TypeScript support with type definitions

## Architecture

### Data Flow

```mermaid
graph LR
    A[User] --> B[React Store]
    B --> C[sendMessage]
    C --> D[QueueManager]
    D --> E[EngineHub]
    D --> F[PersistenceManager]
    E --> G[Engines]
    F --> H[IndexedDB]
```

### Components

| Layer | Component           | Description                          |
| ----- | ------------------- | ------------------------------------ |
| UI    | TaskStore (Zustand) | Local state management               |
| UI    | useWorker Hook       | React hook interface                 |
| BG    | QueueManager        | Task scheduling, concurrency control |
| BG    | EngineHub           | Engine router/registry               |
| BG    | PersistenceManager  | IndexedDB persistence                |
| BG    | Engines             | Task executors                       |

### Task Flows

#### Task Execution Flow

```mermaid
graph LR
    A[User creates task] --> B[Store.update]
    B --> C[sendMessage ADD]
    C --> D[QueueManager.add]
    D --> E[EngineHub.get]
    E --> F[Engine.execute]
    F --> G[Result]
    G --> H[QUEUE_EVENT]
    H --> I[Store.setTasks]
```

### Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Waiting: add()
    Waiting --> Running: start()
    Running --> Completed: success
    Running --> Error: failed
    Error --> Waiting: retryTasks
    Completed --> [*]
    Error --> [*]
```

### Persistence & Hydration

| Event           | Action                                                |
| --------------- | ----------------------------------------------------- |
| Browser restart | Service Worker restarts                               |
| Hydrate         | Load queue state from IndexedDB                       |
| RehydrateTasks  | Scan tasks, reset Running to Waiting, re-add to queue |

### Message Flow

```mermaid
sequenceDiagram
    participant UI as UI (React)
    participant BG as Background SW

    UI->>BG: QUEUE_COMMAND: ADD
    BG->>BG: queueManager.add()
    BG->>BG: processTask()
    BG->>BG: engine.execute()
    BG-->>UI: QUEUE_EVENT: TASKS_UPDATED
    UI->>UI: setTasks(tasks)
```

### Main Operations

| Operation         | Description                   |
| ----------------- | ----------------------------- |
| `add(task)`       | Add 1 task to queue           |
| `addMany(tasks)`  | Add multiple tasks            |
| `start()`         | Start processing queue        |
| `pause()`         | Pause (don't cancel tasks)    |
| `resume()`        | Resume processing             |
| `stop()`          | Stop + halt all running tasks |
| `haltTask(id)`    | Halt 1 task to Waiting        |
| `cancelTask(id)`  | Cancel completely from list   |
| `retryTasks(ids)` | Retry failed tasks            |

## Installation

```bash
npm install kernel-script
# or
bun add kernel-script
```

## Usage

### Basic Setup

```typescript
import { setupKernelScript, registerEngines } from 'kernel-script';
import type { BaseEngine, Task, EngineResult } from 'kernel-script';

// Define your custom engine
const myEngine: BaseEngine = {
  keycard: 'my-platform',

  async execute(ctx: Task): Promise<EngineResult> {
    try {
      const tab = await chrome.tabs.create({ url: ctx.payload.url });
      await this.runAutomation(tab.id, ctx);
      const output = await this.getResult(tab.id);
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  cancel(taskId: string): void {
    // Cancel logic here
  },
};

// Initialize in your background script
setupKernelScript({ 'my-platform': myEngine });

// Optionally register all built-in engines
registerEngines();
// See: example/src/background.ts
```

### React Hook

```typescript
import { useWorker, createTaskStore } from 'kernel-script';

// Create a task store
const taskStore = createTaskStore({ name: 'my-tasks' });

// Use in your component
function TaskQueue() {
  const { start, pause, resume, stop, addTask, deleteTasks, retryTasks } = useWorker({
    keycard: 'my-platform',
    getIdentifier: () => 'default',
    funcs: taskStore,
  });

  return (
    <div>
      <h2>Tasks: {taskStore.getTasks().length}</h2>
      <button onClick={start}>Start</button>
      <button onClick={pause}>Pause</button>
      <button onClick={resume}>Resume</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
// See: example/src/hooks/use-task-worker.ts
```

### Store with Persistence

```typescript
import { createTaskStore, createIndexedDBStorage } from 'kernel-script';

const store = createTaskStore({
  name: 'my-tasks',
  storage: createIndexedDBStorage('my-storage'),
  partialize: (state) => ({
    config: state.config,
  }),
  extend: (set, _get) => ({
    config: { theme: 'light' },
    updateConfig: (updates) => set((state) => ({
      config: { ...state.config, ...updates },
    })),
  })),
});
// See: example/src/stores/task.store.ts
```

### Advanced

```typescript
import { getQueueManager, TaskConfig } from 'kernel-script';

// Get queue manager instance
const queueManager = getQueueManager();

// Configure queue
const config: TaskConfig = {
  threads: 3,
  delayMin: 1000,
  delayMax: 5000,
  stopOnErrorCount: 5,
};

// Add tasks
await queueManager.add('my-platform', 'default', {
  id: 'task-001',
  no: 1,
  name: 'Generate cat image',
  status: 'Waiting',
  progress: 0,
  payload: { prompt: 'a cute cat' },
});

// Add multiple tasks
await queueManager.addMany('my-platform', 'default', [
  { id: 'task-002', no: 2, name: 'Task 2', status: 'Waiting', progress: 0, payload: {} },
  { id: 'task-003', no: 3, name: 'Task 3', status: 'Waiting', progress: 0, payload: {} },
]);

// Start processing
queueManager.start('my-platform', 'default');
```

## API Reference

### Core

| Export                           | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `QueueManager`                   | Main queue manager class                     |
| `getQueueManager()`              | Get queue manager singleton                  |
| `TaskContext`                    | Context for task execution with abort signal |
| `setupKernelScript(engines)` | Initialize background engine                 |
| `engineHub`                      | Engine registry                              |
| `persistenceManager`             | Persistence layer                            |
| `registerEngines()`           | Register all built-in engines                |
| `sleep(ms)`                      | Promise-based sleep function                 |

### Hooks

| Hook                | Description                     | Usage                                          |
| ------------------- | ------------------------------- | ---------------------------------------------- |
| `useWorker(config)` | React hook for queue operations | `useWorker({ keycard, getIdentifier, funcs })` |

### Store

| Function                   | Description                    |
| -------------------------- | ------------------------------ |
| `createTaskStore(options)` | Create Zustand store for tasks |

### Queue Operations

| Operation                                     | Description                   |
| --------------------------------------------- | ----------------------------- |
| `add(keycard, identifier, task)`           | Add 1 task to queue           |
| `addMany(keycard, identifier, tasks)`      | Add multiple tasks            |
| `start(keycard, identifier)`               | Start processing queue        |
| `pause(keycard, identifier)`               | Pause (don't cancel tasks)    |
| `resume(keycard, identifier)`              | Resume processing             |
| `stop(keycard, identifier)`                | Stop + halt all running tasks |
| `getStatus(keycard, identifier)`           | Get queue status              |
| `retryTasks(keycard, identifier, taskIds)` | Retry failed tasks            |

## Types

```typescript
// Task status
type TaskStatus = 'Draft' | 'Waiting' | 'Running' | 'Completed' | 'Error' | 'Previous' | 'Skipped';

// Task definition
interface Task {
  id: string;
  no: number;
  name: string;
  status: TaskStatus;
  progress: number;
  payload: Record<string, any>;
  output?: unknown;
  errorMessage?: string;
  isQueued?: boolean;
  createAt?: number;
  updateAt?: number;
}

// Queue configuration
interface TaskConfig {
  threads: number;
  delayMin: number;
  delayMax: number;
  stopOnErrorCount: number;
}

// Engine interface
interface BaseEngine {
  keycard: string;
  execute(ctx: Task): Promise<EngineResult>;
  cancel(taskId: string): void;
}

// Engine result
interface EngineResult {
  success: boolean;
  output?: unknown;
  error?: string;
}
```

## Troubleshooting

### Common Issues

**Q: Tasks not executing after adding**
A: Make sure to call `start(keycard, identifier)` after adding tasks.

**Q: Queue not persisting after extension restart**
A: Verify `persistenceManager` is initialized. Check IndexedDB permissions.

**Q: React hook not updating**
A: Ensure your store is passed correctly to `useWorker` funcs parameter.

**Q: Engine not found**
A: Register your engine with `setupKernelScript()` before using it.

**Q: "Cannot read property X of undefined"**
A: Ensure you're importing from `dist/` after building: `import { ... } from 'kernel-script'`

**Q: TypeScript errors on import**
A: Make sure to install peer dependencies: `npm install react react-dom`

**Q: Where do I start?**
A: Check the [`example/`](example/) folder for a complete implementation.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `bun run build`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.
