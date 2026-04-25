# kernel-script Example

A practical example demonstrating kernel-script v2.0 with React, TypeScript, Vite, and Bun.

## Quick Start

```bash
bun install
bun dev
bun build
```

## Features

- **Task Queue** - Queue, schedule, and execute tasks with background processing
- **Persistence** - IndexedDB storage for task state
- **Queue Hook** - useWorker React hook for task management
- **Engine Registry** - New registry-based engine system

## Using kernel-script

| File                                                           | Description                |
| -------------------------------------------------------------- | -------------------------- |
| [`src/background.ts`](src/background.ts)                       | Engine setup with registry |
| [`src/hooks/use-task-worker.ts`](src/hooks/use-task-worker.ts) | useWorker hook             |
| [`src/stores/app.store.ts`](src/stores/app.store.ts)           | App store                  |
| [`src/engines/`](src/engines/)                                 | Engine implementations     |

## API Example

```typescript
// src/background.ts
import { engineRegistry } from '@/engines';
import { setupKernelScript } from 'kernel-script';

setupKernelScript(engineRegistry, {
  debug: true,
});
```

```typescript
// src/hooks/use-task-worker.ts
import { noopEngine } from '@/engines/noop.engine';
import { useWorker } from 'kernel-script';

export const useTaskWorker = useWorker({
  engine: noopEngine,
  identifier: 'default',
});

// Hook returns: tasks, isRunning, selectedIds, taskConfig, setTaskConfig,
// createTask, createTasks, deleteTask, deleteTasks, publishTasks, unpublishTasks,
// queueStart, queueStop, queueCancelTask, queueClear, retryTask, skipTask,
// toggleSelect, toggleSelectAll, clearSelected, runTask, stopTask, sync
```

## Installation

```bash
bun install
bun build
```

1. **Load in Chrome**
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `dist` folder

2. **Reload after changes**
   - Run `bun dev`
   - Click reload icon on extension in `chrome://extensions`

## Development

- **Popup**: Right-click extension icon → "Inspect popup"
- **Background**: In `chrome://extensions` → "Service worker" → "Inspect views"

## License

[MIT](LICENSE)
