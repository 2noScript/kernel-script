import { noopEngine } from '@/engines/noop.engine';
import { getIdentifierFaker } from '@/lib/utils';
import { useTestTaskStore } from '@/stores/task.store';
import { pluginTask, useQueue } from 'kernel-script';

export const useTaskQueue = useQueue({
  keycard: noopEngine.keycard,
  getIdentifier: getIdentifierFaker,
  funcs: pluginTask(useTestTaskStore),
});
