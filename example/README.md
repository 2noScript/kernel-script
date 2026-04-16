# kernel-script Example

A practical example demonstrating kernel-script library with React, TypeScript, Vite, and Bun.

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

## Using kernel-script

| File                                                           | Description                 |
| -------------------------------------------------------------- | --------------------------- |
| [`src/background.ts`](src/background.ts)                       | Engine setup                |
| [`src/hooks/use-task-worker.ts`](src/hooks/use-task-worker.ts) | useWorker hook              |
| [`src/stores/task.store.ts`](src/stores/task.store.ts)         | Task store with persistence |

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
