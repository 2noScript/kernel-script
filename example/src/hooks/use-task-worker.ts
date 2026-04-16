import { noopEngine } from '@/engines/noop.engine';
import { getIdentifierFaker } from '@/lib/utils';
import { useTestTaskStore } from '@/stores/task.store';
import { pluginTask, useWorker } from 'kernel-script';

export const useTaskWorker = useWorker({
  keycard: noopEngine.keycard,
  getIdentifier: getIdentifierFaker,
  funcs: pluginTask(useTestTaskStore),
});
