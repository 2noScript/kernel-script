# Task Processing Flow

## 1. Architecture Overview

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

---

## 2. Step-by-Step Details

### 2.1. Create Task

```typescript
// UI creates new task
const task = {
  id: 'task-001',
  type: 'image',
  name: 'Generate cat image',
  status: 'Waiting', // Initial status
  progress: 0,
  payload: { prompt: 'a cat' },
};

// Call addTask from queue hook
await addTask(task);
```

**Flow:**

1. UI calls `addTask(task)` → `funcs.updateTask()` updates local store
2. Send `QUEUE_COMMAND` message with command `ADD` to Background

---

### 2.2. Receive Command

```typescript
// Background receives message
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
  // ...
}
```

---

### 2.3. QueueManager Processing

```typescript
// queue-manager.ts - add()
async add(platformId, identifier, task) {
  // 1. Get or create queue
  const entry = getOrCreateQueue(platformId, identifier);

  // 2. Add task to tasks array
  if (!exists) {
    tasks.push(task);
  }

  // 3. If status = "Waiting" → add to PQueue
  if (task.status === "Waiting" && !queuedIds.has(task.id)) {
    task.isQueued = true;
    queuedIds.add(task.id);
    queue.add(() => processTask(platformId, identifier, task));
  }

  // 4. Notify UI update
  updateTasks(platformId, identifier, tasks);
  notifyStatusChange(platformId, identifier);
}
```

---

### 2.4. Task Processing

```typescript
// queue-manager.ts - processTask()
private async processTask(platformId, identifier, task) {
  // 1. Get corresponding engine
  const engine = engineHub.get(platformId);

  // 2. Update status → Running
  const taskIndex = entry.tasks.findIndex(t => t.id === task.id);
  entry.tasks[taskIndex].status = "Running";
  updateTasks(platformId, identifier, entry.tasks);

  // 3. Notify UI: task started
  opts.forEach(opt => opt.onTaskStart(...));

  // 4. Execute engine
  try {
    const result = await engine.execute(task);

    // 5. Update result
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

  // 6. Cleanup
  entry.queuedIds.delete(task.id);

  // 7. Notify UI: task completed
  opts.forEach(opt => opt.onTaskComplete(...));

  // 8. Check queue empty → notify
  if (queue.size === 0 && queue.pending === 0) {
    opts.forEach(opt => opt.onQueueEmpty(...));
  }
}
```

---

### 2.5. Engine Execution

```typescript
// Engine interface (BaseEngine)
interface BaseEngine {
  execute(task: Task): Promise<EngineResult>;
  cancel(taskId: string): void;
}

// fxImageGenEngine example
async execute(task: Task): Promise<EngineResult> {
  try {
    // 1. Open browser tab
    const tab = await chrome.tabs.create({ url: task.payload.url });

    // 2. Inject script & execute
    await this.runAutomation(tab.id, task);

    // 3. Get result
    const output = await this.getResult(tab.id);

    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

### 2.6. Sync Back to UI

```typescript
// queue-hook.ts - handleMessage
const handleMessage = (message) => {
  if (message.type === 'QUEUE_EVENT') {
    switch (event) {
      case 'TASKS_UPDATED':
        // Update local Zustand store
        funcs.setTasks(data.tasks);
        funcs.setPendingCount(data.status.size + data.status.pending);
        break;
    }
  }
};
```

---

## 3. Task Lifecycle

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

---

## 4. Persistence & Hydration

| Event               | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| **Browser restart** | Service Worker restarts                                  |
| **Hydrate**         | Load queue state from `chrome.storage.local`             |
| **RehydrateTasks**  | Scan tasks, reset "Running" → "Waiting", re-add to queue |

---

## 5. Main Operations

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

---

## 6. Message Flow

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
    │  setTasks(tasks)              │ engine.execute()
    │  (Zustand update)             │   │
    │                               │   ▼
    │                               │ EngineResult
```
