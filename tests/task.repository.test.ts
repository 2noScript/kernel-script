import { describe, it, expect, beforeEach } from 'bun:test';
import { createMockTask, resetMockDb } from './setup';
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
    return tasks[idx];
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

  async clearTasks(keycard: string, identifier: string): Promise<void> {
    const key = this.getKey(keycard, identifier);
    store.delete(key);
  }
}

const repo = new MockTaskRepository();

describe('TaskRepository', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('saveTask', () => {
    it('should add new task to empty list', async () => {
      const task = createMockTask({ name: 'New Task' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);

      const tasks = await repo.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('New Task');
    });

    it('should update existing task', async () => {
      const task = createMockTask({ name: 'Original' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);

      task.name = 'Updated';
      await repo.saveTask(KEYCARD, IDENTIFIER, task);

      const tasks = await repo.getTasks(KEYCARD, IDENTIFIER);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('Updated');
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

  describe('updateTask', () => {
    it('should update task with partial data', async () => {
      const task = createMockTask({ id: 'task-1', name: 'Original', status: 'Draft' });
      await repo.saveTask(KEYCARD, IDENTIFIER, task);

      const updated = await repo.updateTask(KEYCARD, IDENTIFIER, 'task-1', { status: 'Waiting' });

      expect(updated?.status).toBe('Waiting');
      expect(updated?.name).toBe('Original');
    });

    it('should return null for non-existent', async () => {
      const updated = await repo.updateTask(KEYCARD, IDENTIFIER, 'fake-id', { status: 'Waiting' });
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
      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2' });
      const task3 = createMockTask({ id: 'task-3' });
      await repo.saveTasks(KEYCARD, IDENTIFIER, [task1, task2, task3]);

      const count = await repo.deleteTasks(KEYCARD, IDENTIFIER, ['task-1', 'task-2']);

      expect(count).toBe(2);
      const remaining = await repo.getTasks(KEYCARD, IDENTIFIER);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('task-3');
    });
  });
});
