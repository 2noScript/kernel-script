import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QueueService, type QueueCallbacks } from '@/core/services/queue.service';
import { engineHub } from '@/core/common/engine.hub';
import { createMockTask, createMockEngine } from './setup';

const KEYCARD = 'test-keycard';
const IDENTIFIER = 'test-id';

let onTaskStartCalled = false;
let onTaskCompleteCalled = false;
let onQueueEmptyCalled = false;
let lastTaskId = '';
let lastResult: any = null;
let lastIdentifier = '';

const callbacks: QueueCallbacks = {
  onTaskStart: (keycard, identifier, taskId) => {
    onTaskStartCalled = true;
    lastTaskId = taskId;
    lastIdentifier = identifier;
  },
  onTaskComplete: (keycard, identifier, taskId, result) => {
    onTaskCompleteCalled = true;
    lastTaskId = taskId;
    lastResult = result;
  },
  onQueueEmpty: (keycard, identifier) => {
    onQueueEmptyCalled = true;
    lastIdentifier = identifier;
  },
};

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    queueService = new QueueService();
    queueService.registerCallbacks(callbacks);
    onTaskStartCalled = false;
    onTaskCompleteCalled = false;
    onQueueEmptyCalled = false;
    lastTaskId = '';
    lastResult = null;
    lastIdentifier = '';
  });

  afterEach(async () => {
    await queueService.stop(KEYCARD, IDENTIFIER);
    engineHub.unregister(KEYCARD);
  });

  describe('registerEngine', () => {
    it('should register an engine', () => {
      const engine = createMockEngine();
      queueService.registerEngine(engine);
      // Engine is registered (no error thrown)
    });
  });

  describe('add', () => {
    it('should add task to internal map', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      const tasks = queueService.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });

    it('should update existing task with same id', async () => {
      const task1 = createMockTask({ id: 'task-1', name: 'Task 1' });
      const task2 = createMockTask({ id: 'task-1', name: 'Task Updated' });

      await queueService.add(KEYCARD, IDENTIFIER, task1);
      await queueService.add(KEYCARD, IDENTIFIER, task2);

      const tasks = queueService.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('Task Updated');
    });
  });

  describe('addMany', () => {
    it('should add multiple tasks to queue', async () => {
      const tasks = [
        createMockTask({ status: 'Waiting' }),
        createMockTask({ status: 'Waiting' }),
        createMockTask({ status: 'Waiting' }),
      ];
      await queueService.addMany(KEYCARD, IDENTIFIER, tasks);

      const storedTasks = queueService.getTasks(KEYCARD, IDENTIFIER);
      expect(storedTasks).toHaveLength(3);
    });
  });

  describe('start/stop', () => {
    it('should start queue', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      await queueService.start(KEYCARD, IDENTIFIER);

      const status = queueService.getStatus(KEYCARD, IDENTIFIER);
      expect(status.isRunning).toBe(true);
    });

    it('should stop queue and reset tasks', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(KEYCARD, IDENTIFIER, task);
      await queueService.start(KEYCARD, IDENTIFIER);

      await queueService.stop(KEYCARD, IDENTIFIER);

      const status = queueService.getStatus(KEYCARD, IDENTIFIER);
      expect(status.isRunning).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return correct status for empty queue', () => {
      const status = queueService.getStatus(KEYCARD, IDENTIFIER);

      expect(status.size).toBe(0);
      expect(status.pending).toBe(0);
      expect(status.isRunning).toBe(false);
    });

    it('should count waiting tasks as size', async () => {
      const task = createMockTask({ status: 'Waiting', isQueued: true });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      const status = queueService.getStatus(KEYCARD, IDENTIFIER);
      expect(status.size).toBe(1);
    });

    it('should count running tasks as pending', async () => {
      const task = createMockTask({ status: 'Running' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      const status = queueService.getStatus(KEYCARD, IDENTIFIER);
      expect(status.pending).toBe(1);
    });
  });

  describe('toggleSelect', () => {
    it('should toggle task selection', async () => {
      const task = createMockTask({ id: 'task-1' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      const selected = queueService.toggleSelect(KEYCARD, IDENTIFIER, 'task-1');
      expect(selected).toContain('task-1');

      const selected2 = queueService.toggleSelect(KEYCARD, IDENTIFIER, 'task-1');
      expect(selected2).not.toContain('task-1');
    });
  });

  describe('getSelectedIds', () => {
    it('should return selected ids', async () => {
      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2' });
      await queueService.addMany(KEYCARD, IDENTIFIER, [task1, task2]);

      queueService.toggleSelect(KEYCARD, IDENTIFIER, 'task-1');
      queueService.toggleSelect(KEYCARD, IDENTIFIER, 'task-2');

      const selected = queueService.getSelectedIds(KEYCARD, IDENTIFIER);
      expect(selected).toHaveLength(2);
    });
  });

  describe('updateTaskConfig', () => {
    it('should update task config', () => {
      queueService.updateTaskConfig(KEYCARD, IDENTIFIER, {
        threads: 3,
        delayMin: 2,
        delayMax: 10,
        stopOnErrorCount: 5,
      });

      const config = queueService.getTaskConfig(KEYCARD, IDENTIFIER);
      expect(config.threads).toBe(3);
      expect(config.delayMin).toBe(2);
      expect(config.delayMax).toBe(10);
      expect(config.stopOnErrorCount).toBe(5);
    });
  });

  describe('haltTask', () => {
    it('should abort running task', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Running' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      queueService.haltTask(KEYCARD, IDENTIFIER, 'task-1');

      const tasks = queueService.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks[0].status).toBe('Waiting');
      expect(tasks[0].isQueued).toBe(false);
    });
  });

  describe('cancelTask', () => {
    it('should remove task from queue', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Waiting' });
      await queueService.add(KEYCARD, IDENTIFIER, task);

      await queueService.cancelTask(KEYCARD, IDENTIFIER, 'task-1');

      const tasks = queueService.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('callbacks', () => {
    it('should call onTaskStart when task starts processing', async () => {
      const engine = createMockEngine({ success: true }, KEYCARD);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(KEYCARD, IDENTIFIER, {
        threads: 1,
        delayMin: 0,
        delayMax: 0,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(KEYCARD, IDENTIFIER, task);
      await queueService.start(KEYCARD, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onTaskStartCalled).toBe(true);
    });
  });
});
