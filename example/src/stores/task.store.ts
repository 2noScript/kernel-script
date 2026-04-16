import { createIndexedDBStorage } from '@/lib/indexed-db-storage';
import { getIdentifierFaker } from '@/lib/utils';
import { createTaskStore, type TaskStoreState } from 'kernel-script';

export type ImageGenerationConfig = {
  model: string;
  resolution: string;
  ratio: string;
  imageCount: number;
  referenceMode: string;
  seed: string;
  promptList: string;
  lockSeed: boolean;
  referenceCount: number;
  defaultReferences: string[];
};

export interface ReferenceItem {
  name: string;
  prompt?: string;
  type?: 'upload' | 'generated';
  image?: {
    userUploadedImage: { filePath?: string };
    generatedImage?: { prompt?: string };
  };
  [key: string]: unknown;
}

export interface TestTaskState {
  config: ImageGenerationConfig;
  referencesStore: ReferenceItem[];
  updateConfig: (updates: Partial<ImageGenerationConfig>) => void;
  setReferenceStore: (referencesStore: ReferenceItem[]) => void;
  addReferenceStore: (
    name: string,
    fifeUrl: string,
    type?: 'upload' | 'generated',
    prompt?: string,
    dimensions?: { width: number; height: number }
  ) => void;
  removeReferenceStore: (name: string) => void;
}

export type FxGenImageState = TaskStoreState & TestTaskState;

const DEFAULT_CONFIG: ImageGenerationConfig = {
  model: 'NARWHAL',
  resolution: '2K',
  ratio: 'LANDSCAPE',
  imageCount: 1,
  referenceMode: 'DEFAULT',
  seed: '917984',
  lockSeed: true,
  promptList: 'con cá',
  referenceCount: 10,
  defaultReferences: [],
};

const storeCache = new Map<string, any>();

export const getTestTaskStore = (identifier: string) => {
  if (!storeCache.has(identifier)) {
    const store = createTaskStore<TestTaskState>({
      name: `TEST_TASK`,
      storage: createIndexedDBStorage(`${identifier}`),
      partialize: (state) => ({
        config: state.config,
        referencesStore: state.referencesStore,
      }),
      extend: (set, _get) => ({
        config: DEFAULT_CONFIG,
        referencesStore: [],

        updateConfig: (updates: Partial<ImageGenerationConfig>) =>
          set((state: FxGenImageState) => ({
            config: { ...state.config, ...updates },
          })),

        setReferenceStore: (referencesStore: ReferenceItem[]) => set({ referencesStore }),

        addReferenceStore: (
          name: string,
          fifeUrl: string,
          type: 'upload' | 'generated' = 'upload',
          prompt?: string,
          dimensions?: { width: number; height: number }
        ) =>
          set((state: FxGenImageState) => {
            if (state.referencesStore.some((r) => r.name === name)) {
              return state;
            }
            return {
              referencesStore: [
                ...state.referencesStore,
                { name, fifeUrl, type, prompt, dimensions },
              ],
            };
          }),

        removeReferenceStore: (name: string) =>
          set((state: FxGenImageState) => ({
            referencesStore: state.referencesStore.filter((r) => r.name !== name),
          })),
      }),
    });
    storeCache.set(identifier, store);
  }

  return storeCache.get(identifier);
};

export const useTestTaskStore = getTestTaskStore(getIdentifierFaker());
