export interface SerializedQueueState {
  isPaused: boolean;
  isRunning: boolean;
}

export class PersistenceManager {
  private static STORAGE_KEY = 'queue_manager_state';

  async saveQueueStates(states: Record<string, SerializedQueueState>): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [PersistenceManager.STORAGE_KEY]: states });
      }
    } catch (e) {
      console.error('Failed to persist queue states:', e);
    }
  }

  async loadQueueStates(): Promise<Record<string, SerializedQueueState>> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const data = await chrome.storage.local.get(PersistenceManager.STORAGE_KEY);
        const stored = data[PersistenceManager.STORAGE_KEY];
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
