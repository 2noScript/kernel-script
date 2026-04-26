import { taskRepository } from '@/core/repositories/task.repository';
import { getQueueService } from '@/core/services/queue.service';
import { directService } from '@/core/services/direct.service';
import type { Task, TaskInput, QueueStatus } from '@/core/common/types';

export type TaskFilters = {
  status?: Task['status'][];
  search?: string;
};

export class TaskService {
  async createTask(keycard: string, identifier: string, input: TaskInput): Promise<Task> {
    const now = Date.now();
    const existingTasks = await taskRepository.getTasks(keycard, identifier);
    const task: Task = {
      id: crypto.randomUUID(),
      no: existingTasks.length + 1,
      name: input.name,
      status: 'Draft',
      progress: 0,
      payload: input.payload,
      isQueued: false,
      createAt: now,
      updateAt: now,
      histories: [],
    };

    await taskRepository.saveTask(keycard, identifier, task);
    return task;
  }

  async createTasks(keycard: string, identifier: string, inputs: TaskInput[]): Promise<Task[]> {
    const tasks: Task[] = [];
    const existingTasks = await taskRepository.getTasks(keycard, identifier);
    let no = existingTasks.length;

    for (const input of inputs) {
      const now = Date.now();
      no += 1;
      const task: Task = {
        id: crypto.randomUUID(),
        no,
        name: input.name,
        status: 'Draft',
        progress: 0,
        payload: input.payload,
        isQueued: false,
        createAt: now,
        updateAt: now,
        histories: [],
      };
      tasks.push(task);
    }

    await taskRepository.saveTasks(keycard, identifier, [...existingTasks, ...tasks]);
    return tasks;
  }

  async getTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    return taskRepository.getTask(keycard, identifier, taskId);
  }

  async getTasks(keycard: string, identifier: string, filters?: TaskFilters): Promise<Task[]> {
    let tasks = await taskRepository.getTasks(keycard, identifier);

    if (filters?.status?.length) {
      const statusSet = new Set(filters.status);
      tasks = tasks.filter((t) => statusSet.has(t.status));
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      tasks = tasks.filter((t) => t.name.toLowerCase().includes(searchLower));
    }

    return tasks;
  }

  async getTasksGroupedByStatus(
    keycard: string,
    identifier: string
  ): Promise<Record<Task['status'], Task[]>> {
    const tasks = await taskRepository.getTasks(keycard, identifier);
    const grouped: Record<Task['status'], Task[]> = {
      Draft: [],
      Waiting: [],
      Running: [],
      Completed: [],
      Error: [],
      Cancelled: [],
      Previous: [],
      Skipped: [],
    };

    for (const task of tasks) {
      grouped[task.status].push(task);
    }

    return grouped;
  }

  async deleteTask(keycard: string, identifier: string, taskId: string): Promise<boolean> {
    return taskRepository.deleteTask(keycard, identifier, taskId);
  }

  async deleteTasks(keycard: string, identifier: string, taskIds: string[]): Promise<number> {
    return taskRepository.deleteTasks(keycard, identifier, taskIds);
  }

  async updateTask(
    keycard: string,
    identifier: string,
    taskId: string,
    updates: Partial<Task>
  ): Promise<Task | null> {
    return taskRepository.updateTask(keycard, identifier, taskId, updates);
  }

  async publishTasks(keycard: string, identifier: string, taskIds: string[]): Promise<Task[]> {
    const tasks = await taskRepository.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const updatedTasks: Task[] = [];

    for (const task of tasks) {
      if (idSet.has(task.id) && task.status === 'Draft') {
        task.status = 'Waiting';
        task.isQueued = true;
        task.updateAt = Date.now();
        updatedTasks.push(task);
      }
    }

    if (updatedTasks.length > 0) {
      await taskRepository.saveTasks(keycard, identifier, tasks);

      const queueService = getQueueService();
      await queueService.addMany(keycard, identifier, updatedTasks);
    }

    return updatedTasks;
  }

  async unpublishTasks(keycard: string, identifier: string, taskIds: string[]): Promise<Task[]> {
    const tasks = await taskRepository.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const updatedTasks: Task[] = [];

    for (const task of tasks) {
      if (idSet.has(task.id) && task.status === 'Waiting') {
        task.status = 'Draft';
        task.isQueued = false;
        task.updateAt = Date.now();
        updatedTasks.push(task);
      }
    }

    if (updatedTasks.length > 0) {
      const queueService = getQueueService();
      for (const task of updatedTasks) {
        await queueService.cancelTask(keycard, identifier, task.id);
      }

      await taskRepository.saveTasks(keycard, identifier, tasks);
    }

    return updatedTasks;
  }

  async resetTasks(keycard: string, identifier: string, taskIds: string[]): Promise<Task[]> {
    const tasks = await taskRepository.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const updatedTasks: Task[] = [];

    for (const task of tasks) {
      if (
        idSet.has(task.id) &&
        ['Completed', 'Error', 'Skipped', 'Cancelled'].includes(task.status)
      ) {
        task.status = 'Draft';
        task.isQueued = false;
        task.progress = 0;
        task.errorMessage = undefined;
        task.result = undefined;
        task.updateAt = Date.now();
        updatedTasks.push(task);
      }
    }

    if (updatedTasks.length > 0) {
      await taskRepository.saveTasks(keycard, identifier, tasks);
    }

    return updatedTasks;
  }

  async runTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    const task = await taskRepository.getTask(keycard, identifier, taskId);
    if (!task) return null;

    await directService.execute(keycard, identifier, task);
    return taskRepository.getTask(keycard, identifier, taskId);
  }

  async stopTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    directService.stop(keycard, identifier, taskId);

    const task = await taskRepository.getTask(keycard, identifier, taskId);
    if (!task) return null;

    task.status = 'Waiting';
    task.isQueued = false;
    task.updateAt = Date.now();
    await taskRepository.saveTask(keycard, identifier, task);

    return task;
  }

  async retryTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    return this.updateTask(keycard, identifier, taskId, {
      status: 'Waiting',
      progress: 0,
      errorMessage: undefined,
      isQueued: false,
      updateAt: Date.now(),
    });
  }

  async skipTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    return this.updateTask(keycard, identifier, taskId, {
      status: 'Skipped',
      updateAt: Date.now(),
    });
  }

  async queueStart(keycard: string, identifier: string): Promise<void> {
    const tasks = await taskRepository.getTasks(keycard, identifier);

    for (const task of tasks) {
      if (task.status === 'Waiting' && !task.isQueued) {
        task.isQueued = true;
      }
    }
    await taskRepository.saveTasks(keycard, identifier, tasks);

    const queueService = getQueueService();
    await queueService.addMany(
      keycard,
      identifier,
      tasks.filter((t) => t.status === 'Waiting')
    );
    await queueService.start(keycard, identifier);
  }

  async queueStop(keycard: string, identifier: string): Promise<void> {
    const queueService = getQueueService();
    await queueService.stop(keycard, identifier);

    const tasks = await taskRepository.getTasks(keycard, identifier);
    for (const task of tasks) {
      if (task.status === 'Running') {
        task.status = 'Waiting';
        task.isQueued = false;
      }
    }
    await taskRepository.saveTasks(keycard, identifier, tasks);
  }

  async queueCancelTask(keycard: string, identifier: string, taskId: string): Promise<boolean> {
    const queueService = getQueueService();
    await queueService.cancelTask(keycard, identifier, taskId);
    return true;
  }

  async queueCancelTasks(keycard: string, identifier: string, taskIds: string[]): Promise<number> {
    const queueService = getQueueService();
    let cancelledCount = 0;
    for (const taskId of taskIds) {
      await queueService.cancelTask(keycard, identifier, taskId);
      cancelledCount++;
    }
    return cancelledCount;
  }

  async getQueueStatus(keycard: string, identifier: string): Promise<QueueStatus | null> {
    const queueService = getQueueService();
    return queueService.getStatus(keycard, identifier);
  }

  async clearQueue(keycard: string, identifier: string): Promise<void> {
    const queueService = getQueueService();
    await queueService.clear(keycard, identifier);
    await taskRepository.clearTasks(keycard, identifier);
  }

  async updateTaskConfig(
    keycard: string,
    identifier: string,
    config: { threads?: number; delayMin?: number; delayMax?: number; stopOnErrorCount?: number }
  ): Promise<void> {
    const queueService = getQueueService();
    const currentConfig = queueService.getTaskConfig(keycard, identifier);
    queueService.updateTaskConfig(keycard, identifier, {
      ...currentConfig,
      ...config,
    });
  }

  async hydrateAndSync(keycard: string, identifier: string): Promise<void> {
    const queueService = getQueueService();
    const tasks = await taskRepository.getTasks(keycard, identifier);

    for (const task of tasks) {
      if (task.status === 'Running') {
        task.status = 'Waiting';
      }
      if (task.status === 'Waiting' && task.isQueued) {
        await queueService.add(keycard, identifier, task);
      }
    }
    await taskRepository.saveTasks(keycard, identifier, tasks);
  }
}

export const taskService = new TaskService();
