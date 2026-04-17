import { noopEngine } from '@/engines/noop.engine';
import { createEngineRegistry } from 'kernel-script';

export const engineRegistry = createEngineRegistry();

engineRegistry.register(noopEngine);
