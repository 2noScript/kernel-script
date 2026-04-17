import { noopEngine } from '@/engines/noop.engine';
import { useTestTaskStore } from '@/stores/task.store';
import { pluginTask, useWorker } from 'kernel-script';

export const useTaskWorker = useWorker({
  engine: noopEngine,
  identifier: 'Fake_Identifier',
  funcs: pluginTask(useTestTaskStore),
});
