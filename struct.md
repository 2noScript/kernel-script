src/core/
├── bootstrap/
│   └── index.ts                    # NestJS: main.ts / bootstrap
│
├── controllers/                   # NestJS: controllers/
│   ├── queue.controller.ts     # Handle QUEUE_COMMAND
│   └── direct.controller.ts    # Handle DIRECT_COMMAND
│
├── services/                    # NestJS: services/ (Business Logic)
│   ├── task.service.ts         # api.ts → task.service.ts
│   │                            - createTask()
│   │                            - updateTask()
│   │                            - publishTasks()
│   │                            - queueStart/Stop()
│   │                            - KHÔNG broadcast
│   │
│   ├── queue.service.ts         # queue.manager.ts → queue.service.ts
│   │                            - addTask()
│   │                            - processTask()
│   │                            - callbacks
│   │
│   └── direct.service.ts       # direct.manager.ts → direct.service.ts
│                              - execute()
│                              - stop()
│                              - callbacks
│
├── repositories/               # NestJS: repositories/ (Data Access)
│   └── task.repository.ts     # background-db.ts → task.repository.ts
│                              - saveTask()
│                              - getTask()
│                              - getTasks()
│                              - deleteTask()
│                              - CHỈ DB operations
│
├── modules/                   # NestJS: modules/
│   ├── kernel.module.ts       # Register all services
│   └── events.module.ts    # Broadcast events
│
├── events/                    # Custom events
│   ├── task-started.event.ts
│   ├── task-completed.event.ts
│   └── tasks-updated.event.ts
│
└── types/
    └── index.ts






┌─────────────────────────────────────────────────────────────┐
│                    FLOW MỚI                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  UI ──chrome.runtime.sendMessage──▶ CONTROLLER              │
│           │                                    │            │
│           │                                    ▼            │
│           │                          ┌─────────────────┐    │
│           │                          │ TaskController  │    │
│           │                          │   createTask()  │    │
│           │                          │   updateTask() │    │
│           │                          └────────┬────────┘    │
│           │                                   │              │
│           │        ┌──────────────────────────┼──┐         │
│           │        ▼                          ▼ ▼          │
│           │  ┌─────────────────┐    ┌────────────────┐  │
│           │  │ QueueService    │    │ DirectService  │   │
│           │  │                 │    │                │   │
│           │  │ - queueStart()  │    │ - execute()    │   │
│           │  │ - addTask()    │    │ - stop()      │   │
│           │  │ - processTask│    │                │   │
│           │  └────────┬──────┘    └───────┬────────┘     │
│           │           │                   │               │
│           │           │    CALLBACKS       │               │
│           │           ▼                   ▼               │
│           │    ┌─────────────────────────────────────┐   │
│           │    │         KERNEL MODULE               │   │
│           │    │  - Đăng ký service callbacks       │   │
│           │    │  - Trong callback:                  │   │
│           │    │      1. TaskRepository.saveTask() │   │
│           │    │      2. EventEmitter.emit()         │   │
│           │    └──────────────────┬──────────────────┘   │
│           │                       │                        │
│           │                       ▼                        │
│           │              ┌─────────────────┐                  │
│           │              │TaskRepository │                  │
│           │              │  (DB only)  │                  │
│           │              └─────────────┘                  │
│           │                                                 │
│           ▼                                                 │
│  UI ◀───broadcast◀───EVENT EMITTER◀────────────────────── │
│                                                             │
└─────────────────────────────────────────────────────────────┘