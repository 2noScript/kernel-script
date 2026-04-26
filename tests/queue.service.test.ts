import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { QueueService } from '@/core/services/queue.service';
import { engineHub } from '@/core/common/engine-hub';
import { createMockTask, createMockEngine } from './setup';

const IDENTIFIER = 'test-id';

let testCounter = 0;
let currentKeycard = '';

describe('QueueService', () => {
  let queueService: QueueService;

  beforeEach(() => {
    testCounter++;
    currentKeycard = `test-keycard-${testCounter}`;
    queueService = new QueueService();
  });

  afterEach(async () => {
    await queueService.stop(currentKeycard, IDENTIFIER);
    engineHub.unregister(currentKeycard);
  });

  describe('registerEngine', () => {
    it('should register an engine', () => {
      const engine = createMockEngine({}, currentKeycard);
      queueService.registerEngine(engine);
    });
  });

  describe('add', () => {
    it('should add task to internal map', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });

    it('should update existing task with same id', async () => {
      const task1 = createMockTask({ id: 'task-1', name: 'Task 1' });
      const task2 = createMockTask({ id: 'task-1', name: 'Task Updated' });

      await queueService.add(currentKeycard, IDENTIFIER, task1);
      await queueService.add(currentKeycard, IDENTIFIER, task2);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
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
      await queueService.addMany(currentKeycard, IDENTIFIER, tasks);

      const storedTasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(storedTasks).toHaveLength(3);
    });
  });

  describe('start/stop', () => {
    it('should start queue', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.isRunning).toBe(true);
    });

    it('should stop queue and reset tasks', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await queueService.stop(currentKeycard, IDENTIFIER);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.isRunning).toBe(false);
    });

    it('should set Running task to Cancelled when stop queue', async () => {
      const engine = createMockEngine({ success: true }, currentKeycard);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 1,
        delayMin: 10,
        delayMax: 10,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await queueService.stop(currentKeycard, IDENTIFIER);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });

    it('should set status to Cancelled when stop during engine execution', async () => {
      let executeResolve: (result: any) => void = () => {};
      const delayedEngine = {
        keycard: currentKeycard,
        execute: async () => {
          return new Promise((resolve) => {
            executeResolve = resolve;
          });
        },
      };
      queueService.registerEngine(delayedEngine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 1,
        delayMin: 0,
        delayMax: 0,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await queueService.stop(currentKeycard, IDENTIFIER);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });
  });

  describe('getStatus', () => {
    it('should return correct status for empty queue', () => {
      const status = queueService.getStatus(currentKeycard, IDENTIFIER);

      expect(status.size).toBe(0);
      expect(status.pending).toBe(0);
      expect(status.isRunning).toBe(false);
    });

    it('should count waiting tasks as size', async () => {
      const task = createMockTask({ status: 'Waiting', isQueued: true });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.size).toBe(1);
    });

    it('should count running tasks as pending', async () => {
      const task = createMockTask({ status: 'Running' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.pending).toBe(1);
    });
  });

  describe('updateTaskConfig', () => {
    it('should update task config', () => {
      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 3,
        delayMin: 2,
        delayMax: 10,
        stopOnErrorCount: 5,
      });

      const config = queueService.getTaskConfig(currentKeycard, IDENTIFIER);
      expect(config.threads).toBe(3);
      expect(config.delayMin).toBe(2);
      expect(config.delayMax).toBe(10);
      expect(config.stopOnErrorCount).toBe(5);
    });
  });

  describe('haltTask', () => {
    it('should set task status to Cancelled', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Running' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      queueService.haltTask(currentKeycard, IDENTIFIER, 'task-1');

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });
  });

  describe('cancelTask', () => {
    it('should set task status to Cancelled', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.cancelTask(currentKeycard, IDENTIFIER, 'task-1');

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('Cancelled');
    });

    it('should keep task in tasks list after cancel', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      const taskCountBefore = queueService.getTasks(currentKeycard, IDENTIFIER).length;
      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);
      const taskCountAfter = queueService.getTasks(currentKeycard, IDENTIFIER).length;

      expect(taskCountAfter).toBe(taskCountBefore);
    });

    it('should set Running task to Cancelled when cancelTask (direct)', async () => {
      const task = createMockTask({ id: 'task-running', status: 'Running' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.cancelTask(currentKeycard, IDENTIFIER, 'task-running');

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });

    it('should set status to Cancelled when cancelling task after delay starts', async () => {
      const engine = createMockEngine({ success: true }, currentKeycard);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 1,
        delayMin: 10,
        delayMax: 10,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      const cancelledTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(cancelledTask?.status).toBe('Cancelled');
    });
  });

  describe('haltTask', () => {
    it('should set task status to Cancelled', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Running' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      queueService.haltTask(currentKeycard, IDENTIFIER, 'task-1');

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });

    it('should set Waiting task to Cancelled when haltTask', async () => {
      const task = createMockTask({ id: 'task-waiting', status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      queueService.haltTask(currentKeycard, IDENTIFIER, 'task-waiting');

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Cancelled');
    });
  });

  describe('pause', () => {
    it('should pause queue without clearing tasks', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await queueService.pause(currentKeycard, IDENTIFIER);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.isRunning).toBe(false);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks).toHaveLength(1);
    });

    it('should resume paused queue', async () => {
      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await queueService.pause(currentKeycard, IDENTIFIER);
      await queueService.resume(currentKeycard, IDENTIFIER);

      const status = queueService.getStatus(currentKeycard, IDENTIFIER);
      expect(status.isRunning).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all tasks from queue', async () => {
      const task1 = createMockTask({ id: 'task-1', status: 'Waiting' });
      const task2 = createMockTask({ id: 'task-2', status: 'Waiting' });
      await queueService.addMany(currentKeycard, IDENTIFIER, [task1, task2]);

      await queueService.clear(currentKeycard, IDENTIFIER);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('retryTasks', () => {
    it('should retry error tasks', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Error', errorMessage: 'Failed' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.retryTasks(currentKeycard, IDENTIFIER, ['task-1']);

      const tasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(tasks[0].status).toBe('Waiting');
      expect(tasks[0].errorMessage).toBeUndefined();
    });

    it('should return empty array when no error tasks', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Completed' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      const result = await queueService.retryTasks(currentKeycard, IDENTIFIER);

      expect(result).toHaveLength(0);
    });
  });

  describe('setConcurrency', () => {
    it('should set concurrency for new keycard', () => {
      queueService.updateTaskConfig('new-keycard', IDENTIFIER, {
        threads: 1,
        delayMin: 0,
        delayMax: 0,
        stopOnErrorCount: 0,
      });

      queueService.setConcurrency('new-keycard', 5);

      const config = queueService.getTaskConfig('new-keycard', IDENTIFIER);
      expect(config.threads).toBe(5);
    });

    it('should update existing keycard concurrency', () => {
      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 1,
        delayMin: 0,
        delayMax: 0,
        stopOnErrorCount: 0,
      });

      queueService.setConcurrency(currentKeycard, 3);

      const config = queueService.getTaskConfig(currentKeycard, IDENTIFIER);
      expect(config.threads).toBe(3);
    });
  });

  describe('getTaskConfig', () => {
    it('should return default config for new queue', () => {
      const config = queueService.getTaskConfig('new-platform', 'new-identifier');

      expect(config.threads).toBe(1);
      expect(config.delayMin).toBe(1);
      expect(config.delayMax).toBe(15);
      expect(config.stopOnErrorCount).toBe(0);
    });

    it('should return stored config after update', () => {
      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 4,
        delayMin: 5,
        delayMax: 20,
        stopOnErrorCount: 10,
      });

      const config = queueService.getTaskConfig(currentKeycard, IDENTIFIER);
      expect(config.threads).toBe(4);
      expect(config.delayMin).toBe(5);
      expect(config.delayMax).toBe(20);
      expect(config.stopOnErrorCount).toBe(10);
    });
  });

  describe('task execution', () => {
    it('should set status to Cancelled after starting queue and cancelling', async () => {
      const engine = createMockEngine({ success: true }, currentKeycard);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        threads: 1,
        delayMin: 10,
        delayMax: 10,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const cancelledTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(cancelledTask?.status).toBe('Cancelled');
    });

    it('should not change status when task is Completed', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Completed' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.cancelTask(currentKeycard, IDENTIFIER, 'task-1');

      const updatedTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === 'task-1');
      expect(updatedTask?.status).toBe('Completed');
    });

    it('should not change status when Completed task halts', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Completed' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      queueService.haltTask(currentKeycard, IDENTIFIER, 'task-1');

      const updatedTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === 'task-1');
      expect(updatedTask?.status).toBe('Completed');
    });

    it('should set Error task to Cancelled when haltask', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Error' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      queueService.haltTask(currentKeycard, IDENTIFIER, 'task-1');

      const updatedTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === 'task-1');
      expect(updatedTask?.status).toBe('Cancelled');
    });
  });

  describe('FE to Backend Flow - Cancel Task', () => {
    it('should cancel task during delay phase via complete FE flow', async () => {
      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        delayMin: 10,
        delayMax: 10,
        threads: 1,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const resultTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(resultTask?.status).toBe('Cancelled');
    });

    it('should cancel running task via complete FE flow', async () => {
      const engine = createMockEngine({ success: true }, currentKeycard);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        delayMin: 0,
        delayMax: 0,
        threads: 1,
        stopOnErrorCount: 0,
      });

      const task = createMockTask({ status: 'Waiting' });
      await queueService.add(currentKeycard, IDENTIFIER, task);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const resultTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(resultTask?.status).toBe('Cancelled');
    });

    it('should cancel waiting task via complete FE flow', async () => {
      const task = createMockTask({ status: 'Waiting', isQueued: true });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      const resultTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(resultTask?.status).toBe('Cancelled');
    });

    it('should NOT change completed task status when cancelled', async () => {
      const task = createMockTask({ status: 'Completed' });
      await queueService.add(currentKeycard, IDENTIFIER, task);

      await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);

      const resultTask = queueService
        .getTasks(currentKeycard, IDENTIFIER)
        .find((t) => t.id === task.id);
      expect(resultTask?.status).toBe('Completed');
    });

    it('should cancel multiple tasks via queueCancelTasks', async () => {
      const tasks = [
        createMockTask({ status: 'Waiting' }),
        createMockTask({ status: 'Running' }),
        createMockTask({ status: 'Waiting' }),
      ];
      await queueService.addMany(currentKeycard, IDENTIFIER, tasks);

      for (const task of tasks) {
        await queueService.cancelTask(currentKeycard, IDENTIFIER, task.id);
      }

      const resultTasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(resultTasks.every((t) => t.status === 'Cancelled')).toBe(true);
    });

    it('should handle cancelling non-existent task gracefully', async () => {
      const beforeTasks = queueService.getTasks(currentKeycard, IDENTIFIER).length;

      await queueService.cancelTask(currentKeycard, IDENTIFIER, 'non-existent-task-id');

      const afterTasks = queueService.getTasks(currentKeycard, IDENTIFIER).length;
      expect(afterTasks).toBe(beforeTasks);
    });

    it('should cancel all running tasks when queue is stopped', async () => {
      const engine = createMockEngine({ success: true }, currentKeycard);
      queueService.registerEngine(engine);

      queueService.updateTaskConfig(currentKeycard, IDENTIFIER, {
        delayMin: 10,
        delayMax: 10,
        threads: 2,
        stopOnErrorCount: 0,
      });

      const tasks = [createMockTask({ status: 'Waiting' }), createMockTask({ status: 'Waiting' })];
      await queueService.addMany(currentKeycard, IDENTIFIER, tasks);
      await queueService.start(currentKeycard, IDENTIFIER);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await queueService.stop(currentKeycard, IDENTIFIER);

      const resultTasks = queueService.getTasks(currentKeycard, IDENTIFIER);
      expect(resultTasks.every((t) => t.status === 'Cancelled')).toBe(true);
      expect(queueService.getStatus(currentKeycard, IDENTIFIER).isRunning).toBe(false);
    });
  });
});
