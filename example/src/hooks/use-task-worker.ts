import { noopEngine } from '@/engines/noop.engine';
import { useWorker } from 'kernel-script';

export const useTaskWorker = useWorker({
  engine: noopEngine,
  identifier: 'FAKE_identifier',
});
