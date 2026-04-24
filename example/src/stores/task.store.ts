import { createTaskStore } from 'kernel-script';

export const useTestTaskStore = createTaskStore({
  keycard: 'IMAGE_GEN',
  identifier: 'FAKE_identifier',
});
