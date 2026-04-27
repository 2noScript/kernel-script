import { noopEngine } from '@/engines/noop.engine';
import { useWorker } from 'kernel-script';

export function useTaskWorker() {
  return useWorker({
    engine: noopEngine,
    identifier: 'default',
  });
}
