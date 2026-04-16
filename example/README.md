# chrome-extension-boilerplate

![Bun](https://img.shields.io/badge/Bun-%23000f00?style=flat&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61dafb?style=flat&logo=react&logoColor=black)
![ Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-38bdf8?style=flat&logo=tailwind-css&logoColor=white)

A Chrome Extension boilerplate built with React, TypeScript, Vite, and Bun.

## Quick Start

```bash
bun install
bun dev
bun build
```

## Features

- **Chrome Extension (Manifest V3)** - Modern Chrome extension architecture
- **React 19** with TypeScript - Component-based UI development
- **Tailwind CSS 4** - Utility-first CSS framework
- **shadcn/ui** - Accessible UI components (built on Radix UI)
- **Theme Toggle** - Light/Dark mode support
- **Toast Notifications** - Powered by Sonner
- **State Management** - Zustand for global state
- **Background Worker** - Service worker for background tasks

### Chrome APIs

- `storage` - Extension storage
- `alarms` - Scheduled tasks
- `sidePanel` - Side panel support
- `activeTab` - Active tab access
- `scripting` - Content script injection
- `cookies` - Cookie management

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19, TypeScript |
| Build Tool | Vite |
| Package Manager | Bun |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui, Radix UI |
| Icons | Lucide React |
| State | Zustand |
| HTTP Client | Axios |
| Notifications | Sonner |
| Themes | next-themes |

## Project Structure

```
chrome-extension-boilerplate/
├── src/
│   ├── background.ts        # Service worker
│   ├── main.tsx             # React entry point
│   ├── popup/               # Popup page
│   │   └── index.tsx
│   ├── pages/               # Page components
│   │   └── home/
│   │       └── index.tsx
│   ├── components/          # UI components
│   │   ├── ui/             # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   └── sonner.tsx
│   │   ├── theme-toggle.tsx
│   │   ├── theme-provider.tsx
│   │   └── loading-overlay.tsx
│   ├── stores/              # Zustand stores
│   │   └── app.store.ts
│   └── lib/                # Utilities
│       ├── utils.ts
│       └── helpers.ts
├── public/                  # Static assets
├── dist/                   # Build output
├── manifest.json           # Extension manifest
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config
├── eslint.config.js       # ESLint config
├── components.json       # shadcn/ui config
└── package.json
```

### Key Directories

- `src/popup/` - Extension popup UI
- `src/background.ts` - Service worker (runs in background)
- `src/components/` - Reusable UI components
- `src/stores/` - Global state stores
- `src/lib/` - Utility functions and helpers

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server |
| `bun build` | Build extension for production |
| `bun lint` | Run ESLint |
| `bun preview` | Preview production build |

## Installation

1. **Install dependencies**

```bash
bun install
```

2. **Build the extension**

```bash
bun build
```

3. **Load in Chrome**

   - Open Chrome and navigate to `chrome://extensions`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `dist` folder from your project directory

4. **Reload after changes**

   - Run `bun dev` to start the development server
   - Click the reload icon on your extension in `chrome://extensions`
   - Or use the keyboard shortcut: `Ctrl+Shift+S`

## Development

### Debugging

- **Popup**: Right-click extension icon → "Inspect popup"
- **Background**: In `chrome://extensions` → "Service worker" link → "Inspect views"

### Hot Reload

The development server uses HMR. Changes to React components will reload automatically. For manifest changes or background worker changes, reload the extension manually.

## License

[MIT](LICENSE)