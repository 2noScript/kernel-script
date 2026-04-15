export interface SerializedQueueState {
  isPaused: boolean;
  isRunning: boolean;
}

export class PersistenceManager {
  private storageKey: string;

  constructor(storageKey: string = 'queue_manager_state') {
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
        const data = await chrome.storage.local.get(this.storageKey);
        const stored = data[this.storageKey];
        if (stored && typeof stored === 'object') {
          return stored as Record<string, SerializedQueueState>;
        }
      }
    } catch (e) {
      console.error('Failed to load queue states:', e);
    }
    return {} as Record<string, SerializedQueueState>;
  }
}

export const persistenceManager = new PersistenceManager();
