export type SerializedQueueState = {
  isRunning: boolean;
};

export type SerializedDirectState = {
  isRunning: boolean;
};

export class PersistenceManager {
  async saveQueueStates(states: Record<string, SerializedQueueState>): Promise<void> {
    try {
      await chrome.storage.local.set({ [`KERNEL_SCRIPT_QUEUE`]: states });
    } catch (e) {
      console.error('Failed to persist queue states:', e);
    }
  }

  async loadQueueStates(): Promise<Record<string, SerializedQueueState>> {
    try {
      const result = await chrome.storage.local.get(`KERNEL_SCRIPT_QUEUE`);
      const stored = result[`KERNEL_SCRIPT_QUEUE`];
      if (stored && typeof stored === 'object') {
        return stored as unknown as Record<string, SerializedQueueState>;
      }
    } catch (e) {
      console.error('Failed to load queue states:', e);
    }
    return {} as Record<string, SerializedQueueState>;
  }

  async saveDirectStates(states: Record<string, SerializedDirectState>): Promise<void> {
    try {
      const directKey = `KERNEL_SCRIPT__DIRECT`;
      await chrome.storage.local.set({ [directKey]: states });
    } catch (e) {
      console.error('Failed to persist direct states:', e);
    }
  }

  async loadDirectStates() {
    const directKey = `KERNEL_SCRIPT__DIRECT`;
    try {
      const result = await chrome.storage.local.get(directKey);
      const stored = result[directKey];
      if (stored && typeof stored === 'object') {
        return stored as unknown as Record<string, SerializedDirectState>;
      }
    } catch (e) {
      console.error('Failed to load direct states:', e);
    }
    return {} as Record<string, SerializedDirectState>;
  }
}

export const persistenceManager = new PersistenceManager();
