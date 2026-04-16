import { type StateStorage } from 'zustand/middleware';
import { get, set, del, createStore } from 'idb-keyval';


const indexStore = createStore('auto-script', 'keyval');
export const createIndexedDBStorage = (keyPrefix: string): StateStorage => {
  return {
    getItem: async (name: string): Promise<string | null> => {
      const value = await get<string>(`${name}_${keyPrefix}`,indexStore);
      return value || null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
      await set(`${name}_${keyPrefix}`, value,indexStore);
    },
    removeItem: async (name: string): Promise<void> => {
      await del(`${name}_${keyPrefix}`,indexStore);
    },
  };
};