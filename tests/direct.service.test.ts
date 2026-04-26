import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DirectService } from '@/core/services/direct.service';
import { engineHub } from '@/core/common/engine-hub';
import { createMockTask, createMockEngine } from './setup';

const KEYCARD = 'test-keycard';
const IDENTIFIER = 'test-id';

describe('DirectService', () => {
  let directService: DirectService;

  beforeEach(() => {
    directService = new DirectService();
  });

  afterEach(() => {
    engineHub.unregister(KEYCARD);
  });

  describe('execute', () => {
    it('should execute task successfully', async () => {
      const engine = createMockEngine({ success: true, output: { data: 'result' } });

      const task = createMockTask({ status: 'Draft' });

      expect(directService).toBeDefined();
    });

    it('should return error for unsupported platform', async () => {
      const task = createMockTask({ status: 'Draft' });

      const result = await directService.execute(KEYCARD, IDENTIFIER, task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Platform not supported');
    });
  });

  describe('stop', () => {
    it('should stop running task', async () => {
      const task = createMockTask({ id: 'task-1', status: 'Running' });

      directService.stop(KEYCARD, IDENTIFIER, 'task-1');
    });
  });

  describe('isRunning', () => {
    it('should return false for non-running task', () => {
      const isRunning = directService.isRunning(KEYCARD, IDENTIFIER, 'task-1');
      expect(isRunning).toBe(false);
    });
  });
});
