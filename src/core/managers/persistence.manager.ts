export type SerializedQueueState = {
  isRunning: boolean;
};

export type SerializedDirectState = {
  isRunning: boolean;
};

export class PersistenceManager {
  private storageKey: string;

  constructor(storageKey: string = 'QUEUE_MANAGER_STATE') {
    this.storageKey = storageKey;
  }

  async saveQueueStates(states: Record<string, SerializedQueueState>): Promise<void> {
    try {
      if (chrome.storage) {
        await chrome.storage.local.set({ [this.storageKey]: states });
      }
    } catch (e) {
      console.error('Failed to persist queue states:', e);
    }
  }

  async loadQueueStates(): Promise<Record<string, SerializedQueueState>> {
    try {
      if (chrome.storage) {
        const result = await chrome.storage.local.get(this.storageKey);
        const stored = result[this.storageKey];
        if (stored && typeof stored === 'object') {
          return stored as unknown as Record<string, SerializedQueueState>;
        }
      }
    } catch (e) {
      console.error('Failed to load queue states:', e);
    }
    return {} as Record<string, SerializedQueueState>;
  }

  async saveDirectStates(states: Record<string, SerializedDirectState>): Promise<void> {
    try {
      const directKey = `${this.storageKey}_DIRECT`;
      if (chrome.storage) {
        await chrome.storage.local.set({ [directKey]: states });
      }
    } catch (e) {
      console.error('Failed to persist direct states:', e);
    }
  }

  async loadDirectStates() {
    const directKey = `${this.storageKey}_DIRECT`;
    try {
      if (chrome.storage) {
        const result = await chrome.storage.local.get(directKey);
        const stored = result[directKey];
        if (stored && typeof stored === 'object') {
          return stored as unknown as Record<string, SerializedDirectState>;
        }
      }
    } catch (e) {
      console.error('Failed to load direct states:', e);
    }
    return {} as Record<string, SerializedDirectState>;
  }
}

export const persistenceManager = new PersistenceManager();
