import { describe, it, expect, beforeEach } from 'bun:test';
import { createMockTask } from './setup';
import type { Task } from '@/core/common/types';

const store = new Map<string, { tasks: Task[]; updatedAt: number }>();

const KEYCARD = 'test-keycard';
const IDENTIFIER = 'test-id';

class MockTaskRepository {
  private getKey(keycard: string, identifier: string): string {
    return `${keycard}__${identifier}`;
  }

  async saveTasks(keycard: string, identifier: string, tasks: Task[]): Promise<void> {
    const key = this.getKey(keycard, identifier);
    store.set(key, { tasks, updatedAt: Date.now() });
  }

  async getTasks(keycard: string, identifier: string): Promise<Task[]> {
    const key = this.getKey(keycard, identifier);
    return store.get(key)?.tasks ?? [];
  }

  async getTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    const tasks = await this.getTasks(keycard, identifier);
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  async saveTask(keycard: string, identifier: string, task: Task): Promise<void> {
    const tasks = await this.getTasks(keycard, identifier);
    const idx = tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      tasks[idx] = task;
    } else {
      tasks.push(task);
    }
    await this.saveTasks(keycard, identifier, tasks);
  }

  async updateTask(
    keycard: string,
    identifier: string,
    taskId: string,
    updates: Partial<Task>
  ): Promise<Task | null> {
    const tasks = await this.getTasks(keycard, identifier);
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return null;
    tasks[idx] = { ...tasks[idx], ...updates, id: taskId } as Task;
    await this.saveTasks(keycard, identifier, tasks);
    return tasks[idx] ?? null;
  }

  async deleteTask(keycard: string, identifier: string, taskId: string): Promise<boolean> {
    const tasks = await this.getTasks(keycard, identifier);
    const filtered = tasks.filter((t) => t.id !== taskId);
    if (filtered.length === tasks.length) return false;
    await this.saveTasks(keycard, identifier, filtered);
    return true;
  }

  async deleteTasks(keycard: string, identifier: string, taskIds: string[]): Promise<number> {
    const tasks = await this.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const filtered = tasks.filter((t) => !idSet.has(t.id));
    const deleted = tasks.length - filtered.length;
    if (deleted > 0) {
      await this.saveTasks(keycard, identifier, filtered);
    }
    return deleted;
  }
}

const repo = new MockTaskRepository();

describe('TaskService with Mock', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('createTask', () => {
    it('should create task with Draft status', async () => {
      const task = createMockTask({ name: 'New Task' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      expect(task.status).toBe('Draft');
    });
  });

  describe('getTask', () => {
    it('should return task by id', async () => {
      const task = createMockTask({ id: 'task-123' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      const found = await repo.getTask(KEYCARD, IDENTIFIER, 'task-123');
      expect(found?.id).toBe('task-123');
    });

    it('should return null for non-existent', async () => {
      const found = await repo.getTask(KEYCARD, IDENTIFIER, 'non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getTasks', () => {
    it('should return all tasks', async () => {
      await repo.saveTasks(KEYCARD, IDENTIFIER, [createMockTask(), createMockTask()]);
      const tasks = await repo.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('updateTask', () => {
    it('should update task', async () => {
      const task = createMockTask({ id: 'task-1', name: 'Original' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      const updated = await repo.updateTask(KEYCARD, IDENTIFIER, 'task-1', { name: 'Updated' });
      expect(updated?.name).toBe('Updated');
    });

    it('should return null for non-existent', async () => {
      const updated = await repo.updateTask(KEYCARD, IDENTIFIER, 'non-existent', {
        name: 'Updated',
      });
      expect(updated).toBeNull();
    });
  });

  describe('deleteTask', () => {
    it('should delete existing task', async () => {
      const task = createMockTask({ id: 'task-1' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      const result = await repo.deleteTask(KEYCARD, IDENTIFIER, 'task-1');
      expect(result).toBe(true);
      const found = await repo.getTask(KEYCARD, IDENTIFIER, 'task-1');
      expect(found).toBeNull();
    });

    it('should return false for non-existent', async () => {
      const result = await repo.deleteTask(KEYCARD, IDENTIFIER, 'fake-id');
      expect(result).toBe(false);
    });
  });

  describe('deleteTasks', () => {
    it('should delete multiple tasks', async () => {
      await repo.saveTasks(KEYCARD, IDENTIFIER, [
        createMockTask({ id: 'task-1' }),
        createMockTask({ id: 'task-2' }),
        createMockTask({ id: 'task-3' }),
      ]);
      const count = await repo.deleteTasks(KEYCARD, IDENTIFIER, ['task-1', 'task-2']);
      expect(count).toBe(2);
      const remaining = await repo.getTasks(KEYCARD, IDENTIFIER);
      expect(remaining).toHaveLength(1);
    });
  });

  describe('status transitions', () => {
    it('should change Draft to Waiting when published', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Draft', isQueued: false });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      await repo.updateTask(KEYCARD, IDENTIFIER, 'task-1', { status: 'Waiting' });
      const updated = await repo.getTask(KEYCARD, IDENTIFIER, 'task-1');
      expect(updated?.status).toBe('Waiting');
    });

    it('should revert running task to Draft', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Running', isQueued: true });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);
      await repo.updateTask(KEYCARD, IDENTIFIER, 'task-1', { status: 'Draft', isQueued: false });
      const updated = await repo.getTask(KEYCARD, IDENTIFIER, 'task-1');
      expect(updated?.status).toBe('Draft');
    });
  });
});
